'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('dependency update preparation verifies the native pin without duplicating the PR full build',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/update-consumer.yml'),'utf8');
 assert.match(workflow,/--verify-lock/);
 assert.doesNotMatch(workflow,/npm (?:test|run|ci)|gh workflow run|actions: write/);
 assert.match(workflow,/gh pr create/);
 assert.match(workflow,/--reviewer darrenhull/);
 assert.match(workflow,/--match-head-commit/);
 assert.match(workflow,/--auto --squash/);
 assert.doesNotMatch(workflow,/--admin/);
});
