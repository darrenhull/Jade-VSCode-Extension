'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runSequential}=require('../../extension/src/jade-workspaces');
for(const failure of [{passed:false,cancelled:true},{passed:false,code:6027},{passed:false,code:4030}])test('Run All leaves later code unexecuted after '+JSON.stringify(failure),async()=>{
 const called=[];await runSequential(['first','second'],async item=>{called.push(item);return failure;});assert.deepEqual(called,['first']);
});
