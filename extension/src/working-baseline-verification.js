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
        throw Error("Jade settings changed during review. Run Verify Working Source Baseline again.");
    };
    const capabilities = await services.client.sourceCapabilities(config);
    const baseline = capabilities?.sourceExtraction?.workingBaseline;
    if (baseline?.format !== 1 || !Array.isArray(baseline.modes) || !baseline.modes.includes("verify"))
      throw Error("Update the Jade CLI bundle to verify an existing Working source baseline. This CLI does not support verification.");
    await requireWorkingJadeGitPolicy(services.client, config);
    const working = await services.client.workingLocation(config);
    requireFolder();
    if (typeof working?.databasePath !== "string" || !working.databasePath)
      throw Error("The Jade CLI did not identify the existing Working target.");
    const choice = await vscode.window.showWarningMessage("Verify this Working database against saved workspace files?", {
      modal: true,
      detail: "Project: " + root + "\nWorking: " + working.databasePath +
        "\n\nWorking data and workspace source files stay intact. Native verification compares definitions with saved workspace files and updates its managed source-baseline proof only after a match. This verifies source provenance, not compilation or test success.",
    }, "Verify Working");
    if (choice !== "Verify Working") return cancelled();
    requireFolder();
    requireConfig();

    let lease, result, primaryError;
    try {
      lease = await services.beforeOperation();
      result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
        title: "Verifying Working source baseline", cancellable: true }, async (progress, token) => {
        requireConfig();
        if (token.isCancellationRequested) return cancelled();
        log("Verifying saved source provenance for Working: " + working.databasePath + ".");
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
        throw Error("Native Working source baseline was not verified.");
      log("Working source baseline verified. This is not compilation or test confirmation.");
      void vscode.window.showInformationMessage("Working source baseline verified; not compilation or test confirmation.");
    } else if (result?.status === "cancelled" || result?.code === 130) {
      log("Working source baseline verification cancelled. Review native cleanup details before retrying.");
    } else {
      const message = result?.report?.error || "Working source baseline verification did not complete.";
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
