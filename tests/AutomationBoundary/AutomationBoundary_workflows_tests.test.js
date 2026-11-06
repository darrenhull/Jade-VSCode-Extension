'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=name=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');
test('consumer automation belongs to the extension and its own workflows call it locally',()=>{
 const update=read('update-consumer.yml');
 assert.match(update,/repository: darrenhull\/Jade-VSCode-Extension/);
 assert.doesNotMatch(update,/repository: darrenhull\/Jade-CLI/);
 assert.match(update,/consumer_automation_ref/);
 assert.match(read('update-cli.yml'),/uses: \.\/\.github\/workflows\/update-consumer\.yml/);
 const ci=read('ci.yml');
 assert.ok(read('agent-pr.yml').includes('uses: ./.github/workflows/open-agent-pr.yml'));
 assert.ok(ci.includes('uses: ./.github/workflows/release-ancestry.yml'));
 assert.match(ci,/\n  build:/);
});
test('consumer review automation permits the two consumers and preserves real bot review checks',()=>{
 const workflow=read('open-agent-pr.yml');
 assert.ok(workflow.includes('darrenhull/Jade-VSCode-Extension'));
 assert.ok(workflow.includes('darrenhull/Jade-Local-MCP'));
 assert.ok(!workflow.includes('darrenhull/Jade-CLI'));
 assert.match(workflow,/verified\.user\.login -ne 'github-actions\[bot\]'/);
 assert.match(workflow,/requested_reviewers/);
 assert.match(workflow,/default: darrenhull/);
});
