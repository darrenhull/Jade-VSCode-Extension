'use strict';
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
function compileSummary(report){
  const count=report?.method_count;
  if(report?.error||!Number.isInteger(count))return `Compile check incomplete${Number.isInteger(count)?' after checking '+count+' methods':''}.`;
  return `Checked ${count} methods; ${(report.diagnostics||[]).length} compiler errors.`;
}

function normalize(packet,source) {
  return {...packet,source,compiled:packet.success===true,method_count:packet.methodCount,
    tests_completed:packet.testsCompleted===true,cleanup_complete:packet.cleanupComplete===true,
    tests_selected:packet.testsSelected,
    diagnostics:(packet.diagnostics||[]).map(entry=>({...entry,compiler_error:entry.code}))};
}
function startCpp(config,operation,onOutput=()=>{},onReport=()=>{},dependencies={spawn:(...args)=>require('./cli-gateway').spawnHelper('compiler',...args)}) {
  const id=randomUUID();
  const request={protocolVersion:1,id,operation,events:true,installPath:config.installPath,storagePath:config.storagePath,
    workspaceRoots:config.workspaceRoots,source:config.program,schema:config.schema};
  if(config.systemSnapshotPath)request.snapshot=config.systemSnapshotPath;
  if(operation==='cache.refresh')Object.assign(request,{databasePath:config.databasePath,iniPath:config.iniPath,server:config.server});
  if(config.methods)request.methods=Array.isArray(config.methods)?config.methods:[config.methods];
  const child=dependencies.spawn(config.helperPath,[],{windowsHide:true,shell:false,cwd:path.dirname(config.program)});
  let pending='',report,protocolError,cancelled=false,timedOut=false,settled=false;
  const decoder=new StringDecoder('utf8');const stderr=new StringDecoder('utf8');
  let resolveCompletion;
  const completion=new Promise(resolve=>{resolveCompletion=resolve;});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},config.timeoutMilliseconds??(config.testTimeoutSeconds||120)*1000);
  function line(text) {
    if(!text.trim())return;
    let packet;try{packet=JSON.parse(text);}catch{protocolError='Invalid JSON from the native helper.';return;}
    if(packet.id!==id||packet.protocolVersion!==1){protocolError='Native helper request identifier or protocol mismatch.';return;}
    if(packet.stage!=='result'){if(packet.message)onOutput(packet.message+'\n');return;}
    if(report){protocolError='Native helper returned more than one final report.';return;}
    report=normalize(packet,config.program);
  }
  function finish(code,signal,error) {
    if(settled)return;settled=true;clearTimeout(timer);
    pending+=decoder.end();if(pending.trim())line(pending);const tail=stderr.end();if(tail)onOutput(tail);
    if(error||protocolError||!report)report={success:false,compiled:false,error:error?.message||protocolError||'Native helper exited without a final report.'};
    const complete=operation==='test.run'?report.tests_completed&&report.cleanup_complete&&Array.isArray(report.results)&&report.results.length===report.tests_selected:true;
    const passed=code===0&&report.success===true&&complete&&!cancelled&&!timedOut&&!protocolError;
    if(!complete&&!report.error)report.error='Native test results are incomplete.';
    if(!cancelled&&!timedOut){for(const entry of report.results||[])onOutput(`${entry.status.toUpperCase()}: ${entry.owner?entry.owner+'::':''}${entry.method}${entry.message?' — '+entry.message:''}\n`);onReport(report);}
    resolveCompletion({code:code??2,signal,report,passed,cancelled,timedOut});
  }
  child.stdout.on('data',bytes=>{pending+=decoder.write(bytes);if(pending.length>16*1024*1024){protocolError='Native helper exceeded the response size limit.';child.kill();return;}let end;while((end=pending.indexOf('\n'))!==-1){line(pending.slice(0,end));pending=pending.slice(end+1);}});
  child.stderr.on('data',bytes=>onOutput(stderr.write(bytes)));
  child.once('error',error=>finish(2,null,error));child.once('close',(code,signal)=>finish(code,signal));
  child.stdin.on('error',error=>{if(!settled)protocolError=error.message;});
  child.stdin.end(JSON.stringify(request)+'\n');
  return {id,child,completion,stop:()=>{if(!settled){cancelled=true;child.kill();}}};
}
module.exports={startCpp,normalize,compileSummary};
