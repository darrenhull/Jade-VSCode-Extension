'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createTestPlan}=require('../../scripts/TestPlan.cjs');
test('keeps PowerShell-heavy suites out of the bounded JavaScript worker phase',()=>{
 const files=['C:\\repo\\test\\syntax.test.js','C:\\repo\\tests\\NativeReleaseUpdater\\NativeReleaseUpdater_script_tests.test.js','C:\\repo\\tests\\release-ancestry\\release-ancestry_verify_tests.test.js','C:\\repo\\tests\\AgentPullRequest\\AgentPullRequest_open_tests.test.js','C:\\repo\\tests\\update-cli\\update-cli_nativeUpdate_tests.test.js'];
 const plan=createTestPlan(files);
 assert.equal(plan.length,2);
 assert.equal(plan[0].concurrency,2);
 assert.deepEqual(plan[0].files,[files[0]]);
 assert.equal(plan[1].concurrency,1);
 assert.deepEqual(plan[1].files,files.slice(1));
 assert.deepEqual(plan.flatMap(phase=>phase.files).sort(),[...files].sort(),'Every selected test file must run exactly once.');
});
test('omits empty phases and retains all tests in a JavaScript-only project',()=>{
 assert.deepEqual(createTestPlan([]),[]);
 assert.deepEqual(createTestPlan(['/repo/test/value.test.js']),[{name:'JavaScript contracts',concurrency:2,files:['/repo/test/value.test.js']}]);
});
test('bounds Windows argv without dropping, duplicating or reordering the hosted 307-file cohort',()=>{
 const prefix='D:\\a\\Jade-VSCode-Extension\\Jade-VSCode-Extension\\tests\\';
 const files=Array.from({length:307},(_,i)=>prefix+'LongContractDirectory'+i+'\\MeaningfulBehaviourWithLongName_'+i+'_tests.test.js');
 const isolated=Array.from({length:5},(_,i)=>prefix+'NativeReleaseUpdater\\NativeReleaseUpdater_owned'+i+'_tests.test.js');
 const plan=createTestPlan([...files,...isolated]);
 assert.ok(plan.length>2,'The oversized hosted cohort needs more than one argv batch.');
 assert.deepEqual(plan.flatMap(phase=>phase.files),[...files,...isolated]);
 for(const phase of plan){
  assert.ok(phase.files.reduce((length,file)=>length+2*file.length+3,1024)<=24000,'Conservative quoted UTF-16 argv bound');
  assert.equal(phase.concurrency,phase.files.some(file=>file.includes('NativeReleaseUpdater'))?1:2);
 }
});
test('a single oversized path fails explicitly rather than disappearing from coverage',()=>{
 assert.throws(()=>createTestPlan(['C:/tests/'+'x'.repeat(24000)+'.test.js']),/path exceeds/);
});
test('a failed JavaScript batch remains failed after every later batch succeeds',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/test.cjs'),'utf8');
 const names=Array.from({length:307},(_,i)=>'long_contract_name_'+i+'_'.repeat(9)+'.test.js');
 const calls=[],ownedProcess={execPath:process.execPath,env:{},exitCode:undefined};
 const fakeFs={existsSync:directory=>path.basename(directory)==='tests',readdirSync:()=>names.map(name=>({name,isDirectory:()=>false}))};
 const require_ = name => name==='node:fs'?fakeFs:name==='node:child_process'?{spawnSync(_executable,args,options){calls.push({args,options});return {status:calls.length===1?1:0};}}
  :name==='./bundle-cli.cjs'?{bundleCli(){}}:name==='./TestPlan.cjs'?{createTestPlan}:require(name);
 vm.runInNewContext('(function(require,__dirname,process,console){'+source+'\n})')(
  require_,path.resolve(__dirname,'../../scripts'),ownedProcess,{log(){},error(){}});
 assert.ok(calls.length>1); assert.equal(ownedProcess.exitCode,1);
 assert.equal(calls.flatMap(call=>call.args.slice(2)).length,307);
 assert.ok(calls.every(call=>call.args[0]==='--test'&&call.args[1]==='--test-concurrency=2'));
});
