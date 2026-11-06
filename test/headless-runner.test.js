'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startWorking}=require('../extension/src/headless-runner');
test('headless compile loads changed files in dependency order and never uses the target as its load destination',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-working-plan-')),workspace=path.join(root,'source'),storage=path.join(root,'storage');fs.mkdirSync(workspace);fs.mkdirSync(storage);
 const a=path.join(workspace,'ZBase.cls'),b=path.join(workspace,'AChild.cls');
 fs.writeFileSync(a,'schemaDefinition\nExample subschemaOf RootSchema partialDefinition;\ntypeHeaders\nBase subclassOf Object transient;\ntypeDefinitions\nBase completeDefinition\n(\n)\n');
 fs.writeFileSync(b,'schemaDefinition\nExample subschemaOf RootSchema partialDefinition;\ntypeHeaders\nChild subclassOf Base transient;\ntypeDefinitions\nChild completeDefinition\n(\n)\n');
 const install=path.join(root,'install');fs.mkdirSync(path.join(install,'bin'),{recursive:true});fs.writeFileSync(path.join(install,'bin/jadloadb.exe'),'');
 const loads=[],working={root:storage,databasePath:path.join(storage,'system'),iniPath:path.join(storage,'jade.ini')};fs.mkdirSync(working.databasePath);fs.writeFileSync(path.join(working.databasePath,'_control.dat'),'');fs.writeFileSync(working.iniPath,'');
 const dependencies={prepareWorkingDatabase:async()=>working,loadWorkingFiles:async(w,files)=>{assert.equal(w,working);loads.push(files);return {success:true,code:0,results:files.map(source=>({source,success:true,diagnostics:[]}))};}};
 const config={program:b,schema:'Example',databasePath:'C:/target',installPath:install,storagePath:storage,workspaceRoots:[workspace],files:[b,a]};
 const first=await startWorking(config,'compile',()=>{},()=>{},dependencies).completion;assert.equal(first.passed,true);assert.equal(first.report.workingDatabase,working.databasePath);
 assert.equal(loads.length,1);assert.deepEqual(loads[0],[a,b]);assert.equal(first.report.databaseNeverOpened,false);
 const repeat=await startWorking(config,'compile',()=>{},()=>{},dependencies).completion;assert.equal(repeat.passed,true);assert.equal(loads.length,1,'unchanged sources do not reload');
 fs.appendFileSync(b,'// changed');const changed=await startWorking(config,'compile',()=>{},()=>{},dependencies).completion;assert.equal(changed.passed,true);assert.deepEqual(loads[1],[b]);
 const removed=await startWorking({...config,files:[b]},'compile',()=>{},()=>{},dependencies).completion;assert.equal(removed.passed,false);assert.match(removed.report.error,/removed or renamed/);

});
