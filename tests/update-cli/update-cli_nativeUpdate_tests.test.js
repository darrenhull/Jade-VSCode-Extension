'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('updates through the explicitly pinned native updater without invoking npm or legacy CLI code',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-update-command-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const script=path.join(root,'update.ps1');fs.writeFileSync(script,'param([string]$Root,[string]$Tag)\n@{updated=$true;tag=$Tag;root=$Root}|ConvertTo-Json -Compress');
 const entry=path.resolve(__dirname,'../../scripts/update-cli.cjs');
 const result=spawnSync(process.execPath,[entry,'v0.2.0'],{cwd:os.tmpdir(),env:{...process.env,JADE_NATIVE_UPDATER_SCRIPT:script},encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);const body=JSON.parse(result.stdout);assert.equal(body.tag,'v0.2.0');assert.equal(body.root,path.resolve(__dirname,'../..'));
});
