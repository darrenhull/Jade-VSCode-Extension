'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {resolveWorkingDirectory}=require('../../extension/src/working-directory');
test('relative Working overrides use the selected workspace, retain external paths and preserve automatic default',()=>{
 const root=path.resolve('selected-project');assert.equal(resolveWorkingDirectory('.jade/working',root),path.join(root,'.jade','working'));assert.equal(resolveWorkingDirectory('',root),undefined);assert.equal(resolveWorkingDirectory(undefined,root),undefined);const external=path.resolve('external-working');assert.equal(resolveWorkingDirectory(external,root),external);assert.throws(()=>resolveWorkingDirectory('.jade/working'),/workspace/);
});
