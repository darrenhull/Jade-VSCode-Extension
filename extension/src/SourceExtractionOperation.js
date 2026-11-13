"use strict";
const path = require("node:path");
const { DEFAULT_EXTRACTION_TIMEOUT_SECONDS } = require("./extract");
const { selectedSourcePaths } = require("./source-pull-path");
const { sourceArtifact } = require("./source-extraction-artifact");
const outcomes = new Set([
  "added",
  "updated",
  "unchanged",
  "keptLocal",
  "conflict",
  "rejected",
]);
const stages = new Set([
  "opening",
  "inventory",
  "git-baseline",
  "local-snapshot",
  "hash-and-compare",
  "guarded-apply",
  "native-write",
  "reconcile",
  "closing",
]);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const token = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 512 &&
  !/[\x00-\x20\x7f]/.test(value);
const key = (value) =>
  typeof value === "string"
    ? value.replaceAll(String.fromCharCode(92), "/").toLowerCase()
    : undefined;

/** One client-promoted native extraction, bound to its original stdio client. */
class SourceExtractionOperation {
  constructor(
    session,
    config,
    {
      destination,
      selection,
      baselineReceipt,
      cwd,
      scope = "classes",
      schemas,
      version = "current",
    },
    callbacks = {},
  ) {
    if (version !== "current")
      throw Error(
        "Streaming extraction currently supports the current source version only.",
      );
    const full = scope !== "classes";
    if (
      !["classes", "schemas", "all"].includes(scope) ||
      !path.isAbsolute(destination) ||
      (full &&
        (selection !== undefined ||
          (scope === "all" && schemas !== undefined))) ||
      (!full && (!Array.isArray(selection) || !selection.length)) ||
      (scope === "schemas" &&
        (!Array.isArray(schemas) ||
          !schemas.length ||
          schemas.some((value) => typeof value !== "string" || !value)))
    )
      throw Error(
        "Choose a destination and a valid native class, schema or all-schemas scope.",
      );
    this.scope = scope;
    this.full = full;
    this.destination = destination;
    this.schemas =
      scope === "schemas"
        ? new Set(schemas.map((value) => value.toLowerCase()))
        : undefined;
    this.seenFiles = new Set();
    this.inventoryKnown = !full;
    if (typeof callbacks.onPermit !== "function")
      throw Error(
        "Native extraction requires an editor promotion-permission handler.",
      );
    this.session = session;
    this.callbacks = callbacks;
    this.remaining = new Set();
    for (const item of selection || []) {
      if (
        !item ||
        !["class", "interface"].includes(item.kind) ||
        typeof item.schema !== "string" ||
        typeof item.name !== "string" ||
        typeof item.path !== "string" ||
        this.remaining.has(key(item.path))
      )
        throw Error(
          "Source selection must contain unique class/interface paths.",
        );
      this.remaining.add(key(item.path));
    }
    this.allowed = full
      ? undefined
      : new Set(selectedSourcePaths(selection).map(key));
    this.total = full ? Infinity : this.allowed.size;
    this.expectedTotal = full ? 0 : selection.length;
    this.started = false;
    this.stopped = false;
    this.observedFiles = 0;
    this.observedCounts = {};
    this.seenTickets = new Set();
    this.request = session.request(
      "source.extract",
      {
        config: { ...config, extractionTimeoutSeconds: config?.extractionTimeoutSeconds ?? DEFAULT_EXTRACTION_TIMEOUT_SECONDS },
        destination,
        ...(cwd ? { cwd } : {}),
        ...(full ? { scope, ...(schemas ? { schemas } : {}) } : { selection }),
        version,
        promotion: "client",
        ...(baselineReceipt ? { baselineReceipt } : {}),
      },
      (text) => this.notify("onOutput", text),
      (packet) => this.receive(packet),
    );
    this.id = this.request.id;
    this.completion = this.request.promise.then(
      (result) => this.finish(result),
      (error) => ({
        passed: false,
        code: 2,
        status: "failed",
        scope: this.scope,
        version: "current",
        authoritative: false,
        partial: this.started,
        indeterminate: this.started,
        counts: this.observedCounts,
        completedFiles: this.observedFiles,
        report: { error: error.message },
      }),
    );
  }

  notify(name, packet) {
    // Rendering is presentation-only. Permission handling below is fail-closed.
    try {
      this.callbacks[name]?.(packet);
    } catch {}
  }

  send(command, body, requireAcceptance = false) {
    try {
      const control = this.session.request(
        command,
        body,
        undefined,
        undefined,
        this.request.client,
      );
      void control.promise.then(
        (result) => {
          if (requireAcceptance && result?.passed === false)
            this.fail(
              Error(
                result.report?.error ||
                  "Native source permission was rejected.",
              ),
            );
        },
        (error) => {
          if (requireAcceptance) this.fail(error);
        },
      );
    } catch (error) {
      if (requireAcceptance) this.fail(error);
    }
  }

  fail(error) {
    this.failure ||= error;
    this.stop();
  }

  receive(packet) {
    try {
      if (packet.event === "source.started") {
        if (
          this.started ||
          !token(packet.lease) ||
          packet.scope !== this.scope ||
          packet.authoritative !== false
        )
          throw Error("Invalid native extraction ownership or scope.");
        this.started = true;
        this.lease = packet.lease;
        this.notify("onStarted", packet);
        if (this.stopped) this.send("source.cancel", { lease: this.lease });
      } else if (packet.event === "source.stage") {
        if (
          !this.started ||
          !stages.has(packet.stage) ||
          !integer(packet.completedFiles) ||
          !integer(packet.totalFiles) ||
          packet.completedFiles > packet.totalFiles ||
          packet.totalFiles > this.total
        )
          throw Error("Invalid native extraction progress.");
        if (packet.stage === "inventory") this.inventoryKnown = true;
        this.expectedTotal = Math.max(this.expectedTotal, packet.totalFiles);
        this.notify("onStage", packet);
      } else if (packet.event === "source.permitRequired") {
        const ticketKey = typeof packet.ticket + ":" + packet.ticket;
        const validTicket = token(packet.ticket) && packet.ticket.length <= 128;
        if (
          !this.started ||
          packet.lease !== this.lease ||
          !validTicket ||
          this.seenTickets.has(ticketKey) ||
          this.pendingPermit ||
          !(this.full
            ? !this.seenFiles.has(key(packet.path))
            : this.allowed.has(key(packet.path))) ||
          !integer(packet.expiresInMs) ||
          packet.expiresInMs < 1 ||
          packet.expiresInMs > 30000
        )
          throw Error("Invalid, stale or foreign native promotion permit.");
        const artifactKey = this.full
          ? sourceArtifact(
              this.destination,
              packet.path,
              packet.artifact,
              this.schemas,
            )
          : undefined;
        this.seenTickets.add(ticketKey);
        let allow = false;
        if (!this.stopped) {
          try {
            // Deliberately synchronous: no await between the live editor check
            // and writing its reply onto this operation's original connection.
            const decision = this.callbacks.onPermit(packet);
            if (typeof decision !== "boolean")
              throw Error(
                "Source permission must be a synchronous editor decision.",
              );
            allow = decision;
          } catch (error) {
            this.fail(error);
          }
        }
        allow = allow && !this.stopped;
        this.pendingPermit = { path: key(packet.path), allow, artifactKey };
        this.send(
          "source.permit",
          { lease: this.lease, ticket: packet.ticket, allow },
          true,
        );
      } else if (packet.event === "source.file") {
        const fileKey = key(packet.path);
        if (
          !this.started ||
          !(this.full
            ? !this.seenFiles.has(fileKey)
            : this.allowed.has(fileKey)) ||
          !outcomes.has(packet.outcome) ||
          !/^[a-fA-F0-9]{64}$/.test(packet.sha256 || "") ||
          !integer(packet.bytes)
        )
          throw Error("Invalid native source-file outcome.");
        const artifactKey = this.full
          ? sourceArtifact(
              this.destination,
              packet.path,
              packet.artifact,
              this.schemas,
            )
          : undefined;
        if (
          this.pendingPermit &&
          (this.pendingPermit.path !== fileKey ||
            this.pendingPermit.artifactKey !== artifactKey)
        )
          throw Error(
            "Native file completion does not match its pending permission.",
          );
        if (
          ["added", "updated"].includes(packet.outcome) &&
          (!this.pendingPermit || !this.pendingPermit.allow)
        )
          throw Error(
            "Native source was promoted without this client's permission.",
          );
        this.remaining.delete(fileKey);
        this.allowed?.delete(fileKey);
        this.seenFiles.add(fileKey);
        this.pendingPermit = undefined;
        this.observedFiles++;
        this.observedCounts[packet.outcome] =
          (this.observedCounts[packet.outcome] || 0) + 1;
        this.notify("onFile", packet);
      } else throw Error("Unknown native source extraction event.");
    } catch (error) {
      this.fail(error);
    }
  }

  finish(result) {
    if (
      !result ||
      typeof result.passed !== "boolean" ||
      !Number.isInteger(result.code) ||
      !["completed", "cancelled", "failed"].includes(result.status) ||
      result.scope !== this.scope ||
      result.version !== "current" ||
      (this.full
        ? typeof result.authoritative !== "boolean" ||
          result.authoritative !==
            (result.passed &&
              result.code === 0 &&
              result.status === "completed")
        : result.authoritative !== false) ||
      typeof result.partial !== "boolean" ||
      !integer(result.completedFiles) ||
      !result.counts ||
      typeof result.counts !== "object" ||
      Array.isArray(result.counts)
    )
      return this.failedResult(
        "Native extraction returned an incomplete result.",
        result,
      );
    if (
      Object.values(result.counts).some((value) => !integer(value)) ||
      result.completedFiles !== this.observedFiles ||
      [...outcomes].some(
        (outcome) =>
          (result.counts[outcome] || 0) !== (this.observedCounts[outcome] || 0),
      ) ||
      (result.passed &&
        (!this.inventoryKnown ||
          this.remaining.size > 0 ||
          this.pendingPermit ||
          this.observedFiles !== this.expectedTotal))
    )
      return this.failedResult(
        "Native extraction result does not match received file outcomes.",
        result,
      );
    if (this.failure && result.passed)
      return this.failedResult(this.failure.message, result);
    return this.failure
      ? { ...result, clientError: this.failure.message }
      : result;
  }

  failedResult(message, nativeResult) {
    return {
      passed: false,
      code: nativeResult?.passed === false ? nativeResult.code : 2,
      status: "failed",
      scope: this.scope,
      version: "current",
      authoritative: false,
      partial: this.started,
      indeterminate: this.started,
      counts: this.observedCounts,
      completedFiles: this.observedFiles,
      report: {
        error: nativeResult?.report?.error || message,
        ...Object.fromEntries(
          ["reason", "schema", "path"]
            .filter(
              (field) => typeof nativeResult?.report?.[field] === "string",
            )
            .map((field) => [field, nativeResult.report[field]]),
        ),
      },
      clientError: message,
    };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.lease) this.send("source.cancel", { lease: this.lease });
    else if (this.request)
      this.send("cancel", { operationId: this.request.id });
  }
}
module.exports = { SourceExtractionOperation };
