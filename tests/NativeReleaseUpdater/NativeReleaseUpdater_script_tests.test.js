'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const name of ['update','download','repair'])test('extension-owned native release updater '+name+' contracts',()=>{
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'NativeReleaseUpdater_'+name+'_tests.ps1')],{encoding:'utf8',windowsHide:true,shell:false,timeout:60000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/PASS NativeReleaseUpdater/);
});
