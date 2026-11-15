'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {testingHarness}=require('../../test/helpers/testing-harness');
const {registerTesting}=require('../../extension/src/testing');

// Execute the real registered callback, including its early guards. Keeping this
// harness separate from activate() avoids launching native processes or views.
const {fixture}=require('./LocalTestCommand_harness.cjs');

test('busy local-test command returns a clear not-started result and records it in Testing output',async()=>{
 const f=fixture(),observed=[];
 const result=await f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 assert.equal(result?.passed,false,'Busy command must not return undefined');
 assert.equal(result?.report?.tests_completed,false);
 assert.match(result?.report?.error,/current Jade operation|already running/i);
 assert.match(result?.report?.error,/not started|not run/i);
 assert.match(f.calls.output.join(''),/current Jade operation|already running/i);
 assert.match(observed.join(''),/current Jade operation|already running/i);
 assert.equal(f.calls.native,0);assert.equal(f.calls.prepare,0);assert.equal(f.sandbox.publishing,true);
});
test('Test Explorer retains the busy cause instead of generic incomplete-method diagnostics',async()=>{
 const f=fixture();await f.manager.runFile(f.document.uri,'check');
 const run=f.h.runs[0],error=run.states.find(state=>state.status==='errored');
 assert.match(error?.message.message,/current Jade operation|already running/i);
 assert.doesNotMatch(error?.message.message,/did not produce a complete method result/);
 assert.match(run.output.join(''),/current Jade operation|already running/i);
 assert.ok(run.ended);assert.equal(f.calls.native,0);
});
test('completed assertion results need no user-code output to become individual native outcomes',async()=>{
 const f=fixture({busy:false,result:{passed:true,code:0,report:{tests_completed:true,cleanup_complete:true,tests_selected:1,failures:0,results:[{method:'check',status:'passed'}]}}});
 await f.manager.runFile(f.document.uri,'check');
 assert.equal(f.calls.native,1,JSON.stringify(f.calls));assert.equal(f.calls.prepare,1);
 assert.ok(f.h.runs[0].states.some(state=>state.status==='passed'));
 assert.ok(!f.h.runs[0].states.some(state=>state.status==='errored'));
 assert.equal(f.sandbox.publishing,false);
});
test('a native assertion failure without user writes remains a failed method with its original message',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:1,report:{tests_completed:true,cleanup_complete:true,tests_selected:1,failures:1,results:[{method:'check',status:'failed',message:'Synthetic native assertion failed'}]}}});
 await f.manager.runFile(f.document.uri,'check');
 const failed=f.h.runs[0].states.find(state=>state.status==='failed');
 assert.equal(failed?.message.message,'Synthetic native assertion failed');
 assert.ok(!f.h.runs[0].states.some(state=>state.status==='errored'));
 assert.equal(f.calls.native,1);assert.equal(f.sandbox.publishing,false);
});
test('native incomplete-run diagnostics retain their actual cause instead of a busy result',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:2,report:{tests_completed:false,cleanup_complete:false,results:[],error:'Synthetic native helper stopped during teardown'}}});
 await f.manager.runFile(f.document.uri,'check');
 const error=f.h.runs[0].states.find(state=>state.status==='errored');
 assert.equal(error?.message.message,'Synthetic native helper stopped during teardown');
 assert.equal(f.calls.native,1);assert.equal(f.sandbox.publishing,false);
});
test('a failed selected-source save stops before native preparation or execution',async()=>{
 let saves=0;const f=fixture({busy:false,dirty:true,save:async()=>{saves++;return false;}});
 const result=await f.manager.runFile(f.document.uri,'check');
 assert.equal(saves,1);assert.equal(result.passed,false);assert.match(result.error,/Save the test file/);assert.equal(f.calls.prepare,0);assert.equal(f.calls.native,0);assert.equal(f.sandbox.publishing,false);
});
test('context-free native 6281 remains visible in Test Explorer and output without a fabricated source',async()=>{
 const result={passed:false,code:6281,report:{compiled:false,tests_completed:false,cleanup_complete:false,results:[],diagnostics:[{compiler_error:6281,message:'Synthetic native parser error',diagnostic_context_unavailable:true}]}},f=fixture({busy:false,result});
 await f.manager.runFile(f.document.uri,'check');
 assert.match(f.calls.output.join(''),/Jade 6281.*Synthetic native parser error/);assert.doesNotMatch(f.calls.output.join(''),/undefined/);
 const error=f.h.runs[0].states.find(state=>state.status==='errored');assert.match(error.message.message,/Jade 6281.*Synthetic native parser error/);assert.equal(error.message.location,undefined);assert.equal(f.calls.native,1);
});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
const completedResult=()=>({passed:true,code:0,report:{tests_completed:true,cleanup_complete:true,tests_selected:1,failures:0,results:[{method:'check',status:'passed'}]}});
test('Testing output identifies source-resolution and input-discovery waits before native execution',async()=>{
 const source=deferred(),inputs=deferred(),observed=[];
 const f=fixture({busy:false,result:completedResult(),sourceReady:source.promise,inputsReady:inputs.promise});
 const running=f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(observed.join(''),/Resolving selected test source.*\d+ ms elapsed/i);
  assert.equal(f.calls.native,0);
  source.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.match(observed.join(''),/Saving local test sources.*\d+ ms elapsed/i);
  assert.equal(f.calls.native,0);
 }finally{source.resolve();inputs.resolve();await running;}
});
test('Testing output distinguishes the native wait from actual method completion',async()=>{
 const native=deferred(),observed=[],f=fixture({busy:false,result:native.promise});
 const running=f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.native,1);
  assert.match(observed.join(''),/Waiting for native compilation and test results.*\d+ ms elapsed/i);
  assert.doesNotMatch(observed.join(''),/Native test operation returned/);
 }finally{native.resolve(completedResult());await running;}
 assert.equal(observed.filter(text=>text.includes('Native test operation returned')).length,1);
 assert.equal(f.calls.output.filter(text=>text.includes('Native test operation returned')).length,1);
});
test('a returned native result remains distinguishable from a pending UI-state release',async()=>{
 const ui=deferred(),observed=[],f=fixture({busy:false,result:completedResult(),uiReady:ui.promise});
 const running=f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(observed.join(''),/Native test operation returned/);
  assert.match(observed.join(''),/Releasing local test UI state.*\d+ ms elapsed/i);
  assert.doesNotMatch(observed.join(''),/Local test UI state released/);
 }finally{ui.resolve();await running;}
 assert.equal(observed.filter(text=>text.includes('Local test UI state released')).length,1);
});

test('source-index preparation completes before native test dispatch and retains original outcomes',async()=>{const index=deferred(),f=fixture({busy:false,indexReady:index.promise,result:completedResult()});const running=f.command(f.document.uri,['check']);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.sourceIndex,1);assert.equal(f.calls.native,0);index.resolve();const result=await running;assert.equal(result.passed,true);assert.deepEqual(f.calls.order,['save','source-index','index-ready','native']);});
for(const failure of [{passed:false,code:130,cancelled:true,report:{error:'Native source index cancelled'}},{passed:false,code:2,timedOut:true,report:{error:'Git workspace source preparation timed out'}}])test('source-index '+(failure.cancelled?'cancellation':'timeout')+' preserves its native outcome and prevents test execution',async()=>{const error=Object.assign(Error(failure.report.error),{result:failure}),f=fixture({busy:false,indexFailure:error,result:completedResult()});const result=await f.command(f.document.uri,['check']);assert.strictEqual(result,failure);assert.equal(f.calls.native,0);assert.equal(f.sandbox.publishing,false);assert.deepEqual(f.calls.context,[true,false]);});
