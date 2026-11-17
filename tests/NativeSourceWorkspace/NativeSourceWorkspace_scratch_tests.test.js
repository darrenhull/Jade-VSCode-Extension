'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { setup } = require('./fixtures/vscode.cjs');
const { NativeSourceWorkspace } = require('../../extension/src/NativeSourceWorkspace');
const { createSemanticWorkspaceTransport } = require('../../extension/src/native-source-workspaces');
const { JadeWorkspaceRunner } = require('../../extension/src/JadeWorkspaceRunner');
const document = () => ({ version: 1, uri: { toString: () => 'untitled:Generic.jade' }, getText: () => 'begin\n write 42;\nend;' });
function fixture(options = {}) {
  const f = setup({ flags: { nativeScratch: options.supported !== false }, reply: (command, body) => {
    if (command === 'source.semantic.query') return { passed: true, code: 0, body: { provider: 'jox', projectId: f.snapshot.projectId, generation: f.snapshot.generation,
      items: [{ id: 'native-schema', kind: 'schema', name: 'Example' }], total: 1, offset: 0, limit: 100, nextOffset: null } };
    if (command === 'workspace.run') return options.reply ? options.reply() : { passed: true, code: 0, report: { executed: true } };
  } });
  const workspace = new NativeSourceWorkspace({ vscode: f.vscode, client: f.client, configFor: () => f.config });
  const runner = new JadeWorkspaceRunner({ ...createSemanticWorkspaceTransport(workspace, f.client), configFor: async () => ({ ...f.config, schema: 'Example' }) });
  return { ...f, workspace, runner };
}
test('existing Scratch runner performs one native prepare and actual execution on each invocation', async () => {
  const f = fixture(), captured = [], original = f.client.request.bind(f.client);
  f.client.request = (command, body, output, events, connection) => { if (command === 'workspace.run') captured.push(connection); return original(command, body, output, events, connection); };
  for (let i = 0; i < 2; i++) assert.equal((await f.runner.run({ document: document() })).report.executed, true);
  assert.deepEqual(f.requests.map(request => request.command), ['source.semantic.prepare', 'source.semantic.query', 'workspace.run', 'source.semantic.prepare', 'source.semantic.query', 'workspace.run']);
  const calls = f.requests.filter(request => request.command === 'workspace.run');
  assert.equal(calls[0].body.code, document().getText()); assert.equal(calls[0].body.sourceText, document().getText());
  assert.deepEqual(calls[0].body.semanticSelection, { entityIds: ['native-schema'] });
  assert.ok(captured.every(connection => connection === f.client.client)); assert.equal(f.workspace.executing, false);
});
test('missing Scratch qualification refuses before native execution and releases operation ownership', async () => {
  const f = fixture({ supported: false }), result = await f.runner.run({ document: document() });
  assert.equal(result.passed, false); assert.match(result.report.error, /Scratch Pad execution/);
  assert.equal(f.requests.some(request => request.command === 'workspace.run'), false); assert.equal(f.workspace.executing, false);
});
test('lost original Scratch channel never spawns a cancellation on a replacement connection', async () => {
  let complete, cancel;
  const f = fixture({ reply: () => new Promise(resolve => { complete = resolve; }) });
  const operation = f.runner.run({ document: document(), token: { onCancellationRequested: listener => { cancel = listener; return { dispose() {} }; } } });
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  f.client.client = {};
  assert.doesNotThrow(() => cancel());
  const failed = { passed: false, code: 2, report: { error: 'Original channel closed' } }; complete(failed);
  assert.equal((await operation).code, 2); assert.equal(f.requests.some(request => request.command === 'cancel'), false);
});
