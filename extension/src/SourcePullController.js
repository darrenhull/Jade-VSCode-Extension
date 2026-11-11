"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { resolveSourcePullProject } = require("./source-pull-project");
const { SourcePullEditorGuard } = require("./SourcePullEditorGuard");
const { resolveSourcePullSelection } = require("./source-pull-selection");
const { readSelectedBaselineReceipt } = require("./source-baseline-receipt");
const { sourceTargetPath, selectedSourcePaths } = require("./source-pull-path");
const { elapsedLabel } = require("./pull-progress");
const stageLabels = {
  opening: "Opening Source",
  inventory: "Selecting class sources",
  "native-write": "Writing native class sources",
  reconcile: "Checking local source changes",
  closing: "Closing Source",
};

/** VS Code presentation and editor permissions for native source scopes. */
class SourcePullController {
  constructor(vscode, context, services) {
    this.vscode = vscode;
    this.context = context;
    this.services = services;
    this.output = vscode.window.createOutputChannel("Jade Source Pull");
    this.active = new Set();
    this.disposed = false;
  }

  runAll(folder) {
    return this.vscode.window.withProgress(
      {
        location: this.vscode.ProgressLocation.Notification,
        title: "Extracting all Source schemas",
        cancellable: true,
      },
      (progress, token) =>
        this.run(folder, {
          scope: "all",
          preparationProgress: progress,
          preparationToken: token,
        }),
    );
  }

  async run(
    resource,
    { scope = "classes", preparationProgress, preparationToken } = {},
  ) {
    const full = scope !== "classes";
    let refreshAll = false,
      ownsRun = false;
    const preparing = (message) => {
      try {
        preparationProgress?.report({ message });
      } catch {}
    };
    const cancelledBeforeStart = () =>
      preparationToken?.isCancellationRequested || this.disposed;
    const labels = full
      ? {
          ...stageLabels,
          inventory: "Discovering complete Source inventory",
          "native-write": "Writing native Source files",
        }
      : stageLabels;
    const { vscode, services, output } = this;
    const log = (text) => {
      try {
        output.appendLine(text);
      } catch {}
    };
    let locked = false,
      release,
      guard,
      operation,
      result,
      resolved;
    const refreshPaths = new Set();
    let expectedFiles = 0;
    try {
      if (this.disposed) throw Error("Source pull is closed.");
      if (this.running)
        throw Error("A Source extraction is already preparing or running.");
      this.running = true;
      ownsRun = true;
      preparing("Checking native Source extraction support…");
      if (services.isBusy())
        throw Error(
          "Wait for the current Jade operation before extracting Source files.",
        );
      resolved = await (
        full
          ? services.resolveProject || resolveSourcePullProject
          : services.resolve || resolveSourcePullSelection
      )(vscode, resource, services.settings, {
        prepareSource: services.prepareSource,
      });
      const { folder, config, destination, selection } = resolved;
      expectedFiles = full ? undefined : selection.length;
      const capabilities = await services.service.sourceCapabilities(
        config,
        full ? { cwd: resolved.cwd } : undefined,
      );
      const capability = capabilities?.sourceExtraction;
      if (
        capability?.protocol !== 1 ||
        !capability.scopes?.includes(scope) ||
        (full &&
          (capability.fullSchema !== true || capability.available !== true)) ||
        capability.requiresPromotionPermit !== true ||
        !capability.versions?.includes("current")
      )
        throw Error(
          "The bundled Jade CLI does not support this native streaming scope (complete schemas require full-schema support). Update Jade Tools; no batch fallback was run.",
        );
      let baselineReceipt, baselineWarning;
      try {
        if (!full)
          baselineReceipt = readSelectedBaselineReceipt({
            storageDirectory: this.context.globalStorageUri.fsPath,
            destination,
            sourceDatabasePath: config.databasePath,
            selection,
          });
      } catch (error) {
        baselineWarning = error.message;
      }
      if (cancelledBeforeStart())
        return {
          passed: false,
          code: 130,
          status: "cancelled",
          scope,
          version: "current",
          authoritative: false,
          partial: false,
          counts: {},
          completedFiles: 0,
        };
      if (full) fs.mkdirSync(destination, { recursive: true });
      preparing("Finishing the previous Jade operation…");
      await services.beforeOperation();
      if (services.isBusy())
        throw Error(
          "Another Jade operation started. Try the source pull again when it finishes.",
        );
      await services.setBusy(true);
      locked = true;
      preparing("Preparing source editor indexes…");
      release = await services.index.pauseDiskUpdates();
      output.clear();
      output.show(true);
      log(
        full
          ? "Extracting all user schema sources from Source (current version)."
          : "Pulling selected class/interface sources from Source (current version).",
      );
      log(
        full
          ? "Complete schema source scope; native per-file updates retain local edits. Missing files are never deleted."
          : "Class-only scope: complete schema resources and deletion detection are not included.",
      );
      log(
        "Source: " +
          (config.databasePath || "resolved by native project configuration"),
      );
      log("Destination: " + destination);
      if (baselineWarning)
        log(
          "Saved remote baseline not imported: " +
            baselineWarning +
            ". Native conflict protection remains in effect.",
        );
      if (baselineReceipt)
        log(
          "Using " +
            baselineReceipt.files.length +
            " selected saved remote baseline receipt(s).",
        );
      let cancelledEarly = false,
        firstConflict;
      guard = new SourcePullEditorGuard({
        workspace: vscode.workspace,
        destination,
        pendingSources: services.pendingSources && {
          hasPending: (file) => services.pendingSources.hasPending?.(file),
          hasPendingArtifact: (artifact) =>
            services.pendingSources.hasPendingArtifact?.(
              artifact,
              folder.uri.toString(),
            ),
          onDidChange: (listener) =>
            services.pendingSources.onDidChange((event) => {
              if (
                !event.projectId ||
                event.projectId.toLowerCase() ===
                  folder.uri.toString().toLowerCase()
              )
                listener(event);
            }),
        },
        selectedPaths: full ? [] : selectedSourcePaths(selection),
        onInvalidated: (reason) => {
          log(reason);
          cancelledEarly = true;
          operation?.stop();
        },
      });
      const withNativeProgress = preparationProgress
        ? async (_options, task) => task(preparationProgress, preparationToken)
        : vscode.window.withProgress.bind(vscode.window);
      result = await withNativeProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: full
            ? "Extracting all Source schemas"
            : "Pulling class sources from Source",
          cancellable: true,
        },
        async (progress, token) => {
          const now = services.now || (() => performance.now()),
            start = now(),
            durations = new Map();
          let stage = "opening",
            stageStart = start,
            lastReport = -Infinity,
            completed = 0,
            observedFiles = 0,
            conflictsShown = 0;
          const report = (force) => {
            if (!force && now() - lastReport < 250) return;
            lastReport = now();
            try {
              progress.report({
                message:
                  labels[stage] +
                  " · " +
                  completed.toLocaleString() +
                  (expectedFiles === undefined
                    ? " files processed"
                    : "/" +
                      expectedFiles.toLocaleString() +
                      (full
                        ? " native files processed"
                        : " selected files processed")) +
                  " · " +
                  elapsedLabel(now() - start) +
                  " elapsed",
              });
            } catch {}
          };
          const stageChanged = (value) => {
            const time = now();
            durations.set(
              stage,
              (durations.get(stage) || 0) + Math.max(0, time - stageStart),
            );
            stage = value;
            stageStart = time;
            report(false);
          };
          const timer = setInterval(() => {
            try {
              report(true);
            } catch {}
          }, 1000);
          timer.unref?.();
          const subscription = token.onCancellationRequested(() => {
            cancelledEarly = true;
            operation?.stop();
          });
          const folderSubscription =
            vscode.workspace.onDidChangeWorkspaceFolders((event) => {
              if (
                event.removed.some(
                  (value) => value.uri.toString() === folder.uri.toString(),
                )
              ) {
                cancelledEarly = true;
                operation?.stop();
              }
            });
          try {
            report(true);
            if (cancelledEarly || token.isCancellationRequested)
              return {
                passed: false,
                code: 130,
                status: "cancelled",
                scope,
                version: "current",
                authoritative: false,
                partial: false,
                counts: {},
                completedFiles: 0,
              };
            operation = services.service.startSourceExtraction(
              config,
              {
                destination,
                ...(full
                  ? { scope, cwd: resolved.cwd }
                  : { selection, baselineReceipt }),
                version: "current",
              },
              {
                onOutput: (text) => output.append(text),
                onStarted: () => report(false),
                onStage: (event) => {
                  completed = event.completedFiles;
                  if (!full || event.stage !== "opening")
                    expectedFiles = event.totalFiles;
                  stageChanged(event.stage);
                },
                onPermit: (event) =>
                  !cancelledEarly &&
                  !token.isCancellationRequested &&
                  guard.approve(event.path, event.artifact),
                onFile: (event) => {
                  guard.complete(event.path);
                  if (event.outcome === "conflict" && !firstConflict)
                    firstConflict = event.path;
                  observedFiles++;
                  completed = Math.max(completed, observedFiles);
                  if (["added", "updated"].includes(event.outcome))
                    refreshPaths.add(event.path);
                  if (
                    ["conflict", "rejected", "keptLocal"].includes(
                      event.outcome,
                    ) &&
                    conflictsShown++ < 20
                  )
                    log(event.outcome + ": " + event.path);
                  report(false);
                },
              },
            );
            this.active.add(operation);
            if (cancelledEarly || token.isCancellationRequested)
              operation.stop();
            const native = await operation.completion;
            if (!native.indeterminate) guard.nativeClosed();
            if (
              native.status !== "completed" ||
              native.indeterminate ||
              native.report?.outcomesUncertain
            )
              for (const relative of full ? [] : selectedSourcePaths(selection))
                refreshPaths.add(relative);
            if (
              full &&
              (native.indeterminate || native.report?.outcomesUncertain)
            )
              refreshAll = true;
            completed = native.completedFiles;
            report(true);
            return native;
          } finally {
            clearInterval(timer);
            subscription.dispose();
            folderSubscription.dispose();
            durations.set(
              stage,
              (durations.get(stage) || 0) + Math.max(0, now() - stageStart),
            );
            for (const [name, milliseconds] of durations)
              log(
                labels[name] +
                  ": " +
                  Math.round(milliseconds) +
                  " ms (client event timing)",
              );
            if (operation) this.active.delete(operation);
          }
        },
      );
      const counts = result.counts || {},
        written = (counts.added || 0) + (counts.updated || 0);
      if (result.indeterminate || result.report?.outcomesUncertain)
        log(
          "Native outcome uncertain: counts below are acknowledged outcomes only; additional files may already have changed.",
        );
      log(
        "Result: " +
          result.status +
          " · " +
          result.completedFiles +
          "/" +
          (expectedFiles ?? "unknown") +
          (full
            ? " native files processed · "
            : " selected files processed · ") +
          written +
          " written · " +
          (counts.conflict || 0) +
          " conflicts · " +
          (counts.rejected || 0) +
          " rejected.",
      );
      if (result.report?.error) log(result.report.error);
      if (result.indeterminate || result.report?.outcomesUncertain)
        void vscode.window.showWarningMessage(
          "Source connection closed before confirmation. Some files may already have changed; the selected source scope will be refreshed. See Jade Source Pull.",
        );
      else if (result.status === "cancelled")
        void vscode.window.showInformationMessage(
          "Source pull cancelled after " +
            result.completedFiles +
            " selected file(s). Already-applied files are retained.",
        );
      else if (counts.conflict || counts.rejected)
        void vscode.window
          .showWarningMessage(
            "Local files were retained: " +
              (counts.conflict || 0) +
              " conflict(s), " +
              (counts.rejected || 0) +
              " editor rejection(s). Save/discard unsaved edits or review and keep/move conflicting local files before retrying. This pull does not force replacement.",
            ...(firstConflict ? ["Open Local File"] : []),
            "Show Source Pull Log",
          )
          .then((choice) => {
            if (choice === "Show Source Pull Log") {
              try {
                output.show(true);
              } catch {}
            } else if (choice === "Open Local File")
              return vscode.window.showTextDocument(
                vscode.Uri.file(sourceTargetPath(destination, firstConflict)),
                { preview: false },
              );
          })
          .catch((error) =>
            log("Could not open source-pull guidance: " + error.message),
          );
      else if (!result.passed)
        void vscode.window.showErrorMessage(
          "Source pull failed (" +
            result.code +
            "): " +
            (result.report?.error || "See Jade Source Pull output."),
        );
      else
        void vscode.window.showInformationMessage(
          (full
            ? "Source extraction complete: "
            : "Selected class sources pulled: ") +
            written +
            " written, " +
            (counts.unchanged || 0) +
            " unchanged, " +
            (counts.keptLocal || 0) +
            " local edits kept.",
        );
      return result;
    } catch (error) {
      if (operation) {
        operation.stop();
        const native = await operation.completion;
        if (!native.indeterminate) guard?.nativeClosed();
        for (const relative of full
          ? []
          : selectedSourcePaths(resolved.selection))
          refreshPaths.add(relative);
        if (full) refreshAll = true;
        log("Source pull presentation failed: " + error.message);
        return { ...native, clientError: error.message };
      }
      log("Source pull failed: " + error.message);
      void vscode.window.showErrorMessage(error.message);
      return {
        passed: false,
        code: 2,
        status: "failed",
        scope,
        authoritative: false,
        partial: operation?.started === true,
        indeterminate: operation?.started === true,
        report: { error: error.message },
      };
    } finally {
      // Confirmed native results follow close. A lost transport stays explicitly
      // indeterminate; refresh its selected scope conservatively, without a retry.
      guard?.dispose();
      if (release) {
        try {
          for (const relative of refreshPaths) {
            const uri = vscode.Uri.file(
              sourceTargetPath(resolved.destination, relative),
            );
            if (vscode.workspace.getWorkspaceFolder(uri))
              services.index.schedule(uri.toString());
          }
          if (refreshAll) await services.index.rescan();
          await release();
          await services.testing.discover(false);
          await services.classView.refresh({ rescan: false });
        } catch (error) {
          log("Source indexing refresh failed: " + error.message);
        }
      }
      try {
        if (locked) await services.setBusy(false);
      } finally {
        if (ownsRun) this.running = false;
      }
    }
  }

  dispose() {
    this.disposed = true;
    const operations = [...this.active];
    for (const operation of operations) operation.stop();
    return Promise.allSettled(
      operations.map((operation) => operation.completion),
    );
  }
}
function registerSourcePull(vscode, context, services) {
  const controller = new SourcePullController(vscode, context, services);
  context.subscriptions.push(
    controller.output,
    controller,
    vscode.commands.registerCommand(
      "jadeNative.pullSelectedClassFromSource",
      (resource) => controller.run(resource),
    ),
  );
  return controller;
}
module.exports = { SourcePullController, registerSourcePull };
