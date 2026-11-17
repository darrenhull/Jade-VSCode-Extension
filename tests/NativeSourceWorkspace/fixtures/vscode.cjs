'use strict';
const { fixture } = require('../../NativeSourceProvider/fixtures/provider.cjs');
function setup(options = {}) {
  const f = fixture(options), commands = new Map(), trees = new Map(), languages = new Map(), fileSystems = new Map(), editors = new Map(), documents = [], panels = [];
  class Emitter {
    constructor() { this.listeners = new Set(); this.event = fn => { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }; }
    fire(value) { for (const fn of this.listeners) fn(value); }
    dispose() { this.listeners.clear(); }
  }
  const uri = value => ({ scheme: value.split(':')[0], fsPath: decodeURIComponent(new URL(value).pathname).replace(/^\/(\w:)/, '$1'), toString: () => value });
  const root = uri('file:///C:/project'), folder = { name: 'Example', uri: root };
  const closed = new Emitter(), changed = new Emitter();
  const vscode = {
    Uri: { parse: uri, file: value => uri('file:///' + value.replaceAll('\\', '/')), from: data => uri(data.scheme + ':' + data.path), joinPath: (base, ...segments) => uri(base.toString() + '/' + segments.join('/')) }, EventEmitter: Emitter,
    ViewColumn: { Active: 1, Beside: 2 },
    FileType: { File: 1 }, FilePermission: { Readonly: 1 }, FileChangeType: { Changed: 1 },
    FileSystemError: Object.fromEntries(['FileNotFound', 'FileExists', 'NoPermissions', 'Unavailable'].map(code => [code, message => Object.assign(Error(String(message)), { code })])),
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    Range: class { constructor(...args) { this.args = args; } },
    TreeItem: class { constructor(label, collapsibleState) { Object.assign(this, { label, collapsibleState }); } },
    workspace: { workspaceFolders: [folder], textDocuments: documents,
      getWorkspaceFolder: resource => resource?.scheme === 'file' && resource.fsPath.startsWith('C:/project') ? folder : undefined,
      registerFileSystemProvider: (scheme, provider) => { fileSystems.set(scheme, provider); return { dispose() {} }; },
      onDidCloseTextDocument: closed.event, onDidChangeWorkspaceFolders: changed.event,
      async openTextDocument(resource) { let doc = documents.find(value => value.uri.toString() === resource.toString()); if (doc) return doc;
        const provider = fileSystems.get(resource.scheme); const content = await provider.readFile(resource);
        doc = { uri: resource, isDirty: false, getText: () => Buffer.from(content).toString(), save: async () => true }; documents.push(doc); return doc; }
    },
    window: { registerCustomEditorProvider: (id, provider) => { editors.set(id, provider); return { dispose() {} }; }, createTreeView: (id, options) => { trees.set(id, options.treeDataProvider); return { dispose() {} }; }, showTextDocument: async document => document,
      createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }), showErrorMessage: async () => {},
      withProgress: async (_, run) => run({ report() {} }, { onCancellationRequested: () => ({ dispose() {} }) }) },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return { dispose() {} }; }, executeCommand: async (id, ...args) => commands.get(id)?.(...args) },
    languages: { setTextDocumentLanguage: async document => document },
    ProgressLocation: { Notification: 15 }
  };
  for (const kind of ['CompletionItem', 'Hover', 'Definition', 'DocumentSymbol']) vscode.languages['register' + kind + 'Provider'] = (selector, provider) => { languages.set(kind, { selector, provider }); return { dispose() {} }; };
  const testRuns = [], controllers = [];
  if (options.testing) {
    const collection = () => {
      const values = new Map();
      return { add: item => values.set(item.id, item), replace: items => { values.clear(); items.forEach(item => values.set(item.id, item)); },
        forEach: fn => values.forEach(fn), get: id => values.get(id), delete: id => values.delete(id), get size() { return values.size; } };
    };
    vscode.TestRunProfileKind = { Run: 1 };
    vscode.TestMessage = class { constructor(message) { this.message = message; } };
    vscode.tests = { createTestController: () => {
      const controller = { items: collection(), createTestItem: (id, label, resource) => ({ id, label, uri: resource, children: collection() }),
        createRunProfile: (_label, _kind, fn) => { controller.run = fn; }, dispose() {},
        createTestRun: () => { const records = []; testRuns.push(records); return Object.fromEntries(['enqueued', 'started', 'passed', 'failed', 'skipped', 'errored', 'appendOutput', 'end'].map(name => [name, (...args) => records.push({ name, args })])); } };
      controllers.push(controller); return controller;
    } };
  }
  const panel = () => {
    let receive; const sent = [], disposed = new Emitter();
    const value = { active: true, sent, reveal() {}, dispose: () => disposed.fire(), onDidDispose: disposed.event,
      webview: { cspSource: 'vscode:', asWebviewUri: resource => resource, postMessage: async message => { sent.push(message); return true; },
        onDidReceiveMessage: fn => { receive = fn; return { dispose() {} }; } }, receive: message => receive(message) };
    panels.push(value); return value;
  };
  vscode.window.createWebviewPanel = panel;
  commands.set('vscode.openWith', async (resource, id) => editors.get(id).resolveCustomTextEditor(await vscode.workspace.openTextDocument(resource), panel()));
  return { ...f, vscode, commands, trees, languages, fileSystems, editors, panels, folder, documents, closed, changed, testRuns, controllers,
    context: { subscriptions: [], extensionUri: uri('file:///C:/extension'), extensionPath: 'C:/extension', workspaceState: { get() {}, update: async () => {} } } };
}
module.exports = { setup };
