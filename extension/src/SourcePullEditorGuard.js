"use strict";
const path = require("node:path");
const { sourceTargetPath } = require("./source-pull-path");

/** Editor-only protection for one native file candidate at a time. */
class SourcePullEditorGuard {
  constructor({
    workspace,
    destination,
    onInvalidated,
    pendingSources,
    selectedPaths = [],
  }) {
    this.workspace = workspace;
    this.destination = path.resolve(destination);
    this.onInvalidated = onInvalidated;
    this.pendingSources = pendingSources;
    this.documents = new Map();
    this.active = undefined;
    this.invalidated = false;
    this.disposed = false;
    this.subscriptions = [];
    this.scope = new Set(
      selectedPaths.map((relative) => this.targetKey(relative)),
    );
    for (const document of workspace.textDocuments) this.observe(document);
    if (pendingSources?.onDidChange)
      this.subscriptions.push(
        pendingSources.onDidChange((event) => {
          if (
            event.pending &&
            (path.resolve(event.path).toLowerCase() === this.active ||
              this.scope.has(path.resolve(event.path).toLowerCase()))
          )
            this.invalidate(
              "An approved source target has an unsubmitted class-view draft.",
            );
        }),
      );
    this.subscriptions.push(
      workspace.onDidOpenTextDocument((document) => this.observe(document)),
      workspace.onDidChangeTextDocument((event) =>
        this.observe(event.document),
      ),
      workspace.onDidCloseTextDocument((document) => {
        const key = this.documentKey(document);
        if (key && this.documents.get(key) === document)
          this.documents.delete(key);
      }),
    );
  }

  documentKey(document) {
    return document?.uri?.scheme === "file" &&
      typeof document.uri.fsPath === "string"
      ? path.resolve(document.uri.fsPath).toLowerCase()
      : undefined;
  }

  observe(document) {
    if (this.disposed) return;
    const key = this.documentKey(document);
    if (!key) return;
    this.documents.set(key, document);
    // Native disk reloads can emit clean changes. Only unsaved buffer changes
    // invalidate a granted permit; the CLI independently rechecks saved bytes.
    if ((key === this.active || this.scope.has(key)) && document.isDirty)
      this.invalidate("An approved source target has unsaved editor changes.");
  }

  targetKey(relative) {
    return sourceTargetPath(this.destination, relative).toLowerCase();
  }

  invalidate(reason) {
    if (this.invalidated) return;
    this.invalidated = true;
    this.onInvalidated(reason);
  }

  approve(relative) {
    if (this.disposed || this.invalidated) return false;
    const key = this.targetKey(relative);
    if (this.active) {
      this.invalidate("Overlapping source permits are not allowed.");
      return false;
    }
    // Keep live TextDocument references; this is a current-state check with no
    // all-editor rescan or source-text copy for each of 30,000 incoming files.
    if (
      this.documents.get(key)?.isDirty ||
      this.pendingSources?.hasPending(key)
    )
      return false;
    this.active = key;
    return true;
  }

  complete(relative) {
    const key = this.targetKey(relative);
    this.scope.delete(key);
    if (!this.active) return;
    if (key !== this.active) {
      this.invalidate("Source completion does not match its approved target.");
      return;
    }
    this.active = undefined;
  }

  nativeClosed() {
    this.active = undefined;
  }

  dispose() {
    if (this.disposed) return;
    if (this.active)
      this.invalidate("Source editor guard was closed before file completion.");
    this.disposed = true;
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions = [];
    this.documents.clear();
    this.scope.clear();
    this.active = undefined;
  }
}
module.exports = { SourcePullEditorGuard };
