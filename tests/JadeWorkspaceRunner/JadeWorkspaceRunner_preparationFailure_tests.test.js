'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client'),{JadeWorkspaceRunner}=require('../../extension/src/JadeWorkspaceRunner'),{WorkspaceOperationGuard}=require('../../extension/src/WorkspaceOperationGuard');
const failure={passed:false,code:6295,report:{native_project:true,compiled:false,executed:false,error:'Native schema load failed (exit6295). See native output.',output:'Patch control security check failed - refer to JADE log',diagnostics:[{compiler_error:6295,message:'Patch control security check failed - refer to JADE log',source:'C:/fixture/CardSchema.scm',line:3,column:1}]}};
const document={version:1,uri:{toString:()=> 'untitled:ScratchPadHello.jade'},getText:()=> 'begin\n write "Hello";\nend;'};
function fixture({cleanupFailure=false,nativeResult=failure}={}){
 const commands=[],progress=[],output=[],contexts=[];let starts=0,busy=false;
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>child.emit('close',0);
 child.stdin.write=line=>{const packet=JSON.parse(line);commands.push(packet);queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({id:packet.id,event:'result',result:nativeResult})+'\n')));return true;};
 const client=new CliWorkingSession({entry:'C:/fixture/jade-cli.exe',spawn:()=>{starts++;return child;}});
 const guard=new WorkspaceOperationGuard({isBusy:()=>busy,claim:value=>{busy=value;},updateContext:async value=>{contexts.push(value);if(!value&&cleanupFailure)throw Error('Controlled operation context release failure');}});
 const runner=new JadeWorkspaceRunner({client,configFor:async()=>({schema:'ADOConsumerSchema',workspaceRoots:['C:/fixture']}),beforeOperation:()=>guard.acquire(),afterOperation:lease=>guard.release(lease)});
 return{client,runner,commands,progress,output,contexts,get starts(){return starts;},get busy(){return busy;}};
}
test('actual Scratch caller and JSONL adapter return one6295 preparation failure without reconnecting or replaying the load',async()=>{
 const f=fixture();try{
  const result=await f.runner.run({document,onProgress:value=>f.progress.push(value),onOutput:text=>f.output.push(text)});
  for(let turn=0;turn<8;turn++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(result.code,6295);assert.equal(result.passed,false);assert.deepEqual(result.report,failure.report);
  assert.equal(result.report.executed,false);assert.equal(f.starts,1);assert.deepEqual(f.commands.map(row=>row.command),['workspace.run']);
  assert.deepEqual(f.contexts,[true,false]);assert.equal(f.busy,false);assert.equal(f.commands[0].sourceText,document.getText());
 }finally{f.client.dispose();}
});
test('operation-context release failure cannot replace the original6295 native preparation result',async()=>{
 const f=fixture({cleanupFailure:true});try{
  const result=await f.runner.run({document});
  assert.equal(result.code,6295);assert.equal(result.passed,false);assert.equal(result.report.executed,false);
  assert.deepEqual(result.report.diagnostics,failure.report.diagnostics);assert.equal(result.report.output,failure.report.output);
  assert.match(result.report.cleanupError,/operation context release failure/);assert.equal(f.busy,false);
  assert.deepEqual(f.commands.map(row=>row.command),['workspace.run']);
 }finally{f.client.dispose();}
});

test('release failure after confirmed execution remains failure without denying actual execution',async()=>{
 const f=fixture({cleanupFailure:true,nativeResult:{passed:true,code:0,report:{compiled:true,executed:true,output:'Hello'}}});try{
  const result=await f.runner.run({document});assert.equal(result.passed,false);assert.equal(result.code,2);
  assert.equal(result.report.executed,true);assert.equal(result.report.output,'Hello');assert.match(result.report.cleanupError,/context release failure/);
 }finally{f.client.dispose();}
});
test('cancellation after acquiring the lease retains130 even when UI context release fails',async()=>{
 const f=fixture({cleanupFailure:true});let checks=0;const token={get isCancellationRequested(){return++checks>1;}};try{
  const result=await f.runner.run({document,token});assert.equal(result.code,130);assert.equal(result.cancelled,true);assert.equal(result.passed,false);
  assert.equal(f.commands.length,0);assert.equal(f.starts,0);assert.match(result.report.cleanupError,/context release failure/);assert.equal(f.busy,false);
 }finally{f.client.dispose();}
});