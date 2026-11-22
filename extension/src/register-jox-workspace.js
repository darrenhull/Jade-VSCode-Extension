'use strict';
const { NativeSourceWorkspace } = require('./NativeSourceWorkspace');
const { registerNativeSourceExplorer } = require('./native-source-explorer');
const { registerNativeSourceLanguage } = require('./native-source-language');
const { registerNativeSourceTesting } = require('./native-source-testing');

function registerJoxWorkspace(vscode, context, options) {
  const workspace = new NativeSourceWorkspace({ vscode, client: options.client, configFor: options.configFor });
  workspace.register(context);
  const classWorkspaces = require('./native-class-workspaces').registerNativeClassWorkspaces(vscode, context, workspace, {
    back: () => classCatalogue.show(), instances: row => options.instances?.(row)
  });
  const classView = registerNativeSourceExplorer(vscode, context, workspace, classWorkspaces);
  const classCatalogue = require('./native-source-catalogue').registerNativeSourceCatalogue(vscode, context, workspace, classWorkspaces);
  const language = registerNativeSourceLanguage(vscode, context, workspace);
  const diagnostics = vscode.languages.createDiagnosticCollection?.('jade-native');
  const reporter = diagnostics && new (require('./NativeSourceDiagnostics').NativeSourceDiagnostics)(vscode, diagnostics);
  if (reporter) context.subscriptions.push(diagnostics, reporter);
  const reportDiagnostic = (project, result) => reporter?.report(project, result);
  const testing = registerNativeSourceTesting(vscode, context, workspace, { reportDiagnostic });
  require('./native-source-debugger').registerNativeSourceDebugger(vscode, context, workspace, options.client);
  const output = vscode.window.createOutputChannel('Jade Source');
  context.subscriptions.push(output, workspace.onDidChangeSource(project => Promise.all([
    classView.changed(project), classCatalogue.changed(project), testing.refreshProject?.(project)
  ])));
  workspace.reportError = error => output.appendLine(error.message);
  const commands = require('./native-source-commands').registerNativeSourceCommands(vscode, context, workspace, testing, { reportDiagnostic });
  require('./jox-workspace-sync').registerJoxWorkspaceSync(vscode, context, workspace);
  const workspaces = vscode.notebooks && require('./native-source-workspaces').registerNativeSourceWorkspaces(vscode, context, workspace, options.client);
  return { workspace, classView: { ...classView, workspaces: classWorkspaces, catalogue: classCatalogue }, language, testing, workspaces, commands, nativeTests: options.client };
}
module.exports = { registerJoxWorkspace };
