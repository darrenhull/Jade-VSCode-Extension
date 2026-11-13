'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../../test/fixtures/class-view.cjs');
test('schema listing reads headers with bounded concurrency without opening documents or initialising native types',async()=>{
 let native=0,opens=0,active=0,peak=0,reads=0;const s=setup({ready:async()=>{native++;}});
 try{
  const headers=Array.from({length:40},(_,i)=>s.vscode.Uri.file('/workspace/schemas/S'+i+'.scm'));
  const texts=new Map(headers.map((uri,i)=>[uri.toString(),'schemaDefinition\nS'+i+' subschemaOf RootSchema partialDefinition;\n']));
  s.vscode.workspace.findFiles=async()=>headers;
  s.vscode.workspace.textDocuments=[];
  s.vscode.workspace.openTextDocument=async uri=>{opens++;return s.doc(uri,texts.get(uri.toString()));};
  s.vscode.workspace.fs.readFile=async uri=>{reads++;active++;peak=Math.max(peak,active);await new Promise(setImmediate);active--;return Buffer.from(texts.get(uri.toString()));};
  const rows=await s.api.provider.getChildren();assert.equal(rows.filter(row=>/^S\d+$/.test(row.name)).length,40);
  assert.equal(opens,0,'Root listing opened header documents');assert.equal(native,0,'Root listing requested native type metadata');assert.equal(reads,40);assert.ok(peak>1&&peak<=8,'Header reads are serial or unbounded');
  await s.api.provider.getChildren();assert.equal(reads,40,'Warm tree rebuilt the resource inventory');
 }finally{s.dispose();}
});
test('schema discovery retains open dirty header buffers and decodes native UTF16 headers',async()=>{
 const s=setup();try{
  const a=s.vscode.Uri.file('/workspace/schemas/Old.scm'),b=s.vscode.Uri.file('/workspace/schemas/Wide.scm');
  s.vscode.workspace.findFiles=async()=>[a,b];const open=s.doc(a,'schemaDefinition\nUnsaved subschemaOf RootSchema partialDefinition;');open.isDirty=true;s.vscode.workspace.textDocuments=[open];
  s.vscode.workspace.fs.readFile=async uri=>{assert.equal(uri.toString(),b.toString(),'Dirty buffer was replaced by disk text');return Buffer.concat([Buffer.from([255,254]),Buffer.from('schemaDefinition\nWide subschemaOf RootSchema partialDefinition;','utf16le')]);};
  const rows=await s.api.provider.getChildren();assert.ok(rows.some(row=>row.name==='Unsaved'));assert.ok(rows.some(row=>row.name==='Wide'));
 }finally{s.dispose();}
});
test('index progress reports active file and refreshes partial schema counts',async()=>{
 const s=setup();try{await s.api.provider.getChildren();let refreshed=0;const listener=s.api.provider.onDidChangeTreeData(()=>{refreshed++;});
 const uri=s.vscode.Uri.file('/workspace/NewFish.cls');s.index.document(s.doc(uri,'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nNewFish subclassOf Object;'));await new Promise(resolve=>setTimeout(resolve,1050));s.index.announce({phase:'indexing',completed:128,total:40096,currentUri:'file:///workspace/SlowFish.cls',elapsedMs:1200},true);
 assert.match(s.api.view.message,/128\/40,096.*1s.*SlowFish.cls/);assert.ok(refreshed>0,'Loaded classes did not trigger a tree refresh');const schemas=await s.api.provider.getChildren(),pets=schemas.find(row=>row.name==='Pets');assert.ok(pets);const children=await s.api.provider.getChildren(pets);assert.ok(children.some(row=>row.name==='NewFish'));assert.doesNotMatch(s.api.provider.getTreeItem(pets).description,/^0 classes/);listener.dispose();}finally{s.dispose();}
});
