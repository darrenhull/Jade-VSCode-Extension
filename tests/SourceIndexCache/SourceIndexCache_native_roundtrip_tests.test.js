'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runNativeBrowserRoundtrip}=require('./SourceIndexCache_native_roundtrip.cjs');
test('real native shared-cache writer retains exact JS parser metadata and rejects stale byte proof',{
 skip:process.env.JADE_CLI_SOURCE_INDEX_CONNECTED!=='1',timeout:60000
},async()=>{
 assert.equal(process.platform,'win32');
 const receipt=await runNativeBrowserRoundtrip({entry:process.env.JADE_CLI_ENTRY,refresh:async(session,root)=>{
  const result=await session.request('source.index.refresh',{config:{workspaceRoots:[root]}}).promise;
  assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.code,0);assert.equal(result.cache?.format,2);assert.ok(result.cache.roots.some(row=>row.root.toLowerCase()===root.toLowerCase()));assert.equal(result.entries,undefined,'The native source graph must stay out of broker frames');
 }});
 assert.equal(receipt.passed,true);assert.equal(receipt.roundtripMetadata,true);assert.equal(receipt.staleProofRejected,true);
});
