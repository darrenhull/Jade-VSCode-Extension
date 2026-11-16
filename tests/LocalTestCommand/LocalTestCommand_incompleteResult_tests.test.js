'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./LocalTestCommand_harness.cjs');
const cases=[
 {name:'method completion missing',report:{tests_completed:false,cleanup_complete:false,results:[]},expected:/native test method completion was not confirmed.*code 2/i},
 {name:'cleanup missing after a completed method',report:{tests_completed:true,cleanup_complete:false,results:[{method:'check',status:'passed'}]},expected:/native test cleanup was not confirmed.*check.*code 2/i},
 {name:'selected method missing from a complete report',report:{tests_completed:true,cleanup_complete:true,results:[{method:'anotherMethod',status:'passed'}]},expected:/native test report did not include the selected method check.*code 2/i}
];
for(const {name,report,expected} of cases)test(name+' is an actionable incomplete error in Testing output',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:2,report}});
 await f.manager.runFile(f.document.uri,'check');
 const run=f.h.runs[0],error=run.states.find(state=>state.status==='errored');
 assert.match(error?.message.message,expected);
 assert.match(run.output.join(''),expected,'Testing output must contain the same terminal incomplete reason');
 assert.equal(run.states.filter(state=>['passed','failed'].includes(state.status)).length,0,'An incomplete native report is not a completed assertion result');
 assert.ok(run.ended);assert.equal(f.calls.native,1);assert.equal(f.sandbox.publishing,false);
});

test('native timeout remains a timeout in the incomplete result and output',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:124,timedOut:true,report:{tests_completed:false,cleanup_complete:false,results:[]}}});
 await f.manager.runFile(f.document.uri,'check');const run=f.h.runs[0];
 assert.equal(run.states.find(state=>state.status==='errored')?.message.message,'Native test run timed out.');
 assert.match(run.output.join(''),/Native test run timed out/);assert.ok(run.ended);
});
test('native cancellation skips the method without inventing an incomplete failure',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:130,cancelled:true,report:{tests_completed:false,cleanup_complete:false,results:[]}}});
 await f.manager.runFile(f.document.uri,'check');const run=f.h.runs[0];
 assert.ok(run.states.some(state=>state.status==='skipped'));assert.ok(!run.states.some(state=>['failed','passed','errored'].includes(state.status)));assert.ok(run.ended);
});
