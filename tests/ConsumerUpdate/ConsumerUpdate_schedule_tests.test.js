'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('automatic CLI updates keep a refreshed off-hour five-minute schedule plus explicit recovery triggers',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/update-cli.yml'),'utf8');
 assert.match(workflow,/cron: '3-58\/5 \* \* \* \*'/);assert.match(workflow,/workflow_dispatch:/);assert.match(workflow,/repository_dispatch:/);assert.match(workflow,/jade-cli-released/);assert.match(workflow,/uses: \.\/\.github\/workflows\/update-consumer.yml/);assert.doesNotMatch(workflow,/secrets: inherit|PAT|TOKEN: \$\{\{ secrets\./);
 const readme=fs.readFileSync(path.join(__dirname,'../../README.md'),'utf8');assert.match(readme,/best-effort[\s\S]*not a five-minute delivery guarantee/i);assert.match(readme,/Draft/);
});
