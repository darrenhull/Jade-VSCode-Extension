'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
async function cleanupCapabilityFixture(root,executable,primary,{run=spawnSync,alive:isAlive=alive,remove=()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}),pause=()=>new Promise(resolve=>setTimeout(resolve,100)),attempts=50,notStarted=false}={}){
 const failures=primary?[primary]:[],ownerFile=path.join(root,'broker','owner.json');let pids=[],ownershipKnown=false;
 if(notStarted&&!fs.existsSync(ownerFile)){try{remove();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Capability launch and cleanup failed; fixture '+root);return;}
 try{
  for(let i=0;!fs.existsSync(ownerFile)&&i<attempts;i++)await pause();
  if(!fs.existsSync(ownerFile))throw Error('Capability broker ownership unavailable; retained '+root);
  if(fs.existsSync(ownerFile)){
   const owner=JSON.parse(fs.readFileSync(ownerFile,'utf8'));
   if(!Number.isSafeInteger(owner.brokerPID)||owner.brokerPID<0||!Array.isArray(owner.nativePIDs)||!owner.nativePIDs.every(pid=>Number.isSafeInteger(pid)&&pid>0))throw Error('Invalid private capability broker owner');
   ownershipKnown=true;
   pids=[...(owner.brokerPID?[owner.brokerPID]:[]),...owner.nativePIDs];
   if(owner.brokerPID&&isAlive(owner.brokerPID)){const stopped=run(executable,['shutdown','--json'],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,JADE_TOOLS_STATE_DIRECTORY:path.join(root,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(root,'connections.json')}});if(stopped.error)throw stopped.error;assert.equal(stopped.status,0,stopped.stderr);}
  }
 }catch(error){failures.push(error);}
 // A shutdown failure still reaches cleanup, but live native files must remain.
 try{if(!ownershipKnown)throw Error('Invalid ownership; retained '+root);for(let i=0;pids.some(isAlive)&&i<attempts;i++)await pause();if(pids.some(isAlive))throw Error('Owned capability process is still running; retained '+root);
  const finalOwner=JSON.parse(fs.readFileSync(ownerFile,'utf8'));
  if(!Number.isSafeInteger(finalOwner.brokerPID)||finalOwner.brokerPID<0||!Array.isArray(finalOwner.nativePIDs)||!finalOwner.nativePIDs.every(pid=>Number.isSafeInteger(pid)&&pid>0))throw Error('Final capability ownership unavailable; retained '+root);
  const finalPids=[...new Set([...pids,...(finalOwner.brokerPID?[finalOwner.brokerPID]:[]),...finalOwner.nativePIDs])];
  for(let i=0;finalPids.some(isAlive)&&i<attempts;i++)await pause();
  if(finalPids.some(isAlive))throw Error('Final owned capability process is still running; retained '+root);remove();}catch(error){failures.push(error);}
 if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Capability test and cleanup failed; fixture '+root);
}
function confirmedNoLaunch(result){return !!result.error&&!(result.pid>0)&&result.error.code!=='ETIMEDOUT';}
async function releasedCapability(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-released-capability-')),executable=path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe');let primary,capability,notStarted=false;
 try{
  const request={id:1,command:'doctor',config:{sourceFormat:'jox',workingMode:'existing'}};
  const result=spawnSync(executable,['service','--stdio'],{cwd:root,input:JSON.stringify(request)+'\n',encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,JADE_TOOLS_STATE_DIRECTORY:path.join(root,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(root,'connections.json')}});
  notStarted=confirmedNoLaunch(result);
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  const packet=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line)).find(row=>row.event==='result'&&row.id===1);
  assert.equal(packet?.result.passed,true);assert.equal(packet.result.sdkVersion,JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../packages/jade-cli-pin.json'),'utf8')).version);
  capability=packet.result.capabilities.sourceSemantic.providers.find(row=>row.id==='jox');
  assert.equal(capability.checkoutInitialization,false);assert.equal(capability.initialization,true);assert.equal(capability.sync,true);assert.equal(capability.reviewedWorkingSync,true);
 }catch(error){primary=error;}
 await cleanupCapabilityFixture(root,executable,primary,{notStarted});return capability;
}
module.exports={releasedCapability,cleanupCapabilityFixture,confirmedNoLaunch};
