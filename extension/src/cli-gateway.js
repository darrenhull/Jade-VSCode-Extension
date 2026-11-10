'use strict';
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {cliInvocation}=require('./cli-client');
let service;
function configure(value){service=value;}
function spawnHelper(kind,executable,args,options){
 if(!service)return spawn(executable,args,options);
 const invocation=cliInvocation(service.entry,['helper',kind,...args],options);
 return service.spawn(invocation.executable,invocation.args,invocation.options);
}
function spawnUtility(executable,args,options){
 if(!service)return spawn(executable,args,options);
 const selected=service,child=new EventEmitter(),abort=new AbortController();
 child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.stdin.write=()=>true;
 child.exitCode=null;child.signalCode=null;child.timedOut=false;child.cancelled=false;
 let closed=false;
 child.kill=()=>{if(closed)return false;abort.abort();return true;};
 queueMicrotask(async()=>{
  try{const result=await selected.runNative(executable,args,{...options,signal:abort.signal},text=>child.stdout.emit('data',Buffer.from(text)));child.exitCode=result.code??2;child.signalCode=result.signal??null;child.timedOut=result.timedOut===true;child.cancelled=result.cancelled===true;closed=true;child.emit('close',child.exitCode,child.signalCode);}
  catch(error){child.exitCode=2;closed=true;child.emit('error',error);child.emit('close',2);}
 });
 return child;
}
module.exports={configure,current:()=>service,spawnHelper,spawnUtility};
