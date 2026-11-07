'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {prepareCompileInputs}=require('../../extension/src/compile-inputs');
const {registerCompileCommands}=require('../../extension/src/compile-commands');
function harness(t,{snapshot=true,saveResult=true,saveThrows=false,keepDirty=false}={}){
 const root=path.resolve('virtual-save-project'),snapshotRoot=path.join(root,'baseline'),otherSnapshot=path.join(root,'unrelated-baseline'),saved=[],commands=new Map(),native=[],output=[];
 const uri=file=>({scheme:'file',fsPath:file}),folder={uri:uri(root)},active={uri:uri(path.join(snapshot?snapshotRoot:root,'Active.cls')),isDirty:true,async save(){saved.push('active');if(saveThrows)throw Error('Active save threw');if(saveResult&&!keepDirty)this.isDirty=false;return saveResult;}};
 const ordinary={uri:uri(path.join(root,'Other.cls')),isDirty:true,async save(){saved.push('ordinary');this.isDirty=false;return true;}},unrelated={uri:uri(path.join(otherSnapshot,'Ignored.cls')),isDirty:true,async save(){saved.push('snapshot');return true;}};
 const original=fs.existsSync,markers=new Set([path.join(snapshotRoot,'.jade-extraction'),path.join(otherSnapshot,'.jade-extraction')]);fs.existsSync=file=>markers.has(String(file))||original(file);t.after(()=>{fs.existsSync=original;});
 let discoveries=0;
 const vscode={workspace:{workspaceFolders:[folder],textDocuments:[active,ordinary,unrelated],getWorkspaceFolder:()=>folder,async findFiles(){discoveries++;return[ordinary.uri,active.uri,unrelated.uri];}},commands:{registerCommand(name,handler){commands.set(name,handler);return{dispose(){}};}},window:{activeTextEditor:{document:active},showErrorMessage(){},withProgress:async(_,callback)=>callback({}, {isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})})},ProgressLocation:{Notification:1},Uri:{file:uri}};
 const services={beforeOperation:async()=>{},isBusy:()=>false,setBusy:async()=>{},classConfig:()=>({program:active.uri.fsPath,workspaceRoots:[root]}),workingFiles:config=>prepareCompileInputs(vscode,config),nativeTests:{release:async()=>{}},startWorking:config=>{native.push(config);return{stop(){},completion:Promise.resolve({passed:true,code:0,report:{loaded_files:0}})};},output:{clear(){},show(){},append(){},appendLine:text=>output.push(text)},diagnostics:{delete(){}},reportDiagnostic(){}};
 registerCompileCommands(vscode,{subscriptions:[]},services);return{active,ordinary,unrelated,saved,native,output,discoveries:()=>discoveries,run:project=>commands.get(project?'jadeNative.buildWorkspace':'jadeNative.compileClass')()};
}
for(const project of[false,true]){
 const mode=project?'workspace':'current-file';
 test(mode+' saves the selected dirty snapshot once while unrelated snapshots remain excluded',{concurrency:false},async t=>{
  const h=harness(t);const result=await h.run(project);assert.equal(result.passed,true);assert.equal(h.saved.filter(name=>name==='active').length,1);assert.equal(h.active.isDirty,false);assert.equal(h.saved.includes('snapshot'),false);assert.equal(h.native.length,1);assert.ok(h.native[0].files.includes(h.active.uri.fsPath));assert.ok(!h.native[0].files.includes(h.unrelated.uri.fsPath));
 });
 test(mode+' selected ordinary input is not saved a second time by owned-input discovery',{concurrency:false},async t=>{
  const h=harness(t,{snapshot:false,keepDirty:true});assert.equal((await h.run(project)).passed,true);assert.equal(h.saved.filter(name=>name==='active').length,1);assert.equal(h.native.length,1);
 });
 for(const failure of['false','throw'])test(mode+' selected snapshot save '+failure+' aborts before discovery and native execution',{concurrency:false},async t=>{
  const h=harness(t,{saveResult:false,saveThrows:failure==='throw'});const result=await h.run(project);assert.equal(result.passed,false);assert.equal(h.native.length,0);assert.equal(h.discoveries(),0);assert.deepEqual(h.saved,['active']);assert.match(h.output.join('\n'),/Could not save|Active save threw/);
 });
}
