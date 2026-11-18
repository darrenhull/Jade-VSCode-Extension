'use strict';
const { jadeSourceUri } = require('./active-jade-source');
function registerNativeSourceCommands(vscode, context, workspace, testing, { reportDiagnostic = () => {} } = {}) {
  const output = vscode.window.createOutputChannel('Jade Compile');
  context.subscriptions.push(output);
  const source = value => {
    if (value?.project && value.entity?.id) {
      if (workspace.project(value.project.folder) !== value.project) throw Error('The selected source project changed.');
      return { project: value.project, entityId: value.entity.id };
    }
    const uri = jadeSourceUri(vscode, value);
    if (uri?.scheme !== 'jade-source') throw Error('Open a source member from Object Explorer first.');
    const { project, document } = workspace.record(uri);
    return { project, entityId: document.entityId, uri };
  };
  const build = async value => {
    const selected = source(value);
    output.show(true);
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Building saved Jade changes', cancellable: true }, async (_progress, token) => {
      const result = await workspace.execute(selected.project, 'build', { entityIds: [selected.entityId] }, { token, output: text => output.append(text) });
      reportDiagnostic(selected.project, result);
      if (result.report?.error) output.appendLine(result.report.error);
      return result;
    });
  };
  for (const command of ['jadeNative.compileClass', 'jadeNative.buildWorkspace', 'jadeNative.checkFile'])
    context.subscriptions.push(vscode.commands.registerCommand(command, build));
  const runTests = async (value, methods) => {
    const selected = source(value);
    if (!testing.runFile) throw Error('Jade test discovery is unavailable in this host.');
    return testing.runFile(selected.uri || await selected.project.files.open(selected.entityId), methods);
  };
  for (const command of ['jadeNative.runLocalTests', 'jadeNative.executeLocalTests'])
    context.subscriptions.push(vscode.commands.registerCommand(command, runTests));
  // Keep unqualified actions explicit rather than falling through to the CLS
  // loader, legacy baseline pipeline or a different database target.
  const unavailable = new Map([
    ['jadeNative.publishClass', 'JOX publication is not yet supported by the bundled native provider.'],
    ['jadeNative.publishWorkspace', 'JOX publication is not yet supported by the bundled native provider.'],
    ['jadeNative.publishChangedFiles', 'JOX publication is not yet supported by the bundled native provider.'],
    ['jadeNative.pullSelectedClassFromSource', 'JOX extraction is not yet supported by the bundled native provider.'],
    ['jadeNative.extractAllSources', 'JOX extraction is not yet supported by the bundled native provider.'],
    ['jadeNative.verifyWorkingSourceBaseline', 'JOX uploads saved changes directly; the legacy CLS baseline verification action is unavailable.'],
    ['jadeNative.debugMethod', 'JOX debugger source mapping is not yet supported by the bundled native provider.'],
    ['jadeNative.showCallHierarchy', 'Project call hierarchy is not yet supplied by the native source provider.'],
    ['jadeNative.showReferences', 'Project references are not yet supplied by the native source provider.']
  ]);
  for (const [command, message] of unavailable) context.subscriptions.push(vscode.commands.registerCommand(command, () => { throw Error(message); }));
  return { build, runTests };
}
module.exports = { registerNativeSourceCommands };
