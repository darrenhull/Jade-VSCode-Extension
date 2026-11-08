'use strict';
const path=require('node:path'),{spawn}=require('node:child_process'),{StringDecoder}=require('node:string_decoder');
function configDto(config){
 const blocked=new Set(['testSession','nativeSession','beforeNativeProcess','signal']);
 return Object.fromEntries(Object.entries(config||{}).filter(([key,value])=>!blocked.has(key)&&typeof value!=='function'));
}
function cliInvocation(entry,args,options={}){
 if(path.extname(entry).toLowerCase()!=='.exe')throw Error('The Jade CLI must be a native Windows executable.');
 const env={...process.env,...options.env};delete env.ELECTRON_RUN_AS_NODE;
 return {executable:entry,args,options:{...options,shell:false,env}};
}
class CliWorkingSession{
 constructor({entry=path.join(__dirname,'../vendor/jade-tools-cli/jade-cli.exe'),spawn:spawnProcess=spawn}={}){
  this.entry=entry;this.spawn=spawnProcess;this.nextId=0;this.pending=new Map();this.client=undefined;this.disposed=false;
 }
 connect(){
  if(this.disposed)throw Error('Jade CLI connection is disposed.');
  if(this.client)return this.client;
  const invocation=cliInvocation(this.entry,['service','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const child=this.spawn(invocation.executable,invocation.args,invocation.options);
  const client={child,decoder:new StringDecoder('utf8'),buffer:'',stderr:''};this.client=client;
  const fail=error=>{
   if(this.client===client)this.client=undefined;
   for(const [id,request]of this.pending)if(request.client===client){this.pending.delete(id);request.reject(error);}
  };
  child.once('error',error=>fail(Error('Jade CLI could not start: '+error.message)));
  child.stdin.on('error',error=>fail(Error('Jade CLI input failed: '+error.message)));
  child.stderr.on('data',bytes=>{client.stderr=(client.stderr+bytes.toString('utf8')).slice(-8192);});
  child.stdout.on('data',bytes=>{
   try{
    client.buffer+=client.decoder.write(bytes);
    if(Buffer.byteLength(client.buffer)>8*1024*1024)throw Error('Jade CLI response exceeds the 8 MiB transport limit.');
    let newline;
    while((newline=client.buffer.indexOf('\n'))>=0){const line=client.buffer.slice(0,newline).trim();client.buffer=client.buffer.slice(newline+1);if(!line)continue;const packet=JSON.parse(line),request=this.pending.get(packet.id);if(!request||request.client!==client)continue;
     if(packet.event==='output')request.output?.(packet.text||'');
     else if(packet.event==='result'){this.pending.delete(packet.id);request.resolve(packet.result);}
    }
   }catch(error){fail(Error('Invalid Jade CLI response: '+error.message));child.kill();}
  });
  child.once('close',(code,signal)=>fail(Error('Jade CLI closed before completing its request (exit '+code+(signal?', '+signal:'')+').'+(client.stderr?' '+client.stderr:''))));
  return client;
 }
 request(command,body={},output){
  const client=this.connect(),id=++this.nextId;
  const promise=new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject,output,client});
   try{client.child.stdin.write(JSON.stringify({id,command,...body})+'\n');}catch(error){this.pending.delete(id);reject(error);}
  });
  return {id,promise};
 }
 startWorking(config,operation,onOutput=()=>{},onReport=()=>{}){
  let request,cancelled=false;
  const completion=(async()=>{
   try{
    if(!['compile','test.run'].includes(operation))throw Error('Unsupported Jade CLI operation: '+operation);
    request=this.request(operation==='compile'?'build':'test',{config:configDto(config)},onOutput);
    const result=await request.promise;
    if(!result||typeof result.passed!=='boolean'||!Number.isInteger(result.code))throw Error('Jade CLI returned an incomplete operation result.');
    if(result.report)onReport(result.report);
    return result;
   }catch(error){return {passed:false,code:2,cancelled,report:{source:config.program,compiled:false,success:false,error:error.message}};}
  })();
  return {completion,stop:()=>{cancelled=true;if(request)void this.request('cancel',{operationId:request.id}).promise.catch(()=>{});}};
 }
 async release(){
  if(!this.client)return;
  const result=await this.request('disconnect').promise;
  if(result?.passed===false)throw Error(result.report?.error||'Jade CLI could not release its native session.');
 }
 async resolveNative(command,config,field,body={},output){
  const request=this.request(command,{config:configDto(config),...body},output);
  const abort=()=>{void this.request('cancel',{operationId:request.id}).promise.catch(()=>{});};
  config?.signal?.addEventListener('abort',abort,{once:true});if(config?.signal?.aborted)abort();
  try{
   const result=await request.promise;
   if(result?.passed!==true)throw Error(result?.report?.error||'Native Jade target resolution failed.');
   const value=result[field];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Native Jade target resolution returned an incomplete result.');
   return value;
  }finally{config?.signal?.removeEventListener('abort',abort);}
 }
 workingLocation(config){return this.resolveNative('working.location',config,'working');}
 prepareWorking(config,output){return this.resolveNative('working.prepare',config,'working',{},output);}
 inspectionTarget(config,target,output){return this.resolveNative('inspect.target',config,'config',{target},output);}
 runNative(executable,args,options={},output=()=>{}){
  const config=configDto({...options,installPath:options.installPath||path.dirname(path.dirname(executable))});
  for(const name of ['path','ini','server']){const value=args.find(value=>value.startsWith(name+'='))?.slice(name.length+1);if(value)config[{path:'databasePath',ini:'iniPath',server:'server'}[name]]=value;}
  const request=this.request('native.run',{config,executable,args,options:{timeoutMilliseconds:options.timeoutMilliseconds,cwd:options.cwd,root:options.root}},output);
  const abort=()=>{void this.request('cancel',{operationId:request.id}).promise.catch(()=>{});};
  options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  return request.promise.finally(()=>options.signal?.removeEventListener('abort',abort));
 }
 dispose(){
  this.disposed=true;
  const client=this.client;this.client=undefined;
  if(client)client.child.kill();
 }
}
module.exports={CliWorkingSession,configDto,cliInvocation};
