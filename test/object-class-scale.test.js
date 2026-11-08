'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { registerObjectExplorer } = require('../extension/src/object-explorer');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-object-scale-'));
  const commands = new Map(), requests = [], reveals = [], pickers = [], panels = [];
  const disposable = { dispose() {} };
  class Emitter {
    constructor() { this.e = new EventEmitter(); this.event = fn => { this.e.on('data', fn); return disposable; }; }
    fire(v) { this.e.emit('data', v); } dispose() {}
  }
  const uri = file => ({ scheme: 'file', fsPath: file, toString: () => file });
  const folder = { name: 'source', uri: uri(path.join(root, 'source')) };
  const view = { dispose() {}, reveal: async (row, options) => reveals.push({ row, options }) };
  const vscode = { EventEmitter: Emitter, ThemeIcon: class {}, TreeItem: class {
    constructor(label, state) { this.label = label; this.collapsibleState = state; }
  }, TreeItemCollapsibleState: { None: 0, Collapsed: 1 }, StatusBarAlignment: { Left: 1 },
    Uri: { file: uri }, ViewColumn: { Active: 1 }, ProgressLocation: { Notification: 15 }, CancellationTokenSource: class { constructor(){this.token={onCancellationRequested:()=>disposable};} cancel(){} dispose(){} }, workspace: { workspaceFolders: [folder], getWorkspaceFolder: () => folder },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return disposable; },
      executeCommand: async (name, ...args) => commands.get(name)?.(...args) },
    window: { activeTextEditor: { document: { uri: uri(path.join(root, 'Fish.cls')) } },
      withProgress: async (_options, run) => run({ report() {} }, { onCancellationRequested: () => disposable }),
      createOutputChannel: () => ({ append() {}, appendLine() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, dispose() {} }), createTreeView: () => view,
      showErrorMessage: async () => {},
      createQuickPick: () => { const picker = { value: '', selectedItems: [],
        onDidChangeValue(fn) { this.change = fn; return disposable; },
        onDidAccept(fn) { this.accept = fn; return disposable; },
        onDidHide(fn) { this.cancel = fn; return disposable; }, show() {}, dispose() {} };
        pickers.push(picker); return picker; },
      createWebviewPanel: () => { let receive, disposed;
        const panel = { messages: [], reveal() {},
          onDidDispose(fn) { disposed = fn; return disposable; }, dispose() { disposed?.(); },
          webview: { cspSource: 'test:', asWebviewUri: value => value,
            onDidReceiveMessage(fn) { receive = fn; return disposable; },
            postMessage: async message => { panel.messages.push(message); return true; } },
          receive: message => receive(message),
        }; panels.push(panel); return panel; },
    } };
  const context = { subscriptions: [], globalStorageUri: uri(path.join(root, 'cache')), extensionPath: root };
  const rows = Array.from({ length: 30000 }, (_, i) => ({ name: 'Class' + String(i).padStart(5, '0'),
    schema: 'Large', oid: String(i + 1).padStart(44, '0') }));
  const controller = registerObjectExplorer(vscode, context, {
    config: () => ({ installPath: 'C:/Jade', databasePath: path.join(root, 'database'),
      iniPath: path.join(root, 'jade.ini'), server: 'singleUser' }),
    isBusy: () => false, setBusy: async () => {},
    inspectionTarget: async (config,selection) => ({...config,readOnly:true,selection}),
    workingLocation: async () => ({databasePath:path.join(root,'native-working/system')}),
    createTransport: () => { const c = new EventEmitter(); c.ready = Promise.resolve({ readOnly: true });
      c.closed = new Promise(resolve => { c.stop = () => { c.emit('close', 0); resolve(); return c.closed; }; });
      c.request = async (command, args) => { requests.push({ command, args });
        if (command === 'catalog') return { schemas: [{ name: 'Large', oid: 'large', classes: rows },
          { name: 'Other', oid: 'other', classes: [{ name: 'Class29999', schema: 'Other', oid: 'other-final' }] }] };
        if (command === 'instances') return { items: [], hasMore: false, cursor: null };
      }; return c; },
  });
  t.after(async () => { await controller.releaseForOperation(); fs.rmSync(root, { recursive: true, force: true }); });
  return { controller, commands, requests, reveals, pickers, panels };
}
async function connected(f) {
  await f.controller.session.select('source');
  await f.commands.get('jadeNative.connectObjects')();
  return (await f.controller.provider.getChildren()).find(row => row.kind === 'schema' && row.name === 'Large');
}
test('database class tree bounds 30k classes to replaceable 100-row pages without loading instances', async t => {
  const f = fixture(t), schema = await connected(f);
  let children = await f.controller.provider.getChildren(schema);
  assert.equal(children.filter(row => row.kind === 'class').length, 100);
  assert.ok(children.some(row => row.command === 'jadeNative.browseDatabaseClasses'));
  const next = children.find(row => row.command === 'jadeNative.pageObjectClasses' && row.args[1] === 100);
  assert.ok(next); await f.commands.get(next.command)(...next.args);
  children = await f.controller.provider.getChildren(schema);
  assert.equal(children.filter(row => row.kind === 'class').length, 100);
  assert.equal(children.find(row => row.kind === 'class').name, 'Class00100');
  assert.equal(f.requests.filter(row => row.command === 'instances').length, 0);
  await f.commands.get('jadeNative.refreshObjects')();
  const refreshed = (await f.controller.provider.getChildren()).find(row => row.name === 'Large');
  assert.equal((await f.controller.provider.getChildren(refreshed)).find(row => row.kind === 'class').name, 'Class00000');
});
test('primary database class catalogue is bounded, labelled by environment and opens without instance queries', async t => {
  const f = fixture(t); await connected(f);
  assert.ok(f.commands.has('jadeNative.browseDatabaseClasses'));
  await f.commands.get('jadeNative.browseDatabaseClasses')();
  const grid = f.controller.classCatalogue;
  let snapshot = grid.snapshot();
  assert.equal(snapshot.page.items.length, 100);
  assert.match(snapshot.label, /Source database.*Read-only/);
  assert.ok(snapshot.label.includes('database'));
  await grid.setFilter({ query: 'Large::Class29999' });
  snapshot = grid.snapshot();
  assert.equal(snapshot.page.total, 1);
  const selected = snapshot.page.items[0];
  const opened = await grid.open(selected.browserId);
  assert.equal(opened.name, 'Class29999');
  assert.equal(f.reveals.at(-1).options.expand, false);
  assert.equal(f.requests.filter(row => row.command === 'instances').length, 0);
  await f.controller.session.select('working');
  await assert.rejects(grid.open(selected.browserId), /refresh|identity|changed/i);
  assert.equal(grid.snapshot().page.items.length, 0);
});
test('database find searches all classes and reveals exact final-page class without fetching instances', async t => {
  const f = fixture(t); await connected(f);
  assert.ok(f.commands.has('jadeNative.findObjectClass'));
  const pending = f.commands.get('jadeNative.findObjectClass')();
  for (let i = 0; i < 20 && !f.pickers.length; i++) await new Promise(resolve => setImmediate(resolve));
  const picker = f.pickers.at(-1); assert.ok(picker);
  assert.ok(picker.items.length <= 100);
  picker.change('Large::Class29999');
  assert.equal(picker.items.length, 1);
  picker.selectedItems = [picker.items[0]]; picker.accept();
  const found = await pending;
  assert.equal(found.name, 'Class29999'); assert.equal(found.schema, 'Large');
  const reveal = f.reveals.at(-1);
  assert.equal(reveal.row.name, 'Class29999'); assert.equal(reveal.options.expand, false);
  assert.equal(f.requests.filter(row => row.command === 'instances').length, 0);
  const schema = (await f.controller.provider.getChildren()).find(row => row.name === 'Large');
  const page = await f.controller.provider.getChildren(schema);
  assert.ok(page.some(row => row.kind === 'class' && row.name === 'Class29999'));
});
