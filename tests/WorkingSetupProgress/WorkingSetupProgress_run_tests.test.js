'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkingSetupProgress}=require('../../extension/src/WorkingSetupProgress');
function fixture(){let time=0,heartbeat,cleared=false,cancel;const lines=[];
 const output={show(){},append:text=>lines.push(text),appendLine:text=>lines.push(text+'\n')};
 const monitor=new WorkingSetupProgress({output,operation:'Reconcile saved checkout',target:'C:/Working/system',
  now:()=>time,setInterval:fn=>{heartbeat=fn;return{unref(){}};},clearInterval:()=>{cleared=true;}});
 const token={onCancellationRequested:fn=>{cancel=fn;return{dispose(){}};}};
 return{monitor,lines,token,tick:ms=>{time=ms;heartbeat();},cancel:()=>cancel(),get cleared(){return cleared;}};
}
test('writes immediate timestamped operation target and stage before dispatch and periodic elapsed quiet status',async()=>{
 const f=fixture();let complete;
 const operation=f.monitor.run(async write=>{assert.match(f.lines.join(''),/1970-01-01T00:00:00.000Z.*Reconcile saved checkout.*C:\/Working\/system.*stage/i);await new Promise(resolve=>complete=resolve);write('[JOX setup] connect: starting.\n');return{report:{setupStages:[{stage:'connect',status:'completed',elapsedMilliseconds:12}]}};},f.token);
 f.tick(10000);assert.match(f.lines.join(''),/10s.*no native output/i);f.tick(20000);complete();await operation;
 assert.match(f.lines.join(''),/connect.*completed.*12 ms/i);assert.match(f.lines.join(''),/completed.*20s/i);assert.equal(f.cleared,true);
});
test('acknowledges cancellation without claiming stopped until terminal failure, and retains CLI diagnostics',async()=>{
 const f=fixture();let reject;
 const result=f.monitor.run(()=>new Promise((_,fail)=>reject=fail),f.token);f.cancel();
 assert.match(f.lines.join(''),/cancellation requested.*waiting.*native/i);assert.doesNotMatch(f.lines.join(''),/cancelled after/i);
 reject(Object.assign(Error('Native cancelled'),{result:{code:130,cancelled:true,report:{error:'Native cancelled',nativeExitCode:130,brokerDiagnostics:{status:'closed',elapsedMilliseconds:250},setupStages:[{stage:'connect',status:'failed',elapsedMilliseconds:250}]}}}));
 await assert.rejects(result,/Native cancelled/);assert.match(f.lines.join(''),/nativeExitCode=130/);assert.match(f.lines.join(''),/broker.*status=closed.*elapsedMilliseconds=250/);assert.match(f.lines.join(''),/cancelled after/i);assert.equal(f.cleared,true);
});
