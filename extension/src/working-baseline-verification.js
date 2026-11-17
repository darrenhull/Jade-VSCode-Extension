"use strict";
const { isDeepStrictEqual } = require("node:util");
const { requireWorkingJadeGitPolicy } = require("./working-jadegit-policy");

/** Presents native verification of an existing Working copy; never publishes files. */
function registerWorkingBaselineVerification(vscode, context, services) {
  const output = vscode.window.createOutputChannel("Jade Working Baseline");
  let pending, active, disposed = false;
  const cancelled = () => ({ passed: false, code: 130, cancelled: true, status: "cancelled" });
  const log = message => { output.show(true); output.appendLine(message); };

  async function run(resource) {
    if (disposed) return cancelled();
    const folders = vscode.workspace.workspaceFolders || [];
    let folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
    if (resource && !folder) throw Error("Choose an open Jade project folder.");
    if (!folder) folder = folders.length === 1 ? folders[0] :
      (await vscode.window.showQuickPick(folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
        { title: "Verify Working source baseline · choose project" }))?.folder;
    if (!folder) return cancelled();
    if (folder.uri.scheme !== "file") throw Error("Choose a local Jade project folder.");
    const root = folder.uri.fsPath;
    const requireFolder = () => {
      if (disposed || vscode.workspace.getWorkspaceFolder(folder.uri)?.uri.fsPath !== root)
        throw Error("The selected project closed. Run Verify Working Source Baseline again.");
    };
    requireFolder();
    const config = { ...services.configFor(folder) };
    if (config.workspaceRoots) config.workspaceRoots = [...config.workspaceRoots];
    const requireConfig = () => {
      requireFolder();
      if (!isDeepStrictEqual(config, services.configFor(folder)))
        throw Error("Jade settings changed. Run Verify Working Source Baseline again.");
    };
    const capabilities = await services.client.sourceCapabilities(config);
    const baseline = capabilities?.sourceExtraction?.workingBaseline;
    if (baseline?.format !== 1 || !Array.isArray(baseline.modes) || !baseline.modes.includes("verify"))
      throw Error("Update the Jade CLI bundle to compare saved source files with an existing Working copy. This CLI does not support verification.");
    await requireWorkingJadeGitPolicy(services.client, config);
    const working = await services.client.workingLocation(config);
    requireFolder();
    if (typeof working?.databasePath !== "string" || !working.databasePath)
      throw Error("The Jade CLI did not identify the existing Working target.");
    requireConfig();

    let lease, result, primaryError;
    try {
      lease = await services.beforeOperation();
      result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
        title: "Checking saved source files · " + working.databasePath, cancellable: true }, async (progress, token) => {
        requireConfig();
        if (token.isCancellationRequested) return cancelled();
        log("Comparing saved source files with Working: " + working.databasePath + ". Working data and workspace files stay intact.");
        const operation = services.client.startWorkingBaselineVerification(config,
          { destination: root, cwd: root, scope: "all" }, {
            onOutput: text => output.append(text),
            onStage: packet => progress.report({ message: packet.stage + " · " + packet.completedFiles + "/" + packet.totalFiles }),
          });
        active = operation;
        const subscription = token.onCancellationRequested(() => operation.stop());
        if (token.isCancellationRequested || disposed) operation.stop();
        try {
          // A late cancellation can be refused after commit: the terminal native result wins.
          return await operation.completion;
        } finally {
          subscription.dispose();
          if (active === operation) active = undefined;
        }
      });
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      if (lease !== undefined) {
        try { await services.afterOperation(lease); }
        catch (error) {
          if (!result) {
            if (!primaryError) throw error;
            primaryError.message += " Operation guard cleanup failed: " + error.message;
          }
          else result = { ...result, cleanupError: error.message };
          log("Operation guard cleanup failed: " + error.message);
        }
      }
    }
    if (result?.passed === true) {
      if (result.code !== 0 || result.workingBaseline?.status !== "verified" ||
          result.workingBaseline.origin !== "same-generation-native-extraction" ||
          result.workingBaseline.scope !== "all" || result.workingBaseline.identity == null)
        throw Error("The Jade CLI did not confirm that saved source files match this Working copy.");
      log("Saved source files match this Working copy.");
      void vscode.window.showInformationMessage("Saved source files match this Working copy.");
    } else if (result?.status === "cancelled" || result?.code === 130) {
      log(result.report?.error || "Working source comparison cancelled.");
    } else {
      const message = result?.report?.error || "Working source comparison did not complete.";
      log(message); void vscode.window.showErrorMessage(message);
    }
    return result;
  }

  function verify(resource) {
    if (pending) return pending;
    pending = run(resource).catch(error => {
      log(error.message); void vscode.window.showErrorMessage(error.message);
      return { passed: false, code: 2, error: error.message };
    }).finally(() => { pending = undefined; });
    return pending;
  }
  function dispose() { disposed = true; active?.stop(); }
  context.subscriptions.push(output,
    vscode.commands.registerCommand("jadeNative.verifyWorkingSourceBaseline", verify), { dispose });
  return { verify, dispose };
}
module.exports = { registerWorkingBaselineVerification };
