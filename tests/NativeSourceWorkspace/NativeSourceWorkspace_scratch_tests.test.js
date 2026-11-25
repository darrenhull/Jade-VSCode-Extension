'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { setup } = require('./fixtures/vscode.cjs');
const { NativeSourceWorkspace } = require('../../extension/src/NativeSourceWorkspace');
const { createSemanticWorkspaceTransport } = require('../../extension/src/native-source-workspaces');
const { JadeWorkspaceRunner } = require('../../extension/src/JadeWorkspaceRunner');
const document = () => ({ version: 1, uri: { toString: () => 'untitled:Generic.jade' }, getText: () => 'begin\n write 42;\nend;' });
function fixture(options = {}) {
  const f = setup({ flags: { nativeScratch: options.supported !== false }, reply: (command, body) => {
    if(options.nativeReply){const result=options.nativeReply(command,body);if(result!==undefined)return result;}
    if(command==='working.location')return{passed:true,code:0,body:{working:{identity:'fixture-working'}}};
    if (command === 'source.semantic.query') return { passed: true, code: 0, body: { provider: 'jox', projectId: f.snapshot.projectId, generation: f.snapshot.generation,
      items: [{ id: 'native-schema', kind: 'schema', name: options.schema||'Example' }], total: 1, offset: 0, limit: 100, nextOffset: null } };
    if (command === 'workspace.run') return options.reply ? options.reply() : { passed: true, code: 0, report: { executed: true } };
  } });
  const forks=[],nativeRequest=f.client.request;
  f.client.fork=function(){const child={...this,client:{scope:'scratch-'+forks.length},parent:this,request:nativeRequest,async dispose(){this.disposed=true;}};forks.push(child);return child;};
  const workspace = new NativeSourceWorkspace({ vscode: f.vscode, client: f.client, configFor: () => f.config });
  const runner = new JadeWorkspaceRunner({ ...createSemanticWorkspaceTransport(workspace, f.client), configFor: async () => ({ ...f.config, schema: options.schema||'Example' }) });
  return { ...f, workspace, runner, forks };
}
test('existing Scratch runner performs one native prepare and actual execution on each invocation', async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) assert.equal((await f.runner.run({ document: document() })).report.executed, true);
  assert.deepEqual(f.requests.map(request => request.command), Array(2).fill(['working.location','source.semantic.prepare','source.semantic.query','working.location','workspace.run','source.semantic.closeProject']).flat());
  const calls = f.requests.filter(request => request.command === 'workspace.run');
  assert.equal(calls[0].body.code, document().getText()); assert.equal(calls[0].body.sourceText, document().getText());
  assert.deepEqual(calls[0].body.semanticSelection, { entityIds: ['native-schema'] });
  assert.ok(calls.every((request,index)=>request.client===f.forks[index].client));assert.ok(f.forks.every(child=>child.disposed)); assert.equal(f.workspace.executing, false);
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
  f.forks.at(-1).client = {};
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


test('explicit cancellation from a pending source save stays Cancelled without a native result or execution',async()=>{
 const f=fixture({supported:false});let reject;
 const token={isCancellationRequested:false};
 f.workspace.saveDirty=()=>new Promise((_resolve,fail)=>{reject=fail;});
 try{
  const operation=f.runner.run({document:document(),token});await until(()=>reject);token.isCancellationRequested=true;
  reject(Object.assign(Error('Source save was cancelled'),{cancelled:true}));
  const result=await operation;assert.equal(result.code,130);assert.equal(result.cancelled,true);assert.equal(result.passed,false);assert.equal(result.report.error,'Source save was cancelled');
  assert.equal(f.workspace.executing,false);assert.equal(f.requests.some(row=>row.command==='workspace.run'||row.command==='source.semantic.prepare'),false);assert.equal(f.flags.nativeScratch,false);
 }finally{f.workspace.dispose();}
});

test('cancellation while waiting for the native source queue stays Cancelled without sending preparation or execution',async()=>{
 const f=fixture({supported:false}),project=f.workspace.project(f.folder);let release;
 const held=project.provider.serializeSource(()=>new Promise(resolve=>{release=resolve;}));await until(()=>release);
 const queued=project.provider.sourceOperation,token={isCancellationRequested:false};
 try{
  const operation=f.runner.run({document:document(),token});await until(()=>f.workspace.executing);await turn();
  token.isCancellationRequested=true;release();await held;
  const result=await operation;assert.equal(result.code,130);assert.equal(result.cancelled,true);assert.equal(result.passed,false);assert.match(result.report.error,/Source operation cancelled/);
  assert.equal(f.workspace.executing,false);assert.equal(f.requests.length,0);assert.equal(f.flags.nativeScratch,false);
 }finally{release?.();f.workspace.dispose();}
});

for(const structured of [false,true])test('a late token cancellation cannot replace an actual preparation failure '+(structured?'6295':'without cancel marker'),async()=>{
 const f=fixture({supported:false}),token={isCancellationRequested:false};let reject;
 f.workspace.saveDirty=()=>new Promise((_resolve,fail)=>{reject=fail;});
 try{
  const operation=f.runner.run({document:document(),token});await until(()=>reject);token.isCancellationRequested=true;
  const original={passed:false,code:6295,report:{compiled:false,executed:false,error:'Original native preparation6295',compilerOutput:'original native detail'}};
  reject(structured?Object.assign(Error(original.report.error),{cancelled:true,result:original}):Error('Original source save failure'));
  const result=await operation;assert.equal(result.code,structured?6295:2);assert.equal(result.cancelled,undefined);assert.equal(result.passed,false);
  if(structured)assert.deepEqual(result.report,original.report);else assert.equal(result.report.error,'Original source save failure');
  assert.equal(f.workspace.executing,false);assert.equal(f.requests.some(row=>row.command==='workspace.run'),false);
 }finally{f.workspace.dispose();}
});

test('Scratch execution follows an adopted provider session rather than its registration client',async()=>{const f=fixture(),project=f.workspace.project(f.folder),original=f.client.request;const fork={...f.client,client:{owner:'adopted'},request:original};project.provider.client=fork;f.client.request=(command,...args)=>{if(command==='workspace.run'||command==='cancel')assert.fail('Scratch must use adopted session');return original.call(f.client,command,...args);};const result=await f.runner.run({document:document()});assert.equal(result.passed,true,JSON.stringify(result));assert.equal(f.requests.find(row=>row.command==='workspace.run').client,f.forks.at(-1).client);assert.equal(f.forks.at(-1).parent,fork);});

test('Scratch cancellation remains bound to the adopted original proxy',async()=>{let complete,cancel;const f=fixture({reply:()=>new Promise(resolve=>complete=resolve)}),project=f.workspace.project(f.folder),original=f.client.request,fork={...f.client,client:{owner:'adopted'},request:original};project.provider.client=fork;f.client.request=(command,...args)=>{if(command==='workspace.run'||command==='cancel')assert.fail('Scratch must use adopted session');return original.call(f.client,command,...args);};const pending=f.runner.run({document:document(),token:{onCancellationRequested:callback=>{cancel=callback;return{dispose(){}};}}});await until(()=>complete);const connection=f.forks.at(-1).client;cancel();assert.equal(f.requests.find(row=>row.command==='cancel').client,connection);complete({passed:false,code:130,cancelled:true});assert.equal((await pending).cancelled,true);});

test('late Scratch cancellation cannot fall back to the registration session',async()=>{const f=fixture();await f.runner.run({document:document()});const request=f.requests.find(row=>row.command==='workspace.run');await assert.rejects(f.runner.client.request('cancel',{operationId:request.id}).promise,/active|original/i);assert.equal(f.requests.some(row=>row.command==='cancel'),false);});

test('schema-selected Scratch prepares its native snapshot with the schema and preserves the Explorer provider',async()=>{const schema='CliJoxManagedF4Schema',marker='SCHEMA_BOUND_SCRATCH_OUTPUT';let f;f=fixture({schema,nativeReply:(command)=>{if(command==='workspace.run'){const cached=f.requests.filter(row=>row.command==='source.semantic.prepare').at(-1).body.config.schema||'RootSchema';return cached===schema?{passed:true,code:0,report:{executed:true,output:marker}}:{passed:false,code:2,report:{executed:false,error:'Choose a user schema for Workspace execution; RootSchema scripts are not supported by Jade.'}};}}});const project=f.workspace.project(f.folder);await project.provider.prepare();const held=project.provider.snapshot,configuration={...project.provider.config};const result=await f.runner.run({document:{...document(),getText:()=> 'begin\n write "'+marker+'";\nend;'}});assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.report.output,marker);assert.equal(project.provider.snapshot,held);assert.deepEqual(project.provider.config,configuration);const prepared=f.requests.filter(row=>row.command==='source.semantic.prepare').at(-1),run=f.requests.find(row=>row.command==='workspace.run');assert.equal(prepared.body.config.schema,schema);assert.equal(run.client,prepared.client);assert.notEqual(run.client,project.provider.client.client);assert.equal(f.forks.at(-1).disposed,true);});

test('schema-bound Scratch refuses a changed Working identity and releases its private source owner',async()=>{let targets=0;const f=fixture({nativeReply:command=>command==='working.location'?{passed:true,code:0,body:{working:{identity:++targets===1?'reviewed-A':'changed-B'}}}:undefined});const result=await f.runner.run({document:document()});assert.equal(result.passed,false);assert.match(result.report.error,/Working target changed/);assert.equal(f.requests.some(row=>row.command==='workspace.run'),false);assert.equal(f.forks.at(-1).disposed,true);assert.equal(f.workspace.executing,false);});
