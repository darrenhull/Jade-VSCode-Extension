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
