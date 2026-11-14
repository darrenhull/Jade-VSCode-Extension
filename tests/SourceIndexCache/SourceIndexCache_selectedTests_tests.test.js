'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerTesting}=require('../../extension/src/testing');
const {testingHarness}=require('../../test/helpers/testing-harness');
const text='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFishTest subclassOf JadeTestCase transient;\ntypeDefinitions\nFishTest completeDefinition ()\ntypeSources\nFishTest (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\nend;\n}\n)\n';
function fixture(result){
 const h=testingHarness(),dispose=()=>({dispose(){}}),calls=[];let release,discovery=0;const gate=new Promise(done=>{release=done;});
 const uri=h.api.Uri.file('C:/synthetic/FishTest.cls'),document={uri,getText:()=>text,positionAt:()=>({line:9,character:0})};
 const api={...h.api,window:{showErrorMessage(){assert.fail('Discovery error');}},workspace:{textDocuments:[document],openTextDocument:async()=>document,createFileSystemWatcher:()=>({dispose(){},onDidCreate:dispose,onDidChange:dispose,onDidDelete:dispose}),onDidOpenTextDocument:dispose,onDidChangeTextDocument:dispose}};
 const index={ready:async()=>{discovery++;await gate;},flush:async()=>assert.fail('Selected run awaited global browser flush'),project:{models:new Map()}};
 const manager=registerTesting(api,{subscriptions:[]},async(selected,methods)=>{calls.push({selected,methods});return result||{passed:true,report:{tests_completed:true,cleanup_complete:true,results:(methods||['check','inheritedCheck']).map(method=>({method,status:'passed'}))}};},index);
 // VS Code TestItemCollection exposes forEach, not Map.values().
 h.controller.items.forEach(file=>{file.children.values=undefined;});
 return{h,api,manager,uri,calls,release,discovery:()=>discovery,index};
}
for(const mode of ['method','class','explorer file'])test('selected '+mode+' starts native execution while whole-browser discovery is blocked',async()=>{
 const f=fixture();let running;
 try{
  if(mode==='explorer file')running=f.h.controller.handler(new f.api.TestRunRequest([f.h.controller.items.get(f.uri.toString())]));
  else running=f.manager.runFile(f.uri,mode==='method'?'check':undefined);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1,'Native callback was blocked by global advisory discovery');
  assert.equal(f.calls[0].selected.toString(),f.uri.toString());assert.deepEqual(f.calls[0].methods,mode==='method'?['check']:undefined);
  await running;assert.equal(f.h.runs[0].ended,true);assert.equal(f.h.runs[0].states.filter(state=>state.status==='passed').length,mode==='method'?1:2,'Native all-class result metadata must include tests missing from the advisory browser');
 }finally{f.index.flush=async()=>{};f.release();await running;}
});
for(const located of [true,false])test('native-only failed method '+(located?'retains its actual split-file location':'has no guessed known-method location'),async()=>{
 const outcome={method:'inheritedCheck',status:'failed',message:'Synthetic failure',...(located?{source:'C:/synthetic/BaseTests.cls',line:77,column:3}:{})};
 const f=fixture({passed:false,report:{tests_completed:true,cleanup_complete:true,results:[{method:'check',status:'passed'},outcome]}});
 try{
  await f.manager.runFile(f.uri);
  const file=f.h.controller.items.get(f.uri.toString()),item=file.children.get(f.uri.toString()+'#inheritedCheck');
  const failure=f.h.runs[0].states.find(state=>state.status==='failed');
  assert.equal(file.children.get(f.uri.toString()+'#check').range.start.line,9);
  if(located){assert.equal(item.uri.fsPath,outcome.source);assert.equal(item.range.start.line,76);assert.equal(item.range.start.character,2);assert.equal(failure.message.location.uri.fsPath,outcome.source);assert.equal(failure.message.location.range.start.line,76);}
  else{assert.equal(item.range,undefined);assert.equal(failure.message.location,undefined);}
 }finally{f.index.flush=async()=>{};f.release();}
});
test('an already cancelled explicit selection reaches no native callback despite bypassing discovery',async()=>{
 const f=fixture();
 try{await f.h.controller.handler(new f.api.TestRunRequest([f.h.controller.items.get(f.uri.toString())]),{isCancellationRequested:true});assert.equal(f.calls.length,0);assert.equal(f.h.runs[0].states.filter(state=>state.status==='skipped').length,1);assert.equal(f.h.runs[0].ended,true);}
 finally{f.index.flush=async()=>{};f.release();}
});
