'use strict';
const {diagnosticLines}=require('./compiler-diagnostic-presentation');
const text=value=>String(value).replace(/[\r\n\x00-\x1f]+/g,' ').slice(0,1024);
/** UI-only liveness: it never changes the CLI deadline or owns native cancellation. */
class WorkingSetupProgress {
 constructor({output,operation,target,progress,now=Date.now,setInterval:interval=global.setInterval,clearInterval:clear=global.clearInterval}){
  Object.assign(this,{output,operation,target,progress,now,interval,clear});
 }
 line(message){this.output.appendLine('['+new Date(this.now()).toISOString()+'] '+message);}
 diagnostics(value){
  const report=value?.report||value?.body?.report||{},stages=report.setupStages||report.executionStages;
  for(const row of Array.isArray(stages)?stages.slice(0,32):[])if(typeof row?.stage==='string')
   this.line('CLI stage '+text(row.stage)+': '+text(row.status||'reported')+(Number.isFinite(row.elapsedMilliseconds)?' ('+row.elapsedMilliseconds+' ms)':''));
  for(const key of ['nativeExitCode','operationId','queueMilliseconds','elapsedMilliseconds','nativeClosed','nativeExitUnconfirmed','ownershipError'])
   if(['string','number','boolean'].includes(typeof report[key]))this.line('CLI '+key+'='+text(report[key]));
  const broker=report.brokerDiagnostics||value?.brokerDiagnostics||value?.body?.brokerDiagnostics;
  if(broker&&typeof broker==='object'){
   const fields=['status','stage','lastCompletedStage','operation','operationId','pid','brokerPid','brokerPID','brokerInstance','processState','terminationStatus','exitCode','exitCodeHex','stderrAvailable','stderrStatus','diagnosticsIncomplete','elapsedMilliseconds','queueMilliseconds','nativeOutputBytes','nativeClosed','nativeExitConfirmed','error'];
   const parts=fields.filter(key=>['string','number','boolean'].includes(typeof broker[key])).map(key=>key+'='+text(broker[key]));
   if(parts.length)this.line('CLI broker diagnostics: '+parts.join('; '));
   for(const row of Array.isArray(broker.logTail)?broker.logTail.slice(-8):[])
    if(typeof row?.stage==='string'&&typeof row?.status==='string')this.line('CLI broker stage '+text(row.stage)+': '+text(row.status)+(Number.isFinite(row.elapsedMilliseconds)?' ('+row.elapsedMilliseconds+' ms)':''));
  }
  for(const row of Array.isArray(report.diagnostics)?report.diagnostics.slice(0,50):[])
   for(const line of diagnosticLines(row))this.line('CLI '+text(line));
 }
 async run(operation,token){
  const started=this.now();let lastNative=started,nativeOutput=false,cancellation;
  this.output.show(true);
  this.line('Working setup: '+text(this.operation)+'; target: '+text(this.target||'reviewed Working database')+'; stage: dispatching native request.');
  const timer=this.interval(()=>{
   const elapsed=Math.floor((this.now()-started)/1000),quiet=Math.floor((this.now()-lastNative)/1000);
   const status=elapsed+'s elapsed; '+(nativeOutput?'no native output for '+quiet+'s':'no native output yet')+'; waiting for native completion.';
   this.line(status);this.progress?.report({message:status});
  },10000);timer?.unref?.();
  const write=value=>{lastNative=this.now();nativeOutput=true;this.output.append(value);};
  try{
   cancellation=token?.onCancellationRequested?.(()=>this.line('Cancellation requested; waiting for native acknowledgement and completion.'));
   const result=await operation(write);this.diagnostics(result);
   const failed=result?.passed===false||result?.code>0;
   this.line((failed?'Failed':'Completed')+' after '+Math.floor((this.now()-started)/1000)+'s.');return result;
  }catch(error){
   this.diagnostics(error.result);
   const cancelled=error.cancelled===true||error.result?.cancelled===true||error.result?.code===130;
   this.line((cancelled?'Cancelled':'Failed')+' after '+Math.floor((this.now()-started)/1000)+'s: '+text(error.message));throw error;
  }finally{this.clear(timer);cancellation?.dispose();}
 }
}
module.exports={WorkingSetupProgress};
