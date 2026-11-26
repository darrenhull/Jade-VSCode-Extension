'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
function releasedCapability(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-released-capability-'));
 try{
  const executable=path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe');
  const request={id:1,command:'doctor',config:{sourceFormat:'jox',workingMode:'existing'}};
  const result=spawnSync(executable,['service','--stdio'],{cwd:root,input:JSON.stringify(request)+'\n',encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,JADE_TOOLS_STATE_DIRECTORY:path.join(root,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(root,'connections.json')}});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  const packet=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line)).find(row=>row.event==='result'&&row.id===1);
  assert.equal(packet?.result.passed,true);assert.equal(packet.result.sdkVersion,'0.11.8');
  const capability=packet.result.capabilities.sourceSemantic.providers.find(row=>row.id==='jox');
  assert.equal(capability.checkoutInitialization,false);assert.equal(capability.initialization,true);assert.equal(capability.sync,true);assert.equal(capability.reviewedWorkingSync,true);
  return capability;
 }finally{if(fs.existsSync(path.join(root,'broker','owner.json'))){const stopped=spawnSync(path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe'),['shutdown','--json'],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,JADE_TOOLS_STATE_DIRECTORY:path.join(root,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(root,'connections.json')}});assert.ifError(stopped.error);assert.equal(stopped.status,0,stopped.stderr);}fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
}
module.exports={releasedCapability};
