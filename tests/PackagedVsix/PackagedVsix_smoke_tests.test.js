'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('CI exercises the extracted VSIX with no Node PATH before retaining release artifacts',()=>{
 const root=path.resolve(__dirname,'../..'),workflow=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
 const smoke=workflow.indexOf('scripts/smoke-vsix.ps1');assert.ok(smoke>0,'A real extracted VSIX smoke is required');
 assert.ok(smoke>workflow.indexOf('npm run package'));
 assert.ok(smoke<workflow.indexOf('actions/upload-artifact@'));
 const script=fs.readFileSync(path.join(root,'scripts/smoke-vsix.ps1'),'utf8');
 assert.match(script,/ExtractToDirectory/);assert.match(script,/GetTempPath/);assert.match(script,/PATH/);assert.match(script,/System32/);
 assert.match(script,/tests.*list/);assert.match(script,/passed/);assert.match(script,/PortableTests/);
});
