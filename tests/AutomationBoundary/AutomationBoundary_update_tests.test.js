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
test('closed dependency pull requests do not suppress updates or force overwrite old branches',()=>{const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/update-consumer.yml'),'utf8');assert.match(workflow,/--state open/);assert.doesNotMatch(workflow,/--state all|push[^\n]*--force/);assert.match(workflow,/ls-remote/);assert.match(workflow,/NewGuid/);assert.match(workflow,/bump-consumer-version/);assert.match(workflow,/extension\/package.json/);assert.match(workflow,/git add -- \$paths/);});
