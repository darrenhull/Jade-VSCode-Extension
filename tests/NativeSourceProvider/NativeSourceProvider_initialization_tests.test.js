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
