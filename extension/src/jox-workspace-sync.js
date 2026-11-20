'use strict';

const command = 'jadeNative.syncWorkspaceToWorking';
const available = 'jadeNative.workspaceSyncAvailable';

function registerJoxWorkspaceSync(vscode, context, workspace) {
  const output = vscode.window.createOutputChannel('Jade Sync');
  const trusted = () => vscode.workspace.isTrusted === true;
  const selectedProject = () => workspace.projectForUri(vscode.window.activeTextEditor?.document.uri);
  let revision = 0, disposed = false;
  const setAvailable = value => vscode.commands.executeCommand('setContext', available, value);
  const refreshAvailability = async () => {
    const current = ++revision;
    await setAvailable(false);
    if (disposed || current !== revision || !trusted()) return;
    let supported;
    try { supported = (await selectedProject().provider.capability()).sync === true; }
    catch { return; }
    if (!disposed && current === revision && supported) await setAvailable(true);
  };
  const refresh = () => { void refreshAvailability().catch(error => { if (!disposed) output.appendLine(error.message); }); };

  context.subscriptions.push(output, vscode.commands.registerCommand(command, async () => {
    try {
      if (!trusted()) throw Error('Trust and open a local JOX project before syncing to Working.');
      const project = selectedProject();
      return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
        title: `Syncing ${project.folder.name} to Working`, cancellable: true }, async (_progress, token) => {
        const result = await workspace.sync(project, { token, output: text => output.append(text) });
        if (result.cancelled || result.code === 130) {
          void vscode.window.showInformationMessage('Jade sync cancelled. Check Jade Sync output before retrying.');
        } else if (result.passed === true && result.code === 0 && result.report?.inSync === true) {
          void vscode.window.showInformationMessage(`Working is up to date with the saved JOX snapshot for ${project.folder.name}.`);
        } else {
          throw Error(result.report?.error || 'The Jade CLI did not confirm that Working is in sync.');
        }
        return result;
      });
    } catch (error) {
      if (error.cancelled || error.result?.cancelled || error.result?.code === 130) {
        void vscode.window.showInformationMessage('Jade sync cancelled.');
        return;
      }
      output.appendLine(error.message);
      const action = await vscode.window.showErrorMessage(`Jade sync: ${error.message}`, 'Show Output');
      if (action === 'Show Output') output.show(true);
    }
  }), { dispose() { disposed = true; ++revision; void setAvailable(false); } });
  for (const event of [vscode.window.onDidChangeActiveTextEditor, vscode.workspace.onDidChangeWorkspaceFolders, vscode.workspace.onDidGrantWorkspaceTrust])
    if (event) context.subscriptions.push(event(refresh));
  refresh();
}

module.exports = { registerJoxWorkspaceSync };
