'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createProjectStage,cleanupProjectStage}=require('../../extension/src/native-project-stage-lifecycle');
test('owned cleanup refuses a replacement directory and preserves its files',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-stage-owner-test-')),stage=createProjectStage(root),moved=path.join(root,'original');t.after(()=>{fs.rmSync(stage.directory,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});});
 fs.writeFileSync(path.join(stage.directory,'frozen.scm'),'frozen');fs.renameSync(stage.directory,moved);fs.mkdirSync(stage.directory);fs.writeFileSync(path.join(stage.directory,'unrelated'),'preserve');
 assert.throws(()=>stage.cleanup(),/ownership changed/);assert.equal(fs.readFileSync(path.join(stage.directory,'unrelated'),'utf8'),'preserve');assert.equal(fs.readFileSync(path.join(moved,'frozen.scm'),'utf8'),'frozen');
});
test('owned cleanup rejects a redirected stage without following its target',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-stage-link-test-')),stage=createProjectStage(root);t.after(()=>{fs.rmSync(stage.directory,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});});
 fs.writeFileSync(path.join(root,'unpublished'),'keep');stage.cleanup();fs.symlinkSync(root,stage.directory,process.platform==='win32'?'junction':'dir');assert.throws(()=>stage.cleanup(),/ownership changed/);assert.equal(fs.readFileSync(path.join(root,'unpublished'),'utf8'),'keep');
});
test('cleanup failures remain secondary to an existing native failure or cancellation',async()=>{
 const primary=Object.assign(Error('Jade 6023'),{code:6023}),stage={cleanup(){throw Error('owned stage is locked');}};await cleanupProjectStage(stage,primary);assert.equal(primary.code,6023);assert.equal(primary.message,'Jade 6023');assert.match(primary.cleanupError,/locked/);
 const cancelled={success:false,cancelled:true,code:130};await cleanupProjectStage(stage,cancelled);assert.equal(cancelled.code,130);assert.match(cancelled.cleanupError,/locked/);await assert.rejects(cleanupProjectStage(stage),/locked/);
});
test('owned cleanup unlinks a redirected descendant without deleting its external files',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-stage-child-link-test-')),stage=createProjectStage(root);t.after(()=>{fs.rmSync(stage.directory,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});});
 fs.writeFileSync(path.join(root,'unpublished'),'keep');fs.symlinkSync(root,path.join(stage.directory,'borrowed'),process.platform==='win32'?'junction':'dir');stage.cleanup();assert.equal(fs.existsSync(stage.directory),false);assert.equal(fs.readFileSync(path.join(root,'unpublished'),'utf8'),'keep');
});