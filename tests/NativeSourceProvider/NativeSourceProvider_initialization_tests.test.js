"use strict";
const { test }=require("node:test"),assert=require("node:assert/strict");
const { NativeSourceProvider }=require("../../extension/src/NativeSourceProvider");
const { fixture,clone }=require("./fixtures/provider.cjs");
function setup(options={}) {
  const f=fixture({flags:{initialization:true},...options});
  delete f.config.workspaceRoots;delete f.config.user;delete f.config.password;
  f.config.workingJadeGitPolicy="inherit";
  f.snapshot.sourceRoots=["file:///C:/project/sources"];
  const {provider,projectId,generation,snapshotHash}=f.snapshot;
  f.initialized={projectRoot:f.snapshot.projectRoot,sourceSnapshot:{provider,projectId,generation,snapshotHash},sourceRoots:clone(f.snapshot.sourceRoots),capabilities:clone(f.flags),extractedFiles:7};
  const request=f.client.request;
  f.client.request=function(command,body,output,events,captured){
    if(command!=="working.initialize")return request.call(this,command,body,output,events,captured);
    const item={command,body:clone(body),client:this.client,id:++this.nextId};f.requests.push(item);
    output?.("[Working] Extracting owned source files...\n");
    return{id:item.id,promise:Promise.resolve().then(()=>f.reply?.(body)||{passed:true,code:0,body:clone(f.initialized)})};
  };
  f.provider=new NativeSourceProvider({client:f.client,config:f.config,projectRoot:"C:/project",validateContext:()=>f.validate?.()});
  return f;
}
test("fresh setup sends one Working initialization and adopts its authoritative source snapshot",async()=>{
  const f=setup(),lines=[];
  const value=await f.provider.initialize({destination:"C:/project/sources",schemas:["GenericSchema"],expectedWorkingIdentity:"reviewed-working"},undefined,text=>lines.push(text));
  assert.equal(value.extractedFiles,7);assert.deepEqual(f.requests.map(x=>x.command),["working.initialize"]);
  assert.deepEqual(f.requests[0].body,{cwd:"C:\\project",config:f.config,destination:"C:/project/sources",schemas:["GenericSchema"],expectedWorkingIdentity:"reviewed-working"});
  assert.equal(Object.hasOwn(f.requests[0].body.config,"user"),false);assert.equal(Object.hasOwn(f.requests[0].body.config,"password"),false);
  assert.equal(f.provider.binding().generation,f.initialized.sourceSnapshot.generation);assert.equal(lines.length,1);
});
test("old runtime refuses setup without legacy extraction or backup fallback",async()=>{
  const f=setup({flags:{initialization:false}});
  await assert.rejects(f.provider.initialize({destination:"C:/project/sources"}),/update|initialization|support/i);
  assert.equal(f.requests.length,0);
});
test("Git-first setup uses the reviewed Working identity without requesting extraction or Source",async()=>{
  const f=setup({flags:{checkoutInitialization:true,initialization:false}});
  f.initialized.working={identity:"reviewed-working",root:"C:/private/generation-work"};
  f.initialized.report={workingMode:"git-first",workingPrepared:true,publicationEstablished:true};
  const value=await f.provider.initializeCheckout({expectedWorkingIdentity:"reviewed-working"});
  assert.deepEqual(f.requests.map(x=>x.command),["working.initialize"]);
  assert.deepEqual(f.requests[0].body,{cwd:"C:\\project",config:f.config,expectedWorkingIdentity:"reviewed-working"});
  assert.equal(value.working.identity,"reviewed-working");
  assert.equal(f.provider.binding().generation,f.initialized.sourceSnapshot.generation);
});
test("Git-first setup refuses an old package or a different returned Working owner",async()=>{
  const old=setup();
  await assert.rejects(old.provider.initializeCheckout({expectedWorkingIdentity:"reviewed-working"}),/does not support|unavailable/i);
  assert.equal(old.requests.length,0);
  const f=setup({flags:{checkoutInitialization:true}});
  f.initialized.working={identity:"another-working",root:"C:/private/generation-other"};
  f.initialized.report={workingMode:"git-first",workingPrepared:true,publicationEstablished:true};
  await assert.rejects(f.provider.initializeCheckout({expectedWorkingIdentity:"reviewed-working"}),/reviewed Working/i);
  assert.equal(f.provider.snapshot,undefined);
});
test("pre-cancelled setup neither probes nor starts native work",async()=>{
  const f=setup();await assert.rejects(f.provider.initialize({destination:"C:/project/sources"},{isCancellationRequested:true}),/cancel/i);
  assert.equal(f.requests.length,0);assert.equal(f.client.probes,0);
});
test("project closure or settings change after capability probe blocks native initialization",async()=>{
  const f=setup();const original=f.client.sourceCapabilities;
  f.client.sourceCapabilities=async()=>{const result=await original.call(f.client);f.validate=()=>{throw Error("Project settings changed");};return result;};
  await assert.rejects(f.provider.initialize({destination:"C:/project/sources"}),/settings changed/);assert.equal(f.requests.length,0);
});
test("native setup failure preserves original code and partial-output report",async()=>{
  const f=setup(),failure={passed:false,code:7777,report:{error:"Native extraction failed",workingPrepared:true,sourceCreated:false,nativeClosed:true}};
  f.reply=()=>failure;
  await assert.rejects(f.provider.initialize({destination:"C:/project/sources"}),error=>error.result===failure&&error.result.code===7777);
  assert.equal(f.provider.snapshot,undefined);assert.deepEqual(f.requests.map(x=>x.command),["working.initialize"]);
});
test("a refused late cancellation preserves authoritative completed initialization",async()=>{
  const f=setup({reply:command=>command==="cancel"?{passed:false,code:0,cancelled:false}:undefined});let stopped;
  const token={isCancellationRequested:false,onCancellationRequested(callback){stopped=callback;return{dispose(){}};}};
  f.reply=()=>{stopped();return{passed:true,code:0,body:clone(f.initialized)};};
  const value=await f.provider.initialize({destination:"C:/project/sources"},token);
  assert.equal(value.extractedFiles,7);assert.deepEqual(f.requests.map(x=>x.command),["working.initialize","cancel"]);
});
test("another destination or invalid snapshot never becomes the active source model",async()=>{
  const f=setup();f.initialized.sourceRoots=["file:///C:/different"];
  await assert.rejects(f.provider.initialize({destination:"C:/project/sources"}),/destination|root|binding/i);
  assert.equal(f.provider.snapshot,undefined);
});

test("native configured project root owns cache/recovery when the open folder is its sources child",async()=>{
  const f=fixture();f.snapshot.projectRoot="file:///C:/project";f.snapshot.sourceRoots=["file:///C:/project/sources"];
  f.document.origin.uri="file:///C:/project/sources/schemas/Generic.jox";
  const provider=new NativeSourceProvider({client:f.client,config:f.config,projectRoot:"C:/project/sources"});
  await provider.prepare();const document=await provider.read(f.document.entityId);
  assert.equal(document.projection.text,f.document.projection.text);assert.equal(provider.projectRoot,"C:\\project");
});
test("foreign native project root is rejected without adopting a snapshot",async()=>{
  const f=setup();f.snapshot.projectRoot="file:///C:/unrelated";
  await assert.rejects(f.provider.prepare(),/project.*root|context|binding/i);assert.equal(f.provider.snapshot,undefined);
});

for(const state of ['closed','replaced'])test('confirmed initialization survives terminal '+state+' connection without retaining a stale source binding',async()=>{
 const f=setup();f.reply=()=>{if(state==='closed')f.client.client.closed=true;else f.client.client={};return{passed:true,code:0,body:clone(f.initialized)};};
 const result=await f.provider.initialize({destination:'C:/project/sources'});
 assert.equal(result.extractedFiles,7);assert.deepEqual(result.sourceSnapshot,f.initialized.sourceSnapshot);
 assert.equal(result.viewRefreshRequired,true);assert.match(result.warning,/completed|created/i);
 assert.equal(f.provider.snapshot,undefined);assert.equal(f.requests.length,1);
 assert.throws(()=>f.provider.binding(),/connection|closed|changed/i);
});
test('terminal connection loss still refuses ordinary document reads',async()=>{
 let f;f=fixture({reply:command=>{if(command==='source.semantic.read'){f.client.client.closed=true;return{passed:true,code:0,body:clone(f.document)};}}});
 const provider=new NativeSourceProvider({client:f.client,config:f.config});await provider.prepare();
 await assert.rejects(provider.read(f.document.entityId),/connection|closed|changed/i);
});

test('terminal connection loss cannot rebase an ordinary dirty editor after save acknowledgement',async()=>{
 let f;f=fixture({reply:command=>{if(command==='source.semantic.applyEdit')f.client.client.closed=true;}});
 const provider=new NativeSourceProvider({client:f.client,config:f.config});await provider.prepare();const opened=await provider.read(f.document.entityId),before=clone(opened.revision),snapshot=provider.snapshot;
 await assert.rejects(provider.applyEdit(opened,'saved changed text','projectionText'),/connection|closed|changed/i);
 assert.deepEqual(opened.revision,before);assert.equal(provider.snapshot,snapshot);
});

test('a capability probe on the replacement process cannot adopt the older initialization reply',async()=>{
 const f=setup();f.reply=async()=>{f.client.client={};await f.provider.capability();return{passed:true,code:0,body:clone(f.initialized)};};
 const result=await f.provider.initialize({destination:'C:/project/sources'});
 assert.equal(result.viewRefreshRequired,true);assert.equal(result.extractedFiles,7);assert.equal(f.provider.snapshot,undefined);
});

test('capture-only initialization keeps the semantic catalogue unprepared until explicitly requested',async()=>{
 const f=setup({flags:{checkoutInitialization:true}});
 f.initialized.working={identity:'reviewed-working',root:'C:/private/work'};
 f.initialized.report={workingMode:'git-first',workingPrepared:true,publicationEstablished:true};
 f.initialized.sourceCapture={provider:'jox',projectId:'project',snapshotHash:f.snapshot.snapshotHash};
 f.initialized.semanticPreparationRequired=true;delete f.initialized.sourceSnapshot;
 const value=await f.provider.initializeCheckout({expectedWorkingIdentity:'reviewed-working'});
 assert.equal(value.semanticPreparationRequired,true);
 assert.equal(f.provider.snapshot,undefined);
 assert.deepEqual(f.requests.map(x=>x.command),['working.initialize']);
 assert.throws(()=>f.provider.binding(),/prepare/i);
 await f.provider.prepare();assert.equal(f.provider.binding().generation,f.snapshot.generation);
});

for(const invalid of ['missing-capture','invalid-hash','foreign-root'])test('deferred initialization refuses '+invalid+' without inventing a catalogue',async()=>{
 const f=setup({flags:{checkoutInitialization:true}});
 f.initialized.working={identity:'reviewed-working',root:'C:/private/work'};
 f.initialized.report={workingMode:'git-first',workingPrepared:true,publicationEstablished:true};
 f.initialized.semanticPreparationRequired=true;delete f.initialized.sourceSnapshot;
 f.initialized.sourceCapture={provider:'jox',projectId:'project',snapshotHash:f.snapshot.snapshotHash};
 if(invalid==='missing-capture')delete f.initialized.sourceCapture;
 if(invalid==='invalid-hash')f.initialized.sourceCapture.snapshotHash='invalid';
 if(invalid==='foreign-root')f.initialized.projectRoot='file:///C:/foreign';
 await assert.rejects(f.provider.initializeCheckout({expectedWorkingIdentity:'reviewed-working'}),/binding|capture|root|context/i);
 assert.equal(f.provider.snapshot,undefined);assert.equal(f.requests.filter(x=>x.command==='source.semantic.prepare').length,0);
});

test('native cancellation acknowledgement reaches setup output without replacing the terminal result',async()=>{
 let cancel;const f=setup({reply:command=>command==='cancel'?{passed:true,code:0,cancelled:true}:undefined}),lines=[];
 const token={isCancellationRequested:false,onCancellationRequested(fn){cancel=fn;return{dispose(){}};}};
 f.reply=async()=>{cancel();await new Promise(resolve=>setImmediate(resolve));return{passed:true,code:0,body:clone(f.initialized)};};
 const result=await f.provider.initialize({destination:'C:/project/sources'},token,text=>lines.push(text));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(result.extractedFiles,7);assert.ok(lines.some(line=>/cancellation acknowledged/i.test(line)));
});

test('capture-only setup retains native edit admission for already open documents',async()=>{
 const f=fixture(),provider=new NativeSourceProvider({client:f.client,config:f.config,projectRoot:'C:/project'});
 await provider.prepare();const document=await provider.read(f.document.entityId);
 provider.adoptInitialization({sourceCapture:{provider:'jox',projectId:f.snapshot.projectId,snapshotHash:f.snapshot.snapshotHash},semanticPreparationRequired:true,projectRoot:f.snapshot.projectRoot,sourceRoots:f.snapshot.sourceRoots},f.flags);
 const saved=await provider.applyEdit(document,'saved after setup','projectionText');assert.equal(saved.projection.text,'saved after setup');
});

test('late cancellation acknowledgement is suppressed after a terminal initialization result',async()=>{
 let cancel,finishCancel;const f=setup({reply:command=>command==='cancel'?new Promise(resolve=>finishCancel=resolve):undefined}),lines=[];
 const token={isCancellationRequested:false,onCancellationRequested(fn){cancel=fn;return{dispose(){}};}};
 f.reply=()=>{cancel();return{passed:true,code:0,body:clone(f.initialized)};};
 await f.provider.initialize({destination:'C:/project/sources'},token,text=>lines.push(text));
 const before=lines.length;finishCancel({passed:true,code:0,cancelled:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(lines.length,before);
});

test('repeat setup revision rejects a stale prepare reply before snapshot or flags adoption',async()=>{
 const f=fixture(),provider=new NativeSourceProvider({client:f.client,config:f.config,projectRoot:'C:/project'});
 await provider.prepare();const flags=provider.flags;let finish;
 const request=f.client.request;f.client.request=function(command,...args){const result=request.call(this,command,...args);if(command==='source.semantic.prepare')result.promise=new Promise(resolve=>finish=()=>resolve({passed:true,code:0,body:{...clone(f.snapshot),generation:'stale',capabilities:{projectionEdit:false}}}));return result;};
 const preparing=provider.prepare();await new Promise(resolve=>setImmediate(resolve));provider.deferSemanticPreparation();finish();
 await assert.rejects(preparing,/changed|superseded|revision/i);assert.equal(provider.snapshot,undefined);assert.equal(provider.flags,flags);assert.equal(provider.semanticPreparationRequired,true);
});
