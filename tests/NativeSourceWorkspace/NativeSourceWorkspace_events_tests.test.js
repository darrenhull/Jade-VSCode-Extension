"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { registerJoxWorkspace } = require("../../extension/src/register-jox-workspace");
const { setup } = require("./fixtures/vscode.cjs");
function watched(extra = () => undefined) {
  const state = { methods: ["one"], text: undefined };
  const f = setup({ testing: true, reply: (command, request) => {
    const special = extra(command, request, f); if (special !== undefined) return special;
    if (command === "source.semantic.applyEdit") {
      f.snapshot.generation = "generation-2"; f.snapshot.snapshotHash = f.hash("acceptedSavedSnapshot"); state.text = request.replacementText;
    }
    if (command === "source.semantic.read") {
      const doc = structuredClone(f.document); doc.generation = request.generation; doc.revision.generation = request.generation;
      if (state.text !== undefined) { doc.projection.text = state.text; doc.projection.contentHash = f.hash(state.text); doc.revision.memberHash = f.hash(state.text); doc.origin.originByteHash = doc.revision.originByteHash = f.hash("updatedJOX"); }
      return { passed: true, code: 0, body: doc };
    }
    if (command !== "source.semantic.query") return;
    const items = request.kind === "test" ? state.methods.map(method => ({ id: method, kind: "method", name: method, flags: { unitTest: true }, testIdentity: { schema: "Example", class: "GenericTests", method } })) : [];
    return { passed: true, code: 0, body: { provider: "jox", projectId: f.snapshot.projectId, generation: request.generation, items, total: items.length, offset: 0, limit: 100, nextOffset: null } };
  } });
  const watchers = [];
  f.vscode.RelativePattern = class { constructor(base, pattern) { Object.assign(this, { base, pattern }); } };
  f.vscode.workspace.createFileSystemWatcher = pattern => {
    const listeners = {};
    const watcher = { pattern, disposed: false, dispose() { this.disposed = true; }, fire(kind, uri) { for (const callback of listeners[kind] || []) callback(uri); } };
    for (const [name, kind] of [["onDidChange", "change"], ["onDidCreate", "create"], ["onDidDelete", "delete"]])
      watcher[name] = callback => { (listeners[kind] ||= []).push(callback); return { dispose() {} }; };
    watchers.push(watcher); return watcher;
  };
  f.vscode.CancellationTokenSource = class {
    constructor() { this.listeners = new Set(); this.token = { isCancellationRequested: false, onCancellationRequested: fn => { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; } }; }
    cancel() { this.token.isCancellationRequested = true; this.listeners.forEach(fn => fn()); }
    dispose() { this.listeners.clear(); }
  };
  const registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  return { ...f, state, watchers, registered };
}

test("native-root JOX changes debounce one preparation and refresh test discovery without legacy indexing", async () => {
  const f = watched();
  try {
    await f.registered.testing.discover(); const project = f.registered.workspace.project(f.folder);
    assert.equal(f.watchers.length, 1); assert.equal(f.watchers[0].pattern.base.fsPath, "C:/project");
    f.watchers[0].fire("change", f.vscode.Uri.file("C:/project/.jade/cache/ignored.jox"));
    await f.registered.workspace.flushChanges(project);
    assert.equal(f.requests.filter(row => row.command === "source.semantic.prepare").length, 1);
    f.state.methods.push("two"); f.snapshot.generation = "generation-2";
    for (const kind of ["change", "create", "delete"]) f.watchers[0].fire(kind, f.vscode.Uri.file("C:/project/Generic.jox"));
    await f.registered.workspace.flushChanges(project);
    assert.equal(f.requests.filter(row => row.command === "source.semantic.prepare").length, 2);
    assert.equal(f.registered.testing.controller.items.get(f.folder.uri.toString()).children.size, 2);
    assert.equal(f.watchers.length, 1);
    assert.equal(f.requests.some(row => row.command.startsWith("source.index.") || row.command.startsWith("working.baseline.")), false);
  } finally { f.registered.workspace.dispose(); }
});

test("own accepted save refreshes queries and discovery using the ACK without another preparation", async () => {
  const f = watched();
  try {
    await f.registered.testing.discover(); const project = f.registered.workspace.project(f.folder);
    const uri = await project.files.open(f.document.entityId);
    await f.fileSystems.get("jade-source").writeFile(uri, Buffer.from("accepted native text"), { overwrite: true });
    await f.registered.workspace.flushChanges(project);
    assert.equal(project.provider.binding().generation, "generation-2");
    assert.equal(f.requests.filter(row => row.command === "source.semantic.prepare").length, 1);
    assert.equal(f.requests.filter(row => row.command === "source.semantic.query").at(-1).body.generation, "generation-2");
    assert.equal(Buffer.from(project.files.readFile(uri)).toString(), "accepted native text");
  } finally { f.registered.workspace.dispose(); }
});

test("ambiguous external event during an accepted save still gets one conservative preparation", async () => {
  const f = watched();
  try {
    await f.registered.testing.discover(); const project = f.registered.workspace.project(f.folder), uri = await project.files.open(f.document.entityId);
    f.watchers[0].fire("change", f.vscode.Uri.file("C:/project/External.jox"));
    await project.files.writeFile(uri, Buffer.from("accepted save"), { overwrite: true });
    await f.registered.workspace.flushChanges(project);
    assert.equal(f.requests.filter(row => row.command === "source.semantic.prepare").length, 2);
    assert.equal(project.files.binding(uri).revision.generation, "generation-2");
  } finally { f.registered.workspace.dispose(); }
});

test("disposing the source workspace cancels queued refresh and disposes only its watchers", async () => {
  const f = watched(); await f.registered.testing.discover();
  const project = f.registered.workspace.project(f.folder);
  f.watchers[0].fire("change", f.vscode.Uri.file("C:/project/Generic.jox"));
  f.registered.workspace.dispose();
  await f.registered.workspace.flushChanges(project);
  assert.equal(f.watchers[0].disposed, true);
  assert.equal(f.requests.filter(row => row.command === "source.semantic.prepare").length, 1);
});

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let n = 0; n < 50 && !predicate(); n++) await tick(); assert.ok(predicate(), 'Expected controlled native operation'); }

test("source events wait for the active project run then refresh once without extra executions", async () => {
  let finish; const f = watched(command => command === 'test' ? new Promise(resolve => { finish = resolve; }) : undefined);
  try {
    await f.registered.testing.discover(); const project = f.registered.workspace.project(f.folder);
    const running = f.registered.testing.run({}); await until(() => finish);
    f.watchers[0].fire('change', f.vscode.Uri.file('C:/project/Generic.jox'));
    await f.registered.workspace.flushChanges(project);
    assert.equal(f.requests.filter(row => row.command === 'source.semantic.prepare').length, 2);
    finish({ passed: true, code: 0, report: { tests_completed: true, cleanup_complete: true, results: [{ method: 'one', status: 'passed' }] } });
    await running; await f.registered.workspace.flushChanges(project);
    assert.equal(f.requests.filter(row => row.command === 'source.semantic.prepare').length, 3);
    assert.equal(f.requests.filter(row => row.command === 'test').length, 1);
    assert.equal(f.testRuns[0].filter(row => row.name === 'passed').length, 1);
  } finally { f.registered.workspace.dispose(); }
});

test("dispose cancels the captured background refresh and waits for its original terminal result", async () => {
  let finish; const f = watched((command, request, context) => command === 'source.semantic.prepare' && context.requests.filter(row => row.command === command).length > 1
    ? new Promise(resolve => { finish = resolve; }) : undefined);
  await f.registered.testing.discover(); const project = f.registered.workspace.project(f.folder);
  f.watchers[0].fire('change', f.vscode.Uri.file('C:/project/Generic.jox'));
  const refreshing = f.registered.workspace.flushChanges(project);
  await until(() => finish);
  const original = f.requests.at(-1);
  f.registered.workspace.dispose(); await until(() => f.requests.some(row => row.command === 'cancel'));
  const cancelled = f.requests.find(row => row.command === 'cancel');
  assert.equal(cancelled.body.operationId, original.id); assert.equal(cancelled.client, original.client);
  finish({ passed: false, code: 130, cancelled: true, report: { error: 'Original source refresh cancelled' } });
  await assert.rejects(refreshing, /Original source refresh cancelled/);
  assert.equal(f.requests.filter(row => row.command === 'source.semantic.query').length, 1);
  assert.equal(f.watchers[0].disposed, true);
});

test("closing a project retires its watcher and queued refresh while keeping original editor data", async () => {
  const f = watched();
  try {
    await f.registered.testing.discover(); const project = f.registered.workspace.project(f.folder), uri = await project.files.open(f.document.entityId);
    f.watchers[0].fire('change', f.vscode.Uri.file('C:/project/Generic.jox'));
    f.vscode.workspace.workspaceFolders = []; f.changed.fire({ removed: [f.folder], added: [] });
    await f.registered.workspace.flushChanges(project);
    assert.equal(f.watchers[0].disposed, true);
    assert.equal(project.files.binding(uri).revision.generation, 'generation-1');
    assert.equal(f.requests.filter(row => row.command === 'source.semantic.prepare').length, 1);
  } finally { f.registered.workspace.dispose(); }
});
