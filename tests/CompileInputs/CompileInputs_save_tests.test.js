'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {prepareCompileInputs}=require('../../extension/src/compile-inputs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-build-inputs-')),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);
 const uri=file=>({scheme:'file',fsPath:file}),folders=[a,b].map(folder=>({uri:uri(folder)})),saved=[];
 const document=(folder,name,success=true)=>({uri:uri(path.join(folder,name)),isDirty:true,async save(){saved.push(name);return success;}});
 const files=['Pet.cls','New.cls','Schema.scm','locales.sec','form.ddx','rename.jcf'].map(name=>uri(path.join(a,name)));
 const documents=[...files.map(file=>document(a,path.basename(file.fsPath))),document(b,'Other.cls'),document(a,'readme.md')];
 const vscode={workspace:{workspaceFolders:folders,textDocuments:documents,getWorkspaceFolder(file){return folders.find(folder=>file.fsPath===folder.uri.fsPath||file.fsPath.startsWith(folder.uri.fsPath+path.sep));},async findFiles(){return [...files,uri(path.join(b,'Other.cls'))];}}};
 return {root,a,b,uri,folders,saved,documents,vscode,dispose(){assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}};
}
test('project input preparation saves dirty native inputs only in the owning workspace before build',async()=>{
 const f=fixture();try{const config={workspaceRoots:[f.a],program:path.join(f.a,'Pet.cls'),projectBuild:true};await prepareCompileInputs(f.vscode,config);assert.deepEqual(f.saved.sort(),['Pet.cls','New.cls','Schema.scm','locales.sec','form.ddx','rename.jcf'].sort());assert.equal(config.files.length,6);assert.ok(config.files.every(file=>file.startsWith(f.a+path.sep)));}finally{f.dispose();}
});
test('failed save prevents dispatch and a parent root cannot compile a nested independently configured workspace',async()=>{
 const f=fixture();try{f.documents[1].save=async()=>false;await assert.rejects(prepareCompileInputs(f.vscode,{workspaceRoots:[f.a],program:path.join(f.a,'Pet.cls'),projectBuild:true}),/save/i);f.folders.push({uri:f.uri(path.join(f.a,'nested'))});await assert.rejects(prepareCompileInputs(f.vscode,{workspaceRoots:[f.a],program:path.join(f.a,'Pet.cls'),projectBuild:true}),/nested workspace/i);}finally{f.dispose();}
});
