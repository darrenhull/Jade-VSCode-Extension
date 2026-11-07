'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function isAlive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
function runNative(executable,args,env){return new Promise((resolve,reject)=>execFile(executable,args,{env,windowsHide:true,timeout:10000,maxBuffer:262144},error=>error?reject(error):resolve()));}

/** Owns one disposable host run, never an inventory of other test directories. */
class HostTestArtifacts{
 constructor({root=os.tmpdir(),minimumFreeBytes=2*1024**3,freeBytes,isAlive:alive=isAlive,runNative:native=runNative,nativeSha256,evidencePath,waitMilliseconds=10000,pollMilliseconds=100}={}){
  if(!Number.isSafeInteger(minimumFreeBytes)||minimumFreeBytes<0)throw Error('Invalid host free-space requirement.');
  this.root=fs.realpathSync(root);this.minimumFreeBytes=minimumFreeBytes;
  this.freeBytes=freeBytes||(()=>{const stats=fs.statfsSync(this.root,{bigint:true});return stats.bavail*stats.bsize;});
  this.isAlive=alive;this.runNative=native;this.nativeSha256=nativeSha256;this.evidencePath=evidencePath;this.waitMilliseconds=waitMilliseconds;this.pollMilliseconds=pollMilliseconds;this.children=[];this.nonce=crypto.randomUUID();
 }
 assertFreeSpace(){if(BigInt(this.freeBytes())<BigInt(this.minimumFreeBytes))throw Error('Insufficient free disk space for an isolated VS Code host; free at least '+this.minimumFreeBytes+' bytes before copying fixtures.');}
 track(child){const entry={child,closed:false};this.children.push(entry);child.once('close',()=>{entry.closed=true;});return child;}
 wait(child,{signal,timeoutMilliseconds=600000}={}){
  this.track(child);
  return new Promise((resolve,reject)=>{
   const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);child.removeListener('close',close);child.removeListener('error',fail);error?reject(error):resolve();};
   const close=code=>finish(code===0?undefined:Error('VS Code host failed (exit '+code+').')),fail=error=>finish(error),cancel=()=>finish(Error('VS Code host cancelled.'));
   const timer=setTimeout(()=>finish(Error('VS Code host timed out.')),timeoutMilliseconds);
   child.once('close',close);child.once('error',fail);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  });
 }
 contained(file){
  const relative=path.relative(this.stage,path.resolve(file));if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Host artifact containment check failed.');
  let current=path.resolve(file);while(current!==this.stage){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Host artifact symbolic link refused.');current=path.dirname(current);}
  return file;
 }
 assertOwned(){
  if(fs.lstatSync(this.stage).isSymbolicLink()||path.dirname(fs.realpathSync(this.stage))!==this.root)throw Error('Host stage containment/symbolic link check failed.');
  if(fs.readFileSync(path.join(this.stage,'.jade-host-owner'),'utf8')!==this.nonce)throw Error('Host stage ownership marker changed.');
 }
 async waitClosed(pids=[]){
  const start=Date.now();while(this.children.some(entry=>!entry.closed)||pids.some(pid=>this.isAlive(pid))){if(Date.now()-start>=this.waitMilliseconds)throw Error('Owned host/native process is still running; artifacts retained at '+this.stage);await sleep(this.pollMilliseconds);}
 }
 async closeNative(){
  const executable=this.contained(path.join(this.stage,'extension/vendor/jade-tools-cli/jade-cli.exe'));
  for(const name of ['broker','cli-broker']){
   const state=this.contained(path.join(this.stage,name)),owner=this.contained(path.join(state,'owner.json'));
   if(!fs.existsSync(owner))continue;
   if(fs.statSync(owner).size>65536)throw Error('Invalid owned broker metadata.');
   const record=JSON.parse(fs.readFileSync(owner,'utf8')),nativePids=record.nativePIDs===undefined?[]:record.nativePIDs;
   if(!Number.isSafeInteger(record.brokerPID)||record.brokerPID<0||!Array.isArray(nativePids)||!nativePids.every(pid=>Number.isSafeInteger(pid)&&pid>0))throw Error('Invalid owned broker process identity.');
   // Native graceful shutdown writes brokerPID=0. Never probe that sentinel
   // or launch a fresh broker just to shut down one which already exited.
   const pids=[...(record.brokerPID?[record.brokerPID]:[]),...nativePids];
   if(!pids.some(pid=>this.isAlive(pid)))continue;
   if(!record.brokerPID||!this.isAlive(record.brokerPID)){await this.waitClosed(nativePids);continue;}
   if(!fs.existsSync(executable))throw Error('Cannot gracefully close owned broker: native CLI is missing.');
   if(!/^[a-f0-9]{64}$/.test(this.nativeSha256||'')||crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex')!==this.nativeSha256)throw Error('Owned native CLI hash changed; shutdown was not executed.');
   await this.runNative(executable,['shutdown','--json'],{...process.env,JADE_TOOLS_STATE_DIRECTORY:state,JADE_TOOLS_CONNECTIONS_FILE:path.join(this.stage,'connections.json')});
   await this.waitClosed(pids);
  }
 }
 async remove(){
  if(!this.stage)return;
  this.assertOwned();
  // Stop only ChildProcess objects created by this run, never matching PIDs
  // discovered by name or command line. A surviving host keeps its files.
  for(const entry of this.children)if(!entry.closed)entry.child.kill();
  const marker=this.contained(path.join(this.stage,'host-process.json'));let pids=[];
  if(fs.existsSync(marker)){const owner=JSON.parse(fs.readFileSync(marker,'utf8'));if(owner.nonce!==this.nonce||!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error('Host process ownership marker is invalid.');pids=[owner.pid];}
  await this.waitClosed(pids);await this.closeNative();this.assertOwned();
  fs.rmSync(this.stage,{recursive:true,force:false});
 }
 cleanup(){return this.cleanupPromise ||= this.remove();}
 saveReport(){
  if(!this.evidencePath)return;
  const report=this.contained(path.join(this.stage,'host-report.json'));if(!fs.existsSync(report))return;
  if(fs.statSync(report).size>262144)throw Error('Host report exceeds the 256 KiB evidence limit.');
  fs.mkdirSync(path.dirname(this.evidencePath),{recursive:true});fs.copyFileSync(report,this.evidencePath);
 }
 async run(action){
  if(this.stage||this.cleanupPromise)throw Error('A host artifact owner can run only once.');
  this.assertFreeSpace();this.stage=fs.mkdtempSync(path.join(this.root,'jade-headless-host-'));
  let value,failure;try{fs.writeFileSync(path.join(this.stage,'.jade-host-owner'),this.nonce);value=await action(this.stage);}catch(error){failure=error;}
  try{this.saveReport();}catch(error){failure=failure?new AggregateError([failure,error],'Host execution and evidence preservation both failed.'):error;}
  try{await this.cleanup();}catch(error){if(failure)throw new AggregateError([failure,error],'Host execution and artifact cleanup both failed.');throw error;}
  if(failure)throw failure;return value;
 }
}
module.exports={HostTestArtifacts};
