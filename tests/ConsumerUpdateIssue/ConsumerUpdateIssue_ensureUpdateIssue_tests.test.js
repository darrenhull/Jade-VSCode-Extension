'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ensureUpdateIssue}=require('../../scripts/ConsumerUpdateIssue.cjs');
const repo='darrenhull/Jade-VSCode-Extension',tag='v0.9.0',title='Update bundled Jade CLI to v0.9.0';
const issue={number:65,title,html_url:`https://github.com/${repo}/issues/65`};
function stub(list=[]){const calls=[];const run=(args,input)=>{calls.push({args,input});if(args.includes('POST')){list.push(issue);return JSON.stringify(issue)}return JSON.stringify([list]);};return {run,calls};}
test('ensureUpdateIssue creates an attributed issue with structured input and reuses it on retry',()=>{
 const {run,calls}=stub();assert.equal(ensureUpdateIssue(repo,tag,run),65);assert.equal(ensureUpdateIssue(repo,tag,run),65);
 const creates=calls.filter(call=>call.args.includes('POST'));assert.equal(creates.length,1);const payload=JSON.parse(creates[0].input);assert.equal(payload.title,title);assert.match(payload.body,/Prepared by Codex on behalf of @darrenhull/);assert.match(payload.body,/Given/);assert.ok(creates[0].args.includes(`repos/${repo}/issues`));assert.ok(calls[0].args.includes('--paginate'));assert.ok(calls[0].args.includes('--slurp'));
});
test('ensureUpdateIssue reuses exact closed tracking issues and ignores matching PRs',()=>{
 const {run,calls}=stub([{...issue,number:9,pull_request:{}},{...issue,state:'closed'}]);assert.equal(ensureUpdateIssue(repo,tag,run),65);assert.equal(calls.length,1);
});
test('ensureUpdateIssue fails on invalid metadata, duplicates, API failure or untrusted input',()=>{
 for(const list of [[{...issue,html_url:'https://github.com/other/repo/issues/65'}],[{...issue,number:0}],[issue,issue]])assert.throws(()=>ensureUpdateIssue(repo,tag,stub(list).run));
 assert.throws(()=>ensureUpdateIssue(repo,tag,()=>{throw Error('API unavailable')}),/API unavailable/);
 assert.throws(()=>ensureUpdateIssue(repo,tag,()=>'{broken'));
 for(const [badRepo,badTag] of [['other/repo',tag],[repo,'v0.9.0-preview'],[repo,'v0.9.0\n']]){let calls=0;assert.throws(()=>ensureUpdateIssue(badRepo,badTag,()=>{calls++;return '[]'}));assert.equal(calls,0);}
});
