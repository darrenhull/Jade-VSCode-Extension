'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerTesting}=require('../../extension/src/testing');
const {testingHarness}=require('../../test/helpers/testing-harness');
const text='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFishTest subclassOf JadeTestCase transient;\ntypeDefinitions\nFishTest completeDefinition ()\ntypeSources\nFishTest (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\nend;\n}\n)\n';
function fixture(){
 const h=testingHarness(),dispose=()=>({dispose(){}}),calls=[];let release,discovery=0;const gate=new Promise(done=>{release=done;});
 const uri=h.api.Uri.file('C:/synthetic/FishTest.cls'),document={uri,getText:()=>text,positionAt:()=>({line:0,character:0})};
 const api={...h.api,window:{showErrorMessage(){assert.fail('Discovery error');}},workspace:{textDocuments:[document],openTextDocument:async()=>document,createFileSystemWatcher:()=>({dispose(){},onDidCreate:dispose,onDidChange:dispose,onDidDelete:dispose}),onDidOpenTextDocument:dispose,onDidChangeTextDocument:dispose}};
 const index={ready:async()=>{discovery++;await gate;},flush:async()=>assert.fail('Selected run awaited global browser flush'),project:{models:new Map()}};
 const manager=registerTesting(api,{subscriptions:[]},async(selected,methods)=>{calls.push({selected,methods});return{passed:true,report:{tests_completed:true,cleanup_complete:true,results:(methods||['check','inheritedCheck']).map(method=>({method,status:'passed'}))}};},index);
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
