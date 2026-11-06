'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {testingHarness}=require('./helpers/testing-harness');
const {registerTesting}=require('../extension/src/testing');
const {SourceIndex}=require('../extension/src/workspace-index');
const source=name=>`schemaDefinition\nTests subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${name} subclassOf JadeTestCase transient;\ntypeDefinitions\n${name} completeDefinition\n(\n)\ntypeSources\n${name} (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\nend;\n}\n)\n`;
test('Test Explorer refresh discovers pulled tests even when file watcher events are missed',async()=>{
 const h=testingHarness(),disposable=()=>({dispose(){}}),files=new Map([['file:///C:/pull/Old.cls',source('Old')]]);
 const index=new SourceIndex({list:async()=>[...files.keys()],read:async uri=>files.get(uri)});
 const api={...h.api,window:{showErrorMessage(message){throw Error(message);}},workspace:{textDocuments:[],createFileSystemWatcher:()=>({dispose(){},onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable}),onDidOpenTextDocument:disposable,onDidChangeTextDocument:disposable}};
 api.Uri.parse=value=>api.Uri.file(value.replace('file:///',''));
 const manager=registerTesting(api,{subscriptions:[]},async()=>{},index);await manager.discover();assert.equal(h.controller.items.size,1);
 // Simulate a completed pull: a new test arrives and an old file is removed,
 // without any watcher event being delivered to VS Code.
 files.delete('file:///C:/pull/Old.cls');files.set('file:///C:/pull/New.cls',source('New'));
 await h.controller.refreshHandler();
 assert.equal(h.controller.items.size,1);assert.ok(h.controller.items.get('file:///C:/pull/New.cls'));assert.equal(h.controller.items.has('file:///C:/pull/Old.cls'),false);
 index.dispose();
});
test('a pull rescan updates closed test metadata and preserves unsaved editor definitions',async()=>{
 const uri='file:///C:/pull/Test.cls',files=new Map([[uri,source('Original')]]);
 const index=new SourceIndex({list:async()=>[...files.keys()],read:async uri=>files.get(uri)});
 await index.ready();files.set(uri,source('Pulled'));await index.rescan();assert.ok(index.project.type('Pulled','Tests'));assert.equal(index.project.type('Original','Tests'),undefined);
 index.document({uri:{toString:()=>uri},version:2,getText:()=>source('Unsaved')});
 files.set(uri,source('AnotherPull'));await index.rescan();assert.ok(index.project.type('Unsaved','Tests'));assert.equal(index.project.type('AnotherPull','Tests'),undefined);index.dispose();
});
test('Testing Debug profile debugs selected methods individually and reports native results',async()=>{
 const h=testingHarness(),disposable=()=>({dispose(){}}),profiles=new Map(),calls=[],uri='file:///C:/pull/Test.cls';
 const index=new SourceIndex({list:async()=>[uri],read:async()=>source('DebugTest')});
 h.controller.createRunProfile=(name,kind,handler)=>{profiles.set(kind,handler);return disposable();};
 const api={...h.api,TestRunProfileKind:{Run:1,Debug:2},window:{showErrorMessage:message=>{throw Error(message);}},workspace:{textDocuments:[],createFileSystemWatcher:()=>({dispose(){},onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable}),onDidOpenTextDocument:disposable,onDidChangeTextDocument:disposable}};
 api.Uri.parse=value=>api.Uri.file(value.replace('file:///',''));
 try{
  const manager=registerTesting(api,{subscriptions:[]},async()=>{throw Error('Used normal test runner');},index,async(uri,method)=>{
   calls.push(method);return {passed:true,report:{tests_completed:true,cleanup_complete:true,results:[{method,status:'passed'}]}};
  });
  await manager.discover();assert.ok(profiles.has(2));await profiles.get(2)(new api.TestRunRequest());
  assert.deepEqual(calls,['check']);assert.equal(h.runs[0].ended,true);assert.ok(h.runs[0].states.some(s=>s.status==='passed'));
 }finally{index.dispose();}
});
