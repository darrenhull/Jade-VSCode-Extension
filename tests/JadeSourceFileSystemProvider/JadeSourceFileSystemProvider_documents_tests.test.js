"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { NativeSourceProvider } = require("../../extension/src/NativeSourceProvider");
const { JadeSourceFileSystemProvider } = require("../../extension/src/JadeSourceFileSystemProvider");
const { fixture } = require("../NativeSourceProvider/fixtures/provider.cjs");
function vscode() {
  return { Uri: { from: data => ({ ...data, toString() { return this.scheme + ":" + this.path; } }) }, FileType: { File: 1, Directory: 2 }, FilePermission: { Readonly: 1 },
    FileSystemError: Object.fromEntries(["FileNotFound", "FileExists", "NoPermissions", "Unavailable"].map(code => [code, message => Object.assign(Error(String(message)), { code })])),
    EventEmitter: class { constructor() { this.listeners = new Set(); this.event = listener => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; } fire(value) { for (const fn of this.listeners) fn(value); } dispose() { this.listeners.clear(); } }, FileChangeType: { Changed: 1 } };
}
async function setup(options) { const f = fixture(options), native = new NativeSourceProvider({ client: f.client, config: f.config }); await native.prepare(); return { ...f, native, files: new JadeSourceFileSystemProvider(vscode(), native) }; }
test("editor read exposes native Jade text through a save-intercepted URI, never the physical cache", async () => {
  const f = await setup(), uri = await f.files.open(f.document.entityId);
  assert.equal(uri.scheme, "jade-source"); assert.notEqual(uri.toString(), f.document.projection.cacheUri);
  assert.equal(Buffer.from(await f.files.readFile(uri)).toString(), f.document.projection.text);
  assert.equal(f.requests.filter(r => r.command === "source.semantic.read").length, 1);
  assert.equal(f.files.stat(uri).type, 1);
});
test("native save updates real origin binding and publishes a changed editor revision", async () => {
  const f = await setup(), uri = await f.files.open(f.document.entityId), before = f.files.stat(uri).mtime, events = [];
  f.files.onDidChangeFile(e => events.push(...e));
  const text = "value(): Integer;\nbegin\n return 2;\nend;";
  await f.files.writeFile(uri, Buffer.from(text), { create: false, overwrite: true });
  assert.equal(f.requests.at(-1).command, "source.semantic.applyEdit");
  assert.equal(f.requests.at(-1).body.replacementText, text);
  assert.equal(Buffer.from(await f.files.readFile(uri)).toString(), text);
  assert.ok(f.files.stat(uri).mtime > before); assert.equal(events.length, 1);
  assert.equal(f.files.binding(uri).revision.generation, "generation-2");
});
test("background refresh/open cannot rebase a potentially dirty document", async () => {
  const f = await setup(), uri = await f.files.open(f.document.entityId);
  f.snapshot.generation = "generation-2"; f.document.generation = "generation-2"; f.document.revision.generation = "generation-2";
  await f.native.prepare(); assert.equal(await f.files.open(f.document.entityId), uri);
  assert.equal(f.files.binding(uri).revision.generation, "generation-1");
  assert.equal(f.requests.filter(r => r.command === "source.semantic.read").length, 1);
});
test("failed stale save leaves the original projection/base and native error intact", async () => {
  const f = await setup({ reply: command => command === "source.semantic.applyEdit" ? { passed: false, code: 409, report: { error: "Origin revision changed" } } : undefined });
  const uri = await f.files.open(f.document.entityId), before = f.files.stat(uri).mtime;
  await assert.rejects(f.files.writeFile(uri, Buffer.from("dirty draft"), { overwrite: true }), /Origin revision changed/);
  assert.equal(Buffer.from(await f.files.readFile(uri)).toString(), f.document.projection.text);
  assert.equal(f.files.binding(uri).revision.generation, "generation-1"); assert.equal(f.files.stat(uri).mtime, before);
});
test("read-only kinds and arbitrary cache/filesystem operations cannot write sources", async () => {
  const f = await setup({ flags: { projectionEdit: false } }), uri = await f.files.open(f.document.entityId);
  assert.equal(f.files.stat(uri).permissions, 1);
  await assert.rejects(f.files.writeFile(uri, Buffer.from("changed"), { overwrite: true }), /read.only|support/i);
  for (const method of ["delete", "rename", "createDirectory"]) assert.throws(() => f.files[method](uri, uri), /support|permission/i);
  assert.throws(() => f.files.stat({ toString: () => "file:///C:/project/.jade/projections/document.jade" }), /found|owned/i);
  assert.equal(f.requests.some(r => r.command === "source.semantic.applyEdit"), false);
});
test("whole projection saves use the explicit native edit kind, never array order", async () => {
  const f = await setup();
  f.document.supportedEdits = ["methodBody", "projectionText"];
  const uri = await f.files.open(f.document.entityId);
  await f.files.writeFile(uri, Buffer.from("whole Jade document"), { overwrite: true });
  assert.equal(f.requests.at(-1).body.editKind, "projectionText");
});
test("explicit refresh updates clean documents while preserving dirty originals", async () => {
  const f = await setup(), uri = await f.files.open(f.document.entityId);
  f.snapshot.generation = "generation-2"; f.document.generation = "generation-2"; f.document.revision.generation = "generation-2";
  await f.native.prepare();
  assert.equal(await f.files.refresh(uri, { currentState: () => ({ dirty: true }) }), false);
  assert.equal(f.files.binding(uri).revision.generation, "generation-1");
  assert.equal(await f.files.refresh(uri, { currentState: () => ({ dirty: false }) }), true);
  assert.equal(f.files.binding(uri).revision.generation, "generation-2");
});
test("editing while a native refresh is pending cannot replace the original save revision", async () => {
  const f = await setup(), uri = await f.files.open(f.document.entityId), current = { dirty: false, version: 1 };
  const original = f.native.read.bind(f.native); let finish;
  f.native.read = async () => new Promise(resolve => { finish = resolve; });
  const refresh = f.files.refresh(uri, { currentState: () => ({ ...current }) });
  while (!finish) await new Promise(done => setImmediate(done));
  current.dirty = true; current.version = 2;
  f.snapshot.generation = "generation-2"; f.document.generation = "generation-2"; f.document.revision.generation = "generation-2";
  await f.native.prepare(); finish(await original(f.document.entityId));
  assert.equal(await refresh, false); assert.equal(f.files.binding(uri).revision.generation, "generation-1");
  await f.files.writeFile(uri, Buffer.from("dirty editor text"), { overwrite: true });
  assert.equal(f.requests.at(-1).body.baseRevision.generation, "generation-1");
});
test("a save begun or completed during refresh cannot be overwritten by its stale response", async () => {
  const f = await setup(), uri = await f.files.open(f.document.entityId); let finish;
  const original = f.native.read.bind(f.native);
  const stale = await original(f.document.entityId);
  f.native.read = async () => new Promise(resolve => { finish = resolve; });
  const refresh = f.files.refresh(uri, { currentState: () => ({ dirty: false, version: 1 }) });
  while (!finish) await new Promise(done => setImmediate(done));
  await f.files.writeFile(uri, Buffer.from("new saved document"), { overwrite: true });
  finish(stale);
  assert.equal(await refresh, false);
  assert.equal(f.files.binding(uri).revision.generation, "generation-2");
  assert.equal(Buffer.from(f.files.readFile(uri)).toString(), "new saved document");
});

test('accepted save in one open tab updates project queries while another dirty tab retains its original revision', async () => {
  const f = await setup({ reply: (command, request) => {
    if (command === 'source.semantic.read' && request.entityId === 'other-member') {
      const other = structuredClone(f.document);
      Object.assign(other, { entityId: 'other-member', documentId: 'other-document', generation: request.generation });
      other.revision.generation = request.generation; other.origin.uri = 'file:///C:/project/Example/Other.jox';
      other.projection.cacheUri = 'file:///C:/project/.jade/projections/other.jade';
      return { passed: true, code: 0, body: other };
    }
    if (command === 'source.semantic.query') return { passed: true, code: 0, body: { provider: request.provider,
      projectId: request.projectId, generation: request.generation, items: [], total: 0, offset: 0, limit: 100, nextOffset: null } };
    if (command === 'source.semantic.applyEdit' && request.entityId === 'other-member')
      return { passed: false, code: 409, report: { error: 'Retained native revision requires explicit reconciliation' } };
  } });
  const first = await f.files.open(f.document.entityId), dirty = await f.files.open('other-member');
  const original = f.files.binding(dirty).revision;
  await f.files.writeFile(first, Buffer.from('accepted first tab'), { overwrite: true });
  await f.native.query({ kind: 'type' });
  assert.equal(f.requests.at(-1).body.generation, 'generation-2');
  assert.equal(await f.files.refresh(dirty, { currentState: () => ({ dirty: true, version: 2 }) }), false);
  assert.deepEqual(f.files.binding(dirty).revision, original);
  await assert.rejects(f.files.writeFile(dirty, Buffer.from('retained dirty text'), { overwrite: true }), /explicit reconciliation/);
  assert.deepEqual(f.requests.at(-1).body.baseRevision, original);
  assert.equal(f.files.binding(first).revision.generation, 'generation-2');
  assert.equal(f.files.binding(dirty).revision.generation, 'generation-1');
  assert.equal(f.requests.filter(value => value.command === 'source.semantic.prepare').length, 1);
});
