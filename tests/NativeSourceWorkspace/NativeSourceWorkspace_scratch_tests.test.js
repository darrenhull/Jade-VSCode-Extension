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


const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let n=0;n<50&&!predicate();n++)await turn();assert.ok(predicate(),'Expected pending source refresh to finish automatically');}
for(const outcome of [{passed:true,code:0,report:{executed:true}},{passed:false,code:130,cancelled:true,report:{error:'Original cancellation'}},{passed:false,code:2,report:{error:'Original native failure'}}])test('Scratch release automatically drains expired source debounce and preserves native outcome '+outcome.code,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let complete;
 const f=fixture({reply:()=>new Promise(resolve=>{complete=resolve;})});
 try{
  const project=await f.workspace.prepare(f.folder),seen=[];f.workspace.onDidChangeSource(value=>seen.push(value.provider.binding().generation));
  const operation=f.runner.run({document:document()});await until(()=>complete);
  const before=f.requests.filter(row=>row.command==='source.semantic.prepare').length;
  f.snapshot.generation='generation-2';f.workspace.scheduleRefresh(project);
  t.mock.timers.tick(100);await turn();assert.equal(f.workspace.executing,true);assert.equal(f.workspace.pendingChanges.has(project),true);assert.deepEqual(seen,[]);
  complete(outcome);const result=await operation;assert.equal(result.code,outcome.code);assert.equal(result.passed,outcome.passed);assert.equal(result.cancelled,outcome.cancelled);
  t.mock.timers.tick(100);await until(()=>seen.length===1);
  assert.deepEqual(seen,['generation-2']);assert.equal(f.workspace.pendingChanges.size,0);
  assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,before+1);
  assert.equal(f.requests.filter(row=>row.command==='workspace.run').length,1);assert.equal(f.workspace.executing,false);
 }finally{f.workspace.dispose();}
});

test('failed Scratch acquisition releases and automatically drains the original pending source change without native execution',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let reject;
 const f=fixture({supported:false});
 try{
  const project=await f.workspace.prepare(f.folder),seen=[];f.workspace.onDidChangeSource(value=>seen.push(value.provider.binding().generation));
  f.workspace.beforeOperation=()=>new Promise((_resolve,fail)=>{reject=fail;});
  const operation=f.runner.run({document:document()});await until(()=>reject);
  f.snapshot.generation='generation-2';f.workspace.scheduleRefresh(project);t.mock.timers.tick(100);await turn();
  assert.equal(f.workspace.pendingChanges.has(project),true);reject(Error('Original acquisition failure'));
  const result=await operation;assert.equal(result.passed,false);assert.match(result.report.error,/Original acquisition failure/);
  t.mock.timers.tick(100);await until(()=>seen.length===1);
  assert.deepEqual(seen,['generation-2']);assert.equal(f.workspace.executing,false);assert.equal(f.workspace.pendingChanges.size,0);
  assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,2);
  assert.equal(f.requests.some(row=>row.command==='workspace.run'),false);assert.equal(project.provider.flags.nativeScratch,false);
 }finally{f.workspace.dispose();}
});
