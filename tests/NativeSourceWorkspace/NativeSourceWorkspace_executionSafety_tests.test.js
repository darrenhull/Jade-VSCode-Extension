'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {setup}=require('./fixtures/vscode.cjs');
const {NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
async function fixture({external=false,prepared=true,nativeAlias=false,prepareReply}={}){
 const owned=fs.mkdtempSync(path.join(os.tmpdir(),'jade-jox-dirty-control-'));
 const projectRoot=path.join(owned,'project'),sourceRoot=external?path.join(owned,'external-sources'):path.join(projectRoot,'sources');
 fs.mkdirSync(projectRoot,{recursive:true});fs.mkdirSync(sourceRoot,{recursive:true});
 const saved=path.join(sourceRoot,'Local.jox');fs.writeFileSync(saved,'saved native source');
 const aliases=[];let nativeRoot=fs.realpathSync.native(sourceRoot);
 if(nativeAlias){nativeRoot=path.join(owned,'native-root-alias');fs.symlinkSync(sourceRoot,nativeRoot,'junction');aliases.push(nativeRoot);}
 let f;
 f=setup({reply:(command,request)=>{
  if(command==='source.semantic.prepare'&&prepareReply)return prepareReply(request,f);
  if(command==='source.semantic.prepare')return{passed:true,code:0,body:{...structuredClone(f.snapshot),projectRoot:f.vscode.Uri.file(projectRoot).toString(),sourceRoots:[f.vscode.Uri.file(nativeRoot).toString()]}};
  if(command==='test')return{passed:true,code:0,report:{tests_completed:true,cleanup_complete:true,results:[]}};
 }});
 const folder={name:'Project',uri:f.vscode.Uri.file(projectRoot)};f.vscode.workspace.workspaceFolders=[folder];
 f.vscode.workspace.getWorkspaceFolder=uri=>f.vscode.workspace.workspaceFolders.filter(value=>{
  const relative=path.relative(value.uri.fsPath,uri.fsPath);return relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
 }).sort((a,b)=>b.uri.fsPath.length-a.uri.fsPath.length)[0];
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>({sourceFormat:'jox'})});workspace.register(f.context);
 const project=prepared?await workspace.prepare(folder):workspace.project(folder);
 return{...f,owned,projectRoot,sourceRoot,saved,folder,workspace,project,
  dirty(file){const doc={uri:f.vscode.Uri.file(file),isDirty:true,save:()=>assert.fail('Ordinary JOX source must not be saved without user consent')};f.documents.push(doc);return doc;},
  alias(managed=false){const name=managed?path.join(projectRoot,'.jade','source-alias'):path.join(owned,'source-alias');fs.mkdirSync(path.dirname(name),{recursive:true});fs.symlinkSync(sourceRoot,name,'junction');aliases.push(name);return name;},
  run(options){return workspace.execute(project,'test',{entityIds:['native-method']},options);},
  cleanup(){workspace.dispose();for(const alias of aliases)fs.unlinkSync(alias);
   assert.equal(path.dirname(fs.realpathSync(owned)),fs.realpathSync(os.tmpdir()));assert.match(path.basename(owned),/^jade-jox-dirty-control-/);
   fs.rmSync(owned,{recursive:true,force:true});assert.equal(fs.existsSync(owned),false);}
 };
}
for(const external of [false,true])test('dirty native-owned JOX is refused across '+(external?'external source roots':'nested workspace folders'),async()=>{
 const f=await fixture({external});try{
  const directory=external?f.sourceRoot:path.join(f.sourceRoot,'nested');fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,'Changed.jox');fs.writeFileSync(file,'saved bytes');
  if(!external)f.vscode.workspace.workspaceFolders.push({name:'Nested',uri:f.vscode.Uri.file(directory)});
  f.dirty(file);const before=f.requests.length;
  await assert.rejects(f.run(),/Save the JOX/);assert.equal(f.requests.slice(before).some(row=>row.command==='test'),false);
  assert.equal(f.workspace.executing,false);assert.equal(fs.readFileSync(file,'utf8'),'saved bytes');
 }finally{f.cleanup();}
});
test('dirty unrelated and sibling-prefix JOX outside native roots does not block the selected project',async()=>{
 const f=await fixture();try{
  const sibling=f.sourceRoot+'-other';fs.mkdirSync(sibling);const foreign=path.join(sibling,'Other.jox');fs.writeFileSync(foreign,'foreign');
  const excluded=path.join(f.projectRoot,'NotInNativeRoot.jox');fs.writeFileSync(excluded,'excluded');f.dirty(foreign);f.dirty(excluded);
  const managed=path.join(f.sourceRoot,'.jade','working','Generated.jox');fs.mkdirSync(path.dirname(managed),{recursive:true});fs.writeFileSync(managed,'private generated');f.dirty(managed);
  assert.equal((await f.run()).passed,true);assert.equal(f.requests.filter(row=>row.command==='test').length,1);
 }finally{f.cleanup();}
});
for(const exists of [true,false])test('native-root physical alias retains dirty ownership for '+(exists?'existing':'externally deleted')+' JOX',async()=>{
 const f=await fixture();try{
  const alias=f.alias(),file=path.join(alias,exists?'Local.jox':'Deleted.jox');f.dirty(file);
  await assert.rejects(f.run(),/Save the JOX/);assert.equal(f.requests.some(row=>row.command==='test'),false);
 }finally{f.cleanup();}
});
test('cold execution obtains native root authority before refusing an external owned dirty document',async()=>{
 const f=await fixture({external:true,prepared:false});try{
  f.dirty(f.saved);await assert.rejects(f.run(),/Save the JOX/);
  assert.deepEqual(f.requests.map(row=>row.command),['source.semantic.prepare']);
 }finally{f.cleanup();}
});

for(const cancelled of [false,true])test('owned dirty projections are awaited before execution and save cancellation is preserved: '+cancelled,async()=>{
 const f=await fixture();try{
  const saves=[];
  for(const name of ['first','second']){
   const uri=f.vscode.Uri.from({scheme:'jade-source',path:'/'+name+'.jade'});
   const doc={uri,isDirty:true,async save(){saves.push(name);if(cancelled&&name==='second')return false;this.isDirty=false;return true;}};
   f.project.files.documents.set(uri.toString(),{uri,document:f.document});f.documents.push(doc);
  }
  f.documents.push({uri:f.vscode.Uri.from({scheme:'jade-source',path:'/foreign.jade'}),isDirty:true,save:()=>assert.fail('Foreign projection was saved')});
  if(cancelled){await assert.rejects(f.run(),/Save the source document/);assert.equal(f.requests.some(row=>row.command==='test'),false);assert.equal(f.documents[1].isDirty,true);}
  else assert.equal((await f.run()).passed,true);
  assert.deepEqual(saves,['first','second']);assert.equal(f.workspace.executing,false);
 }finally{f.cleanup();}
});

test('a native-returned root alias still owns a dirty document using the physical long path',async()=>{
 const f=await fixture({nativeAlias:true});try{
  f.dirty(f.saved);await assert.rejects(f.run(),/Save the JOX/);assert.equal(f.requests.some(row=>row.command==='test'),false);
 }finally{f.cleanup();}
});
test('an editor alias inside .jade cannot hide dirty source physically owned by a native root',async()=>{
 const f=await fixture();try{
  f.dirty(path.join(f.alias(true),'Local.jox'));await assert.rejects(f.run(),/Save the JOX/);assert.equal(f.requests.some(row=>row.command==='test'),false);
 }finally{f.cleanup();}
});

const settleClose=()=>new Promise(resolve=>setTimeout(resolve,5));
async function editor(){
 const f=setup({flags:{documentReopen:true},reply:command=>command==='source.semantic.closeDocument'?{passed:true,code:0,body:{closed:true}}:undefined});
 f.document.documentBinding={format:1,key:'a'.repeat(32),projectUri:f.folder.uri.toString()};
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});workspace.register(f.context);
 const project=await workspace.prepare(f.folder),uri=await workspace.open(project,f.document.entityId);
 const document=f.documents.find(value=>value.uri.toString()===uri.toString());document.isClosed=false;
 return{...f,workspace,project,uri,document};
}
for(const replacement of [false,true])test('language-change close/open events retain the live native editor binding: replacement='+replacement,async()=>{
 const f=await editor();try{
  // Actual Code1.146 trace: close arrives for the same nonclosed document
  // still in textDocuments, then open follows. Also guard a replacement model.
  f.closed.fire(f.document);
  if(replacement){f.document.isClosed=true;f.documents.splice(f.documents.indexOf(f.document),1,{...f.document,isClosed:false});}
  await settleClose();assert.equal(f.project.files.documents.has(f.uri.toString()),true);
  assert.equal(f.requests.some(row=>row.command==='source.semantic.closeDocument'),false);
 }finally{f.workspace.dispose();}
});
test('genuine clean close releases once after document membership settles and an immediate reopen wins',async()=>{
 const f=await editor();try{
  f.closed.fire(f.document);f.documents.splice(f.documents.indexOf(f.document),1);
  await settleClose();assert.equal(f.project.files.documents.has(f.uri.toString()),false);
  assert.equal(f.requests.filter(row=>row.command==='source.semantic.closeDocument').length,1);
 }finally{f.workspace.dispose();}
 const reopened=await editor();try{
  reopened.documents.length=0;reopened.closed.fire(reopened.document);reopened.documents.push({...reopened.document});
  await settleClose();assert.equal(reopened.project.files.documents.has(reopened.uri.toString()),true);
  assert.equal(reopened.requests.some(row=>row.command==='source.semantic.closeDocument'),false);
 }finally{reopened.workspace.dispose();}
});
for(const disposed of [false,true])test('dirty hot-exit and disposed workspaces preserve native recovery metadata: disposed='+disposed,async()=>{
 const f=await editor();try{
  f.document.isDirty=!disposed;f.documents.length=0;f.closed.fire(f.document);
  if(disposed)f.workspace.dispose();await settleClose();
  assert.equal(f.requests.some(row=>row.command==='source.semantic.closeDocument'),false);
 }finally{if(!disposed)f.workspace.dispose();}
});
function token(){const listeners=new Set(),value={isCancellationRequested:false,onCancellationRequested(fn){listeners.add(fn);return{dispose:()=>listeners.delete(fn)};}};return{value,cancel(){value.isCancellationRequested=true;for(const fn of listeners)fn();},listeners};}
test('Stop during cold native root preparation cancels the captured request and never executes',async()=>{
 let finish;const stop=token(),native={passed:false,code:130,cancelled:true,report:{error:'Original metadata cancellation'}};
 const f=await fixture({external:true,prepared:false,prepareReply:()=>new Promise(resolve=>finish=resolve)});try{
  const original=f.client.request.bind(f.client);f.client.request=(command,...args)=>{if(command==='cancel')finish(native);return original(command,...args);};
  f.dirty(f.saved);const pending=f.run({token:stop.value});while(!finish)await new Promise(resolve=>setImmediate(resolve));stop.cancel();
  await assert.rejects(pending,error=>error.result===native);
  const request=f.requests.find(row=>row.command==='source.semantic.prepare'),cancel=f.requests.find(row=>row.command==='cancel');
  assert.equal(cancel.body.operationId,request.id);assert.equal(cancel.client,request.client);assert.equal(f.requests.some(row=>row.command==='test'),false);
  assert.equal(f.workspace.executing,false);assert.equal(stop.listeners.size,0);
 }finally{f.cleanup();}
});
test('a genuine cold metadata failure remains primary when Stop races its response',async()=>{
 const stop=token(),native={passed:false,code:6295,report:{error:'Original metadata failure'}};
 const f=await fixture({external:true,prepared:false,prepareReply:()=>{stop.cancel();return native;}});try{
  f.dirty(f.saved);await assert.rejects(f.run({token:stop.value}),error=>error.result===native);
  assert.equal(f.requests.some(row=>row.command==='test'),false);assert.equal(f.workspace.executing,false);
 }finally{f.cleanup();}
});
