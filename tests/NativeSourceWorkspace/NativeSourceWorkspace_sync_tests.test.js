'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/vscode.cjs');
const { NativeSourceWorkspace } = require('../../extension/src/NativeSourceWorkspace');

function fixture(options = {}) {
  const result = { passed: true, code: 0, report: { inSync: true, changedFiles: [],
    repositoryHead: 'a42b5c9e'.padEnd(40, '0'), savedOverlayFiles: 2 } };
  const state = setup({ flags: { sync: true, deploymentFromSavedSnapshot: false, nativeTests: false, ...options.flags },
    reply: (command, body, request) => options.reply?.(command, body, request) ?? (command === 'sync' ? result : undefined) });
  const workspace = new NativeSourceWorkspace({ vscode: state.vscode, client: state.client, configFor: () => state.config });
  const project = workspace.project(state.folder);
  return { ...state, workspace, project, result, sync: options => workspace.sync(project, options) };
}

test('Workspace sync uses the saved snapshot and its original broker connection without tests or setup', async () => {
  const state = fixture();
  try {
    let released = 0;
    state.workspace.beforeOperation = async () => { released++; };
    assert.deepEqual(await state.sync(), state.result);
    assert.equal(released, 1);
    assert.deepEqual(state.requests.map(row => row.command), ['source.semantic.prepare', 'sync']);
    const [prepared, request] = state.requests;
    assert.equal(request.client, prepared.client);
    assert.deepEqual(request.body, { cwd: prepared.body.cwd, config: prepared.body.config, sourceSnapshot: {
      provider: state.snapshot.provider, projectId: state.snapshot.projectId, generation: state.snapshot.generation, snapshotHash: state.snapshot.snapshotHash } });
  } finally { state.workspace.dispose(); }
});

for (const sync of [undefined, false, 'true']) test('Missing or non-boolean sync qualification refuses before any Working or source request: ' + sync, async () => {
  const state = fixture({ flags: { sync } });
  try {
    state.workspace.beforeOperation = () => assert.fail('Unsupported sync released the active operation');
    await assert.rejects(state.sync(), /does not support.*sync/i);
    assert.deepEqual(state.requests, []);
  } finally { state.workspace.dispose(); }
});

test('Workspace sync refuses a dirty raw JOX editor before dispatch; it does not auto-save raw source', async () => {
  const state = fixture();
  try {
    state.documents.push({ uri: state.vscode.Uri.parse('file:///C:/project/local.jox'), isDirty: true, save: () => assert.fail('Unexpected save') });
    await assert.rejects(state.sync(), /Save the JOX document/);
    assert.equal(state.requests.some(row => row.command === 'sync'), false);
    assert.equal(state.workspace.executing, false);
  } finally { state.workspace.dispose(); }
});

test('Workspace sync rechecks for a dirty editor after capturing the saved snapshot', async () => {
  const state = fixture({ reply: command => {
    if (command === 'source.semantic.prepare') state.documents.push({ uri: state.vscode.Uri.parse('file:///C:/project/local.jox'), isDirty: true });
  } });
  try {
    await assert.rejects(state.sync(), /Save the JOX document/);
    assert.equal(state.requests.some(row => row.command === 'sync'), false);
  } finally { state.workspace.dispose(); }
});

test('Workspace sync saves its owned projection before preparing the snapshot', async () => {
  const state = fixture({ reply: command => {
    if (command === 'source.semantic.prepare') assert.equal(editor.isDirty, false);
  } });
  const uri = state.vscode.Uri.parse('jade-source:/member?project=file%3A%2F%2F%2FC%3A%2Fproject');
  const editor = { uri, isDirty: true, async save() { this.isDirty = false; return true; } };
  state.project.files.documents.set(uri.toString(), {});
  state.documents.push(editor);
  try { assert.equal((await state.sync()).passed, true); }
  finally { state.workspace.dispose(); }
});

test('Cancelling sync targets the same connection and retains its terminal result', async () => {
  let finish, cancel, removed = false;
  const terminal = { passed: false, code: 130, cancelled: true, report: { error: 'Native sync stopped' } };
  const state = fixture({ reply: command => {
    if (command === 'sync') return new Promise(resolve => { finish = resolve; });
    if (command === 'cancel') finish(terminal);
  } });
  try {
    const result = state.sync({ token: { onCancellationRequested(fn) { cancel = fn; return { dispose() { removed = true; } }; } } });
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    cancel();
    assert.deepEqual(await result, terminal);
    const request = state.requests.find(row => row.command === 'sync');
    const cancellation = state.requests.find(row => row.command === 'cancel');
    assert.equal(cancellation.client, request.client);
    assert.equal(cancellation.body.operationId, request.id);
    assert.equal(removed, true);
  } finally { state.workspace.dispose(); }
});
