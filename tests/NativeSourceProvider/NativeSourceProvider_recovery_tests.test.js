'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NativeSourceProvider } = require('../../extension/src/NativeSourceProvider');
const { JadeSourceFileSystemProvider } = require('../../extension/src/JadeSourceFileSystemProvider');
const { NativeSourceWorkspace } = require('../../extension/src/NativeSourceWorkspace');
const { fixture, clone } = require('./fixtures/provider.cjs');

function uri(data) {
  return { ...data, toString() { return this.scheme + ':' + this.path + (this.query ? '?' + this.query : ''); } };
}
function vscode() {
  const registered = new Map();
  const folder = { name: 'Generic', uri: { scheme: 'file', fsPath: 'C:/project', toString: () => 'file:///C:/project' } };
  return { registered, folder, Uri: { from: uri }, FileType: { File: 1 }, FilePermission: { Readonly: 1 },
    FileChangeType: { Changed: 1 },
    FileSystemError: Object.fromEntries(['FileNotFound', 'FileExists', 'NoPermissions', 'Unavailable'].map(code => [code, message => Object.assign(Error(message), { code })])),
    EventEmitter: class {
      constructor() { this.event = () => ({ dispose() {} }); }
      fire() {} dispose() {}
    },
    workspace: { workspaceFolders: [folder], textDocuments: [],
      registerFileSystemProvider(name, provider) { registered.set(name, provider); return { dispose() {} }; } }
  };
}
async function setup({ stale = false } = {}) {
  let f;
  f = fixture({ flags: { documentReopen: true }, reply(command, body) {
    if (command === 'source.semantic.reopen') {
      if (stale) return { code: 2, passed: false, report: { error: 'Restored source editor is stale; keep unsaved text.' } };
      return { code: 0, passed: true, body: clone(f.document) };
    }
    if (command === 'source.semantic.closeDocument') return { code: 0, passed: true, body: { closed: true } };
    if (command === 'source.semantic.applyEdit') {
      return { code: 0, passed: true, body: { provider: 'jox', projectId: f.document.projectId,
        documentId: f.document.documentId, entityId: f.document.entityId, saved: true,
        documentBinding: clone(f.document.documentBinding), newRevision: { ...f.document.revision, generation: 'accepted-save', memberHash: f.hash(body.replacementText) },
        sourceSnapshot: { provider: 'jox', projectId: f.document.projectId, generation: 'accepted-save', snapshotHash: f.hash('saved snapshot') },
        origin: clone(f.document.origin), projection: { ...f.document.projection, text: body.replacementText, contentHash: f.hash(body.replacementText) } } };
    }
  } });
  f.document.documentBinding = { format: 1, key: 'a'.repeat(32), projectUri: 'file:///C:/project' };
  const provider = new NativeSourceProvider({ client: f.client, config: f.config });
  await provider.prepare();
  return { ...f, provider };
}

test('native-backed editor URI restores the original document through native reopen after host restart', async () => {
  const f = await setup(), v = vscode();
  const first = new JadeSourceFileSystemProvider(v, f.provider);
  const opened = await first.open(f.document.entityId);
  assert.match(opened.path, /a{32}\.jade$/);
  assert.equal(new URLSearchParams(opened.query).get('binding'), f.document.projectId);
  first.dispose();
  const restarted = new NativeSourceProvider({ client: f.client, config: f.config });
  await restarted.prepare();
  const files = new JadeSourceFileSystemProvider(v, restarted);
  await Promise.all([files.recover(opened), files.recover(opened)]);
  assert.equal(f.requests.filter(value => value.command === 'source.semantic.reopen').length, 1);
  assert.deepEqual(files.binding(opened).revision, f.document.revision);
  assert.equal(files.readFile(opened).toString(), f.document.projection.text);
  await files.writeFile(opened, Buffer.from('unsaved recovered text'), { overwrite: true });
  const request = f.requests.findLast(value => value.command === 'source.semantic.applyEdit');
  assert.equal(request.body.documentBinding, 'a'.repeat(32));
  assert.deepEqual(request.body.baseRevision, f.document.revision);
});

test('native stale-reopen refusal preserves dirty recovery text and cannot dispatch a save', async () => {
  const f = await setup({ stale: true }), v = vscode();
  const first = new JadeSourceFileSystemProvider(v, f.provider), opened = await first.open(f.document.entityId);
  const dirtyBackup = 'user recovery text remains outside the provider';
  first.dispose();
  const files = new JadeSourceFileSystemProvider(v, f.provider);
  await assert.rejects(files.recover(opened), /stale.*unsaved/i);
  assert.equal(files.documents.size, 0);
  await assert.rejects(files.writeFile(opened, Buffer.from(dirtyBackup), { overwrite: true }), /No owned/);
  assert.equal(f.requests.filter(value => value.command === 'source.semantic.applyEdit').length, 0);
  assert.equal(dirtyBackup, 'user recovery text remains outside the provider');
});

test('refresh carries the same native recovery key without replacing another dirty document base', async () => {
  const f = await setup(), v = vscode(), files = new JadeSourceFileSystemProvider(v, f.provider);
  const opened = await files.open(f.document.entityId), original = files.binding(opened).revision;
  await files.refresh(opened, { currentState: () => ({ dirty: false, version: 1 }) });
  assert.equal(f.requests.at(-1).body.documentBinding, 'a'.repeat(32));
  assert.deepEqual(files.binding(opened).revision, original);
  assert.equal(await files.refresh(opened, { currentState: () => ({ dirty: true, version: 2 }) }), false);
  assert.deepEqual(files.binding(opened).revision, original);
});

test('restored URI routes to its selected open workspace with one shared preparation', async () => {
  const f = await setup(), v = vscode();
  const first = new JadeSourceFileSystemProvider(v, f.provider), opened = await first.open(f.document.entityId);
  first.dispose();
  const workspace = new NativeSourceWorkspace({ vscode: v, client: f.client, configFor: () => f.config });
  workspace.register({ subscriptions: [] });
  const before = f.requests.length;
  const delegate = v.registered.get('jade-source');
  await Promise.all([delegate.stat(opened), delegate.readFile(opened)]);
  assert.equal(f.requests.slice(before).filter(value => value.command === 'source.semantic.prepare').length, 1);
  assert.equal(f.requests.slice(before).filter(value => value.command === 'source.semantic.reopen').length, 1);
  workspace.dispose();
});

test('foreign project recovery and missing native reopen support fail before a request', async () => {
  const f = await setup(), files = new JadeSourceFileSystemProvider(vscode(), f.provider);
  const foreign = uri({ scheme: 'jade-source', path: '/.jade/projections/' + 'a'.repeat(32) + '.jade', query: 'project=file%3A%2F%2F%2FC%3A%2Fother&binding=foreign' });
  const before = f.requests.length;
  await assert.rejects(files.recover(foreign), /matching native project/);
  f.provider.flags.documentReopen = false;
  await assert.rejects(f.provider.reopen('a'.repeat(32)), /cannot be restored/);
  assert.equal(f.requests.length, before);
});


test('only an editor open requests persistence and explicit close releases its original key', async () => {
  const f = await setup(), files = new JadeSourceFileSystemProvider(vscode(), f.provider);
  await f.provider.read(f.document.entityId);
  assert.equal(f.requests.at(-1).body.openDocument, undefined);
  const opened = await files.open(f.document.entityId);
  assert.equal(f.requests.at(-1).body.openDocument, true);
  await files.close(opened);
  assert.equal(f.requests.at(-1).command, 'source.semantic.closeDocument');
  assert.equal(f.requests.at(-1).body.documentBinding, 'a'.repeat(32));
  const before = f.requests.length;
  files.dispose();
  assert.equal(f.requests.length, before);
});


test('project disposal releases only its captured native model and preserves hot-exit document bindings', async () => {
  const f = await setup(), files = new JadeSourceFileSystemProvider(vscode(), f.provider);
  await files.open(f.document.entityId);
  files.dispose();
  await f.provider.closeProject();
  assert.equal(f.requests.at(-1).command, 'source.semantic.closeProject');
  assert.equal(f.requests.filter(value => value.command === 'source.semantic.closeDocument').length, 0);
  const before = f.requests.length;
  await f.provider.closeProject();
  assert.equal(f.requests.length, before);
});

test('project disposal never starts a replacement connection to release an old model', async () => {
  const f = await setup(), before = f.requests.length;
  f.client.client = {};
  await f.provider.closeProject();
  assert.equal(f.requests.length, before);
});
