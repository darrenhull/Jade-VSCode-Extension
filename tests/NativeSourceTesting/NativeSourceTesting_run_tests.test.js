'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs');
const {registerJoxWorkspace}=require('../../extension/src/register-jox-workspace');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function cancellation(){
 const listeners=new Set(),token={isCancellationRequested:false,onCancellationRequested(listener){listeners.add(listener);return{dispose:()=>listeners.delete(listener)};}};
 return{token,cancel(){token.isCancellationRequested=true;for(const listener of listeners)listener();},listeners};
}
function host(reply){
 let f;
 f=setup({testing:true,reply:(command,request)=>{
  const supplied=reply?.(command,request,f);if(supplied!==undefined)return supplied;
  if(command==='source.semantic.query')return{passed:true,code:0,body:{...f.snapshot,items:['One','Other'].map((owner,index)=>({id:'test-'+index,parentId:f.document.entityId,name:'value',kind:'method',testIdentity:{schema:'Example',class:owner,method:'value'}})),total:2,offset:0,limit:100,nextOffset:null}};
 }});
 const problems=new Map(),collections=[];
 f.vscode.languages.createDiagnosticCollection=name=>{const collection={name,clear:()=>problems.clear(),set:(uri,items)=>problems.set(uri.toString(),items),dispose(){this.disposed=true;problems.clear();}};collections.push(collection);return collection;};
 f.vscode.Diagnostic=class{constructor(range,message,severity){Object.assign(this,{range,message,severity});}};
 f.vscode.DiagnosticSeverity={Error:0};
 const registered=registerJoxWorkspace(f.vscode,f.context,{client:f.client,configFor:()=>f.config});
 return{...f,registered,problems,collections};
}

test('command-created TestRun Stop cancels the captured native request and skips later class batches',async()=>{
 let finish;
 const h=host(command=>{
  if(command==='test')return new Promise(resolve=>finish=resolve);
  if(command==='cancel'){finish({passed:false,code:130,cancelled:true,report:{tests_completed:false,cleanup_complete:true}});return{passed:true,code:0};}
 }),stop=cancellation();
 const controller=h.registered.testing.controller,create=controller.createTestRun;
 controller.createTestRun=request=>Object.assign(create(request),{token:stop.token});
 const project=await h.registered.workspace.prepare(h.folder),uri=await h.registered.workspace.open(project,h.document.entityId);
 await h.registered.testing.discover();
 const pending=h.commands.get('jadeNative.runLocalTests')(uri);
 while(!finish)await turn();
 stop.cancel();
 // Resolve only to keep the RED control bounded if the created token is ignored.
 if(!h.requests.some(value=>value.command==='cancel'))finish({passed:false,code:130,cancelled:true,report:{tests_completed:false,cleanup_complete:true}});
 const result=await pending,request=h.requests.find(value=>value.command==='test'),cancel=h.requests.find(value=>value.command==='cancel');
 assert.ok(cancel,'Stop never cancelled the captured native request');assert.equal(cancel.body.operationId,request.id);assert.equal(cancel.client,request.client);
 assert.equal(h.requests.filter(value=>value.command==='test').length,1);assert.equal(result.code,130);
 assert.equal(h.testRuns[0].filter(value=>value.name==='skipped').length,2);assert.equal(h.testRuns[0].filter(value=>value.name==='passed').length,0);
 assert.equal(h.testRuns[0].at(-1).name,'end');assert.equal(stop.listeners.size,0);assert.equal(h.registered.workspace.executing,false);
});

test('active JOX tests publish exact mapped compiler Problems and clear them only on confirmed compilation',async()=>{
 const mapped='C:/project/Example/Type.jox',generated='C:/private/package/Example.scm';
 let result={passed:false,code:8510,report:{compiled:false,tests_completed:false,cleanup_complete:true,error:'Original native compile failure',diagnostics:[
  {schema:'Example',owner:'Type',method:'value',source:mapped,line:17,column:4,error_length:3,compiler_error:6027,message:'Unknown identifier'},
  {source:generated,line:77,column:3,compiler_error:6281,message:'Generated source failure',generated_source:true,diagnostic_context_unavailable:true},
  {source:mapped,line:1,compiler_error:6281,message:'No context',diagnostic_context_unavailable:true},null
 ]}};
 const h=host(command=>command==='test'?result:undefined);
 await h.registered.testing.discover();const received=await h.registered.testing.run({});
 const problems=h.problems.get(h.vscode.Uri.file(mapped).toString());
 assert.equal(problems?.length,1,'Native mapped compilation diagnostics did not reach the active Problems collection');
 assert.deepEqual(problems[0].range.args,[16,3,16,6]);assert.equal(problems[0].code,6027);assert.match(problems[0].message,/Example.*Type.*value.*Unknown identifier/);
 assert.deepEqual(h.problems.get(h.vscode.Uri.file(generated).toString())[0].range.args,[76,2,76,3]);
 assert.equal(received.code,8510);assert.equal(received.report.error,'Original native compile failure');assert.equal(h.testRuns[0].filter(value=>value.name==='passed').length,0);
 assert.match(h.testRuns[0].filter(value=>value.name==='appendOutput').map(value=>value.args[0]).join(''),/Jade 6281.*No context/);
 for(const code of [130,124,2]){result={passed:false,code,cancelled:code===130,report:{compiled:false,diagnostics:[]}};await h.registered.testing.run({});assert.equal(h.problems.size,2,'Cancelled/startup/timeout no-compile run cleared actual compiler errors');}
 result={passed:false,code:1,report:{compiled:true,tests_completed:true,cleanup_complete:true,results:[{method:'value',status:'failed',message:'Native assertion'}]}};
 await h.registered.testing.run({});assert.equal(h.problems.size,0,'Successful compilation must retire its prior compiler Problems even when the assertion fails');
 assert.equal(h.collections.length,1);assert.ok(h.context.subscriptions.includes(h.collections[0]));h.collections[0].dispose();assert.equal(h.collections[0].disposed,true);
});

test('compiler Problems retain independent project ownership and ignore late results after disposal',()=>{
 const {NativeSourceDiagnostics}=require('../../extension/src/NativeSourceDiagnostics');
 const h=host(),store=new NativeSourceDiagnostics(h.vscode,h.collections[0]),first={},other={};
 const failed=(source,code)=>({report:{compiled:false,diagnostics:[{source,line:2,column:2,compiler_error:code,message:'Native error'}]}});
 store.report(first,failed('C:/project/first.jox',6027));store.report(other,failed('C:/other/second.jox',6026));
 store.report(first,{report:{compiled:true,diagnostics:[]}});
 assert.equal(h.problems.size,1);assert.equal([...h.problems.values()][0][0].code,6026);
 store.report(first,{report:{compiled:false,diagnostics:[{compiler_error:6281,diagnostic_context_unavailable:true,message:'No position'}]}});
 assert.equal(h.problems.size,1,'Unknown native context must not invent a selected-file Problem');
 store.report(first,{report:{compiled:true,diagnostics:{invalid:true}}});assert.equal(h.problems.size,1,'Malformed optional diagnostics must not mask the native result');
 store.dispose();h.collections[0].dispose();store.report(first,failed('C:/late.jox',6027));assert.equal(h.problems.size,0);
});
