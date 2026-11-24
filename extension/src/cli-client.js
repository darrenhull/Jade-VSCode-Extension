'use strict';
const path=require('node:path'),{spawn}=require('node:child_process'),{StringDecoder}=require('node:string_decoder');
const {sourceConfiguration,requireWorkingJadeGitPolicy}=require('./working-jadegit-policy');
function configDto(config){
 const blocked=new Set(['testSession','nativeSession','beforeNativeProcess','signal']);
 return Object.fromEntries(Object.entries(config||{}).filter(([key,value])=>!blocked.has(key)&&typeof value!=='function'&&!(key==='workingJadeGitPolicy'&&value==='inherit')));
}
function cliInvocation(entry,args,options={}){
 if(path.extname(entry).toLowerCase()!=='.exe')throw Error('The Jade CLI must be a native Windows executable.');
 const env={...process.env,...options.env};delete env.ELECTRON_RUN_AS_NODE;
 return {executable:entry,args,options:{...options,shell:false,env}};
}
class CliWorkingSession{
 constructor({entry=path.join(__dirname,'../vendor/jade-tools-cli/jade-cli.exe'),spawn:spawnProcess=spawn,shutdownTimeoutMilliseconds=3000,killTimeoutMilliseconds=1000}={}){
  this.entry=entry;this.spawn=spawnProcess;this.nextId=0;this.pending=new Map();this.client=undefined;this.disposed=false;this.activeSources=new Set();
  if (![shutdownTimeoutMilliseconds,killTimeoutMilliseconds].every(value=>Number.isSafeInteger(value)&&value>0&&value<=30000)) throw Error('Invalid owned CLI shutdown deadline.');
  this.shutdownTimeoutMilliseconds=shutdownTimeoutMilliseconds;
  this.killTimeoutMilliseconds=killTimeoutMilliseconds;
  this.ownedClients=new Set();this.forks=new Set();
 }
 fork(){
  if(this.disposed)throw Error('Jade CLI connection is disposed.');
  const child=new CliWorkingSession({entry:this.entry,spawn:this.spawn,shutdownTimeoutMilliseconds:this.shutdownTimeoutMilliseconds,killTimeoutMilliseconds:this.killTimeoutMilliseconds});
  child.parent=this;this.forks.add(child);return child;
 }
 connect(){
  if(this.disposed)throw Error('Jade CLI connection is disposed.');
  if(this.client)return this.client;
  const invocation=cliInvocation(this.entry,['service','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const child=this.spawn(invocation.executable,invocation.args,invocation.options);
  const client={child,decoder:new StringDecoder('utf8'),buffer:'',stderr:'',closed:false};
  client.closePromise=new Promise(resolve=>{client.resolveClose=resolve;});
  this.ownedClients.add(client);this.client=client;
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
     else if(typeof packet.event==='string'&&packet.event.startsWith('source.'))request.events?.(packet);
     else if(packet.event==='result'){this.pending.delete(packet.id);request.resolve(packet.result);}
    }
   }catch(error){fail(Error('Invalid Jade CLI response: '+error.message));child.kill();}
  });
  child.once('close',(code,signal)=>{
   client.closed=true;this.ownedClients.delete(client);
   fail(Error('Jade CLI closed before completing its request (exit '+code+(signal?', '+signal:'')+').'+(client.stderr?' '+client.stderr:'')));
   client.resolveClose({code,signal});
  });
  return client;
 }
 request(command,body={},output,events,expectedClient){
  if((command.startsWith('inspect.')||command==='working.location')&&body.config){
   const {cwd,configFile,...config}=body.config;
   body={...body,config,...(body.cwd===undefined&&cwd!==undefined?{cwd}:{}),
    ...(body.configFile===undefined&&configFile!==undefined?{configFile}:{})};
  }
  if(command.startsWith('source.')&&!command.startsWith('source.semantic.')&&body.config)body={...body,config:sourceConfiguration(body.config)};
  if(expectedClient&&this.client!==expectedClient)throw Error("The original native source connection is closed.");
  const client=expectedClient||this.connect(),id=++this.nextId;
  const promise=new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject,output,events,client,command});
   try{client.child.stdin.write(JSON.stringify({id,command,...body})+'\n');}catch(error){this.pending.delete(id);reject(error);}
  });
  const pending=this.pending.get(id);if(pending)pending.promise=promise;
  return {id,promise,client};
 }
 startWorking(config,operation,onOutput=()=>{},onReport=()=>{}){
  let request,cancelled=false;
  const completion=(async()=>{
   try{
    if(!['compile','test.run'].includes(operation))throw Error('Unsupported Jade CLI operation: '+operation);
    if(config?.workingJadeGitPolicy&&config.workingJadeGitPolicy!=='inherit'){
     await requireWorkingJadeGitPolicy(this,config);
     if(cancelled)return {passed:false,code:130,cancelled:true,report:{compiled:false,executed:false,error:'Working operation cancelled.'}};
    }
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
  if((command.startsWith('working.')||command==='inspect.target'&&body.target==='working')&&config?.workingJadeGitPolicy&&config.workingJadeGitPolicy!=='inherit')
   await requireWorkingJadeGitPolicy(this,config);
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
 prepareWorking(config,output,options={}){return this.resolveNative('working.prepare',config,'working',options,output);}
 inspectionTarget(config,target,output){return this.resolveNative('inspect.target',target==='source'?sourceConfiguration(config):config,'config',{target},output);}
 async runNative(executable,args,options={},output=()=>{}){
  const config=configDto({...options,installPath:options.installPath||path.dirname(path.dirname(executable))});
  for(const name of ['path','ini','server']){const value=args.find(value=>value.startsWith(name+'='))?.slice(name.length+1);if(value)config[{path:'databasePath',ini:'iniPath',server:'server'}[name]]=value;}
  if(config.workingJadeGitPolicy&&config.workingJadeGitPolicy!=='inherit')await requireWorkingJadeGitPolicy(this,config);
  if(options.signal?.aborted)return {code:130,success:false,cancelled:true,output:''};
  const request=this.request('native.run',{config,executable,args,options:{timeoutMilliseconds:options.timeoutMilliseconds,cwd:options.cwd,root:options.root}},output);
  const abort=()=>{void this.request('cancel',{operationId:request.id}).promise.catch(()=>{});};
  options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  return request.promise.finally(()=>options.signal?.removeEventListener('abort',abort));
 }
 async sourceCapabilities(config,body={}){
  const connection=this.connect();
  const result=this.resolveNative('doctor',sourceConfiguration(config),'capabilities',body);
  if(!connection.workingJadeGitCapability){
   // Only this process-wide descriptor is retained, never project Source capabilities.
   const probe=result.then(capabilities=>structuredClone(capabilities.workingJadeGitPolicy));
   connection.workingJadeGitCapability=probe;
   void probe.catch(()=>{if(connection.workingJadeGitCapability===probe)delete connection.workingJadeGitCapability;});
  }
  return result;
 }
 async workingJadeGitCapability(config){
  const connection=this.connect();
  if(!connection.workingJadeGitCapability)await this.sourceCapabilities(config);
  const descriptor=await connection.workingJadeGitCapability;
  if(this.client!==connection)throw Error('The Jade CLI connection closed or changed during the Working capability check. Retry the operation.');
  return descriptor;
 }
 startSourceExtraction(config,selection,callbacks){
  return this.startExtraction(sourceConfiguration(config),selection,callbacks,'source.extract');
 }
 startWorkingSync(config,selection,callbacks){
  return this.startExtraction(config,selection,callbacks,'working.sync');
 }
 startWorkingBaselineVerification(config,selection,callbacks){
  return this.startExtraction(config,selection,callbacks,'working.baseline.verify');
 }
 startExtraction(config,selection,callbacks,command){
  const {SourceExtractionOperation}=require('./SourceExtractionOperation');
  const operation=new SourceExtractionOperation(this,configDto(config),selection,callbacks,command);
  this.activeSources.add(operation);
  operation.completion.then(()=>this.activeSources.delete(operation),()=>this.activeSources.delete(operation));
  return operation;
 }
 dispose(){
  if(this.disposed)return this.closing;
  const clients=[...this.ownedClients],active=[...this.activeSources];
  const operations=[...this.pending.entries()].filter(([,request])=>clients.includes(request.client));
  this.disposed=true;
  // Cancellation stays on the original connection. EOF alone is not cancellation.
  for(const operation of active)operation.stop();
  const sourceIds=new Set(active.map(operation=>operation.id));
  for(const [id,request]of operations){
   if(sourceIds.has(id)||['cancel','source.cancel','source.permit'].includes(request.command))continue;
   try{void this.request('cancel',{operationId:id},undefined,undefined,request.client).promise.catch(()=>{});}catch{}
  }
  this.closing=Promise.allSettled([...this.forks].map(child=>child.dispose()).concat(this.closeOwnedClients(clients,[...operations.map(([,request])=>request.promise),...active.map(operation=>operation.completion)]))).then(results=>{const failed=results.filter(result=>result.status==='rejected').map(result=>result.reason);if(failed.length===1)throw failed[0];if(failed.length)throw new AggregateError(failed,'Owned Jade CLI sessions did not all confirm exit.');});
  // VS Code subscriptions may call dispose without awaiting it. deactivate still
  // returns this same rejecting promise; an unconfirmed exit is never success.
  void this.closing.then(()=>this.parent?.forks.delete(this),()=>this.parent?.forks.delete(this));
  void this.closing.catch(()=>{});
  return this.closing;
 }
 async closeOwnedClients(clients,operations){
  const deadline=Date.now()+this.shutdownTimeoutMilliseconds;
  const wait=async(promise,milliseconds)=>{
   if(milliseconds<=0)return false;
   let timer;
   try{return await Promise.race([promise.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);}
   finally{clearTimeout(timer);}
  };
  const closed=()=>Promise.all(clients.map(client=>client.closePromise));
  if(await wait(Promise.allSettled(operations),deadline-Date.now())){
   for(const client of clients){
    if(client.closed)continue;
    try{client.child.stdin.end();}catch{/* The bounded owned-child fallback below still applies. */}
   }
   if(await wait(closed(),deadline-Date.now()))return;
  }
  // This is the captured stdio child only, never the shared broker or its JADE jobs.
  for(const client of clients)if(!client.closed){try{client.child.kill();}catch{}}
  if(!await wait(closed(),this.killTimeoutMilliseconds))
   throw Error('The owned Jade CLI service did not confirm exit after bounded shutdown.');
 }
}
module.exports={CliWorkingSession,configDto,cliInvocation};
