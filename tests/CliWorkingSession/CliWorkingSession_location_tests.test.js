'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {CliWorkingSession}=require('../../extension/src/cli-client.js');
test('pinned native CLI resolves working.location without Jade installation or database access',{timeout:15000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-working-contract-'));
 const session=new CliWorkingSession({entry:path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe'),spawn:(exe,args,options)=>spawn(exe,args,{...options,env:{...options.env,JADE_TOOLS_STATE_DIRECTORY:path.join(root,'state')}})});
 try{
  const config={installPath:path.join(root,'missing-install'),databasePath:path.join(root,'missing-base'),iniPath:path.join(root,'missing-base/jade.ini'),storagePath:path.join(root,'storage'),workspaceRoots:[path.join(root,'workspace')]};
  const working=await session.workingLocation(config);
  assert.equal(typeof working.databasePath,'string');assert.ok(working.databasePath.length);
  assert.equal(fs.existsSync(config.installPath),false);assert.equal(fs.existsSync(config.databasePath),false);assert.equal(fs.existsSync(path.join(working.databasePath,'_control.dat')),false);
 }finally{
  try{await session.request('shutdown').promise;}finally{const child=session.client?.child;if(child&&child.exitCode===null)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned native service did not exit')),5000);child.once('close',()=>{clearTimeout(timer);resolve();});});session.dispose();fs.rmSync(root,{recursive:true,force:true});}
 }
});
