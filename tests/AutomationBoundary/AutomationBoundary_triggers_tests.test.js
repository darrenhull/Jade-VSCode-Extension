'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=name=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');
test('full extension builds run on PR events, main pushes, manual requests and release tags only',()=>{
 const workflow=read('ci.yml');
 assert.match(workflow,/branches: \['main'\]/);
 assert.match(workflow,/pull_request:/);assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/tags: \['v\*'\]/);
 assert.doesNotMatch(workflow,/\n  open-agent-pr:/);
 assert.match(workflow,/\n  build:/);
});
test('agent pushes only open a human-reviewed bot PR and never dispatch another full build',()=>{
 const workflow=read('agent-pr.yml');
 assert.match(workflow,/branches: \['codex\/agent\/\*\*'\]/);
 assert.match(workflow,/uses: \.\/\.github\/workflows\/open-agent-pr\.yml/);
 assert.doesNotMatch(workflow,/npm |setup-node@|actions: write|gh workflow run|workflow_dispatch/);
 assert.match(workflow,/pull-requests: write/);
});
