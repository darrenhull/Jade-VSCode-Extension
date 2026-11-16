'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { registerObjectExplorer } = require('../extension/src/object-explorer');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-object-scale-'));
  const commands = new Map(), requests = [], reveals = [], pickers = [], panels = [], transportOptions = [];
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
      showInputBox: async () => '',
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
  const secretValues = new Map();
  const context = { secrets: { get: async key => secretValues.get(key), store: async (key, value) => secretValues.set(key, value), delete: async key => secretValues.delete(key) }, subscriptions: [], globalStorageUri: uri(path.join(root, 'cache')), extensionPath: root };
  const rows = Array.from({ length: 30000 }, (_, i) => ({ name: 'Class' + String(i).padStart(5, '0'),
    schema: 'Large', oid: String(i + 1).padStart(44, '0'), schemaOffset: i }));
  const allRows = [...rows, { name: 'Class29999', schema: 'Other', oid: 'other-final', schemaOffset: 0 }];
  const schemas = [{ name: 'Large', oid: 'large', total: rows.length, schemaOffset: 0 },
    { name: 'Other', oid: 'other', total: 1, schemaOffset: 1 }];
  let snapshotGeneration = 0;
  const controller = registerObjectExplorer(vscode, context, {
    config: () => ({ installPath: 'C:/Jade', databasePath: path.join(root, 'database'),
      iniPath: path.join(root, 'jade.ini'), server: 'singleUser', workspaceRoots: [folder.uri.fsPath] }),
    isBusy: () => false, setBusy: async () => {},
    inspectionTarget: async (config,selection) => ({...config,readOnly:true,selection}),
    workingLocation: async () => ({databasePath:path.join(root,'native-working/system')}),
    createTransport: options => { transportOptions.push(options); const c = new EventEmitter(); c.ready = Promise.resolve({ readOnly: true });
      c.closed = new Promise(resolve => { c.stop = () => { c.emit('close', 0); resolve(); return c.closed; }; });
      c.request = async (command, args) => { requests.push({ command, args });
        if (command === 'catalog') {
          assert.ok(args.view === 'schemas' || args.view === 'classes', 'never request the legacy full-tree catalogue');
          assert.ok(Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 100, 'bound every native packet');
          if (args.refresh) snapshotGeneration++;
          const snapshotId = 'scale-snapshot-' + snapshotGeneration;
          if (args.snapshotId && args.snapshotId !== snapshotId) throw Error('Native catalogue snapshot changed; refresh required.');
          let selected = args.view === 'schemas' ? schemas : allRows;
          if (args.schema) selected = selected.filter(row => (args.view === 'schemas' ? row.name : row.schema) === args.schema);
          if (args.name) selected = selected.filter(row => row.name === args.name);
          if (args.query) selected = selected.filter(row => (args.view === 'schemas' ? row.name : row.schema + '::' + row.name).toLowerCase().includes(args.query.toLowerCase()));
          const packet = selected.slice(args.offset, args.offset + args.limit);
          assert.ok(packet.length <= 100);
          return { readOnly: true, catalogueVersion: 1, snapshotId, view: args.view, rows: packet,
            total: selected.length, offset: args.offset, totalClasses: allRows.length,
            next_offset: args.offset + packet.length < selected.length ? args.offset + packet.length : null };
        }
        if (command === 'instances') return { items: [], hasMore: false, cursor: null };
      }; return c; },
  });
  t.after(async () => { await controller.releaseForOperation(); fs.rmSync(root, { recursive: true, force: true }); });
  return { controller, commands, requests, reveals, pickers, panels, transportOptions };
}
async function waitFor(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(condition(), 'asynchronous catalogue search settled');
}
async function connected(f) {
  await f.controller.session.select('source');
  await f.commands.get('jadeNative.connectObjects')();
  assert.deepEqual(f.transportOptions.at(-1).catalogArgs, { includeSystem: false, view: 'schemas', offset: 0, limit: 1 });
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
  await waitFor(() => f.pickers.length && !f.pickers.at(-1).busy && f.pickers.at(-1).items?.length === 100);
  const picker = f.pickers.at(-1); assert.ok(picker);
  assert.ok(picker.items.length <= 100);
  picker.change('Large::Class29999');
  await waitFor(() => !picker.busy && picker.items.length === 1);
  assert.equal(picker.items.length, 1);
  picker.selectedItems = [picker.items[0]]; picker.accept();
  const found = await pending;
  assert.equal(found.name, 'Class29999'); assert.equal(found.schema, 'Large');
  assert.ok(f.requests.some(row => row.command === 'catalog' && row.args.query === 'Large::Class29999'));
  assert.ok(f.requests.some(row => row.command === 'catalog' && row.args.name === 'Class29999' && row.args.schema === 'Large' && row.args.limit === 1));
  const reveal = f.reveals.at(-1);
  assert.equal(reveal.row.name, 'Class29999'); assert.equal(reveal.options.expand, false);
  assert.equal(f.requests.filter(row => row.command === 'instances').length, 0);
  const schema = (await f.controller.provider.getChildren()).find(row => row.name === 'Large');
  const page = await f.controller.provider.getChildren(schema);
  assert.ok(page.some(row => row.kind === 'class' && row.name === 'Class29999'));
});
