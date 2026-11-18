'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs');
const {NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
const {registerNativeClassWorkspaces}=require('../../extension/src/native-class-workspaces');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let n=0;n<50&&!predicate();n++)await turn();assert.ok(predicate(),'Expected selected-document operation');}
async function fixture(){
 const members=['first','second'].map(name=>({id:'opaque-'+name,kind:'method',name,parentId:'opaque-type',qualifiedName:{schema:'Exact',type:'Generic',member:name}}));
 const f=setup({reply(command,request){
  if(command==='source.semantic.read'){const doc=structuredClone(f.document);doc.entityId=doc.documentId=request.entityId;doc.projection.text='source '+request.entityId;doc.projection.contentHash=f.hash(doc.projection.text);return{passed:true,code:0,body:doc};}
  if(command==='source.semantic.query')return{passed:true,code:0,body:{provider:'jox',projectId:f.snapshot.projectId,generation:request.generation,items:members,total:2,offset:0,limit:100,nextOffset:null}};
 }});
 const changes=new f.vscode.EventEmitter(),saves=new f.vscode.EventEmitter();f.vscode.workspace.onDidChangeTextDocument=changes.event;f.vscode.workspace.onDidSaveTextDocument=saves.event;
 const open=f.vscode.workspace.openTextDocument.bind(f.vscode.workspace),saving=[];
 let pauseOpen,pauseSave;
 f.vscode.workspace.openTextDocument=async uri=>{
  const entity=f.workspace.record(uri).document.entityId;if(pauseOpen?.entity===entity)await pauseOpen.promise;
  const doc=await open(uri);if(doc.version===undefined){doc.version=1;doc.text=doc.getText();doc.getText=()=>doc.text;doc.save=async()=>{saving.push(doc);if(pauseSave)await pauseSave;doc.isDirty=false;saves.fire(doc);return true;};}return doc;
 };
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});f.workspace=workspace;workspace.register(f.context);
 const project=await workspace.prepare(f.folder),classes=registerNativeClassWorkspaces(f.vscode,f.context,workspace);
 await classes.open({project,entity:{id:'opaque-type',name:'Generic',kind:'class',qualifiedName:{schema:'Exact',type:'Generic'}}});
 const panel=f.panels[0];await panel.receive({command:'ready'});
 const selected=()=>panel.sent.filter(row=>row.command==='editorSnapshot').at(-1)?.snapshot;
 const docFor=id=>f.documents.find(doc=>workspace.record(doc.uri).document.entityId===id);
 return{...f,workspace,project,classes,panel,changes,saves,saving,selected,docFor,
  async select(id){await panel.receive({command:'select',id});return docFor(id);},
  edit(doc,text){doc.text=text;doc.version++;doc.isDirty=true;changes.fire({document:doc,contentChanges:[{text}]});},
  pauseMember(id){let resolve;const promise=new Promise(done=>resolve=done);pauseOpen={entity:id,promise};return()=>{pauseOpen=undefined;resolve();};},
  pauseSave(){let resolve;pauseSave=new Promise(done=>resolve=done);return()=>{pauseSave=undefined;resolve();};},
  dispose(){classes.provider.dispose();workspace.dispose();}};
}

test('selected native member edits and save events update the existing panel dirty/text/path state',async()=>{
 const f=await fixture();try{
  const doc=await f.select('opaque-first');assert.equal(f.selected().dirty,false);
  f.edit(doc,'user unsaved source');await turn();
  assert.equal(f.selected().dirty,true);assert.equal(f.selected().text,'user unsaved source');assert.equal(f.selected().uri,doc.uri.toString());
  const state=f.panel.sent.filter(row=>row.command==='workspace').at(-1).snapshot.document;assert.equal(state.uri,doc.uri.toString());
  const release=f.pauseSave(),saving=f.panel.receive({command:'editorSave'});await until(()=>f.saving.length);
  assert.equal(f.panel.sent.filter(row=>row.command==='saveState').at(-1).dirty,true);assert.equal(doc.isDirty,true);
  release();await saving;assert.equal(f.selected().dirty,false);assert.equal(doc.isDirty,false);
  assert.equal(f.panel.sent.filter(row=>row.command==='saveState').at(-1).dirty,false);
 }finally{f.dispose();}
});

test('unrelated member and class document events cannot dirty the selected panel or replace its document during refresh',async()=>{
 const f=await fixture();try{
  const first=await f.select('opaque-first'),classDoc=f.docFor('opaque-type');
  const other=await f.vscode.workspace.openTextDocument(await f.project.files.open('opaque-second'));
  const before=f.panel.sent.length;f.edit(classDoc,'class changed');f.edit(other,'unrelated changes');await turn();assert.equal(f.panel.sent.length,before);
  await f.classes.refresh(f.project);const state=f.panel.sent.filter(row=>row.command==='workspace').at(-1).snapshot.document;
  assert.equal(state.uri,first.uri.toString());assert.equal(state.dirty,false);assert.equal(first.getText(),'source opaque-first');
 }finally{f.dispose();}
});

test('late native member opening and disposed panels never receive another selections dirty document',async()=>{
 const f=await fixture();let release;try{
  release=f.pauseMember('opaque-first');const stale=f.panel.receive({command:'select',id:'opaque-first'});await turn();
  const second=await f.select('opaque-second');f.edit(second,'new selection dirty');await turn();release();await stale;
  assert.equal(f.selected().member,'second');assert.equal(f.selected().text,'new selection dirty');assert.equal(f.selected().dirty,true);
  const first=f.docFor('opaque-first'),before=f.panel.sent.length;f.edit(first,'stale first change');await turn();assert.equal(f.panel.sent.length,before);
  f.panel.dispose();const closed=f.panel.sent.length;f.edit(second,'after disposal');await turn();assert.equal(f.panel.sent.length,closed);
  assert.equal(f.changes.listeners.size,0);assert.equal(f.saves.listeners.size,0);
 }finally{release?.();f.dispose();}
});

test('saving a prior member cannot clear the current selections unsaved text or dirty save state',async()=>{
 const f=await fixture();let release;try{
  const first=await f.select('opaque-first');f.edit(first,'first dirty');release=f.pauseSave();const saving=f.panel.receive({command:'editorSave'});await until(()=>f.saving.length);
  const second=await f.select('opaque-second');f.edit(second,'second dirty');await turn();release();await saving;
  assert.equal(f.saving[0],first);assert.equal(first.isDirty,false);assert.equal(second.getText(),'second dirty');assert.equal(second.isDirty,true);
  assert.equal(f.selected().member,'second');assert.equal(f.selected().dirty,true);assert.equal(f.panel.sent.filter(row=>row.command==='saveState').at(-1).dirty,true);
 }finally{release?.();f.dispose();}
});
