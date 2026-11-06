'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
test('approved main builds publish through the shared immutable consumer publisher',()=>{
 const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
 assert.ok(ci.includes("github.ref == 'refs/heads/main'"));assert.doesNotMatch(ci,/tags:|startsWith\(github.ref, 'refs\/tags\/v'\)/);
 assert.ok(ci.includes('uses: ./.github/workflows/publish-consumer.yml'));
 assert.match(ci,/needs: \[build, release-guard\]/);
 const publisher=fs.readFileSync(path.join(root,'.github/workflows/publish-consumer.yml'),'utf8');
 assert.match(publisher,/ReleasePublisher\.cjs/);
 assert.match(publisher,/fetch-depth: 0/);
 assert.match(publisher,/permissions:\s+contents: write/);
});
