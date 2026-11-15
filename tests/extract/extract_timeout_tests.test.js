'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const gateway=require('../../extension/src/cli-gateway');
const {startExtract}=require('../../extension/src/extract');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-extract-timeout-'));t.after(()=>{gateway.configure(undefined);fs.rmSync(root,{recursive:true,force:true});});return path.join(root,'output');}
test('extraction explicitly allows two hours by default and preserves native timeout',async t=>{
 const destination=fixture(t);let options;
 gateway.configure({runNative:async(exe,args,value)=>{options=value;return {code:130,timedOut:true,cancelled:false};}});
 const result=await startExtract({executable:'jadclient.exe'},destination).completion;
 assert.equal(options.timeoutMilliseconds,7200000);
 assert.equal(result.timedOut,true);assert.equal(result.cancelled,false);assert.equal(result.success,false);
});
test('extraction forwards a dedicated timeout override',async t=>{
 const destination=fixture(t);let options;
 gateway.configure({runNative:async(exe,args,value)=>{options=value;return {code:130,timedOut:true};}});
 await startExtract({executable:'jadclient.exe',extractionTimeoutSeconds:3600},destination).completion;
 assert.equal(options.timeoutMilliseconds,3600000);
});
test('Cancel aborts the native request and waits for its completion',async t=>{
 const destination=fixture(t);let options,finish;
 gateway.configure({runNative:async(exe,args,value)=>{options=value;return new Promise(resolve=>{finish=resolve;});}});
 const operation=startExtract({executable:'jadclient.exe'},destination);
 await new Promise(resolve=>setImmediate(resolve));operation.stop();
 assert.equal(options.signal.aborted,true);
 finish({code:130,cancelled:true,timedOut:false});
 assert.equal((await operation.completion).cancelled,true);
});
test('gateway exposes native cancellation and terminal exitCode',async t=>{
 fixture(t);gateway.configure({runNative:async()=>({code:130,cancelled:true,timedOut:false})});
 const child=gateway.spawnUtility('jadclient.exe',[],{});assert.equal(child.exitCode,null);
 await new Promise(resolve=>child.once('close',resolve));assert.equal(child.exitCode,130);assert.equal(child.cancelled,true);assert.equal(child.kill(),false);
});
test('invalid extraction timeout is rejected before creating files',t=>{
 const destination=fixture(t);
 for(const extractionTimeoutSeconds of [0,-1,1.5,86401,'3600',NaN])
  assert.throws(()=>startExtract({executable:'jadclient.exe',extractionTimeoutSeconds},destination),/extractionTimeoutSeconds/);
 assert.equal(fs.existsSync(destination),false);
});
test('native cancellation is retained without pressing the UI Cancel button',async t=>{
 const destination=fixture(t);gateway.configure({runNative:async()=>({code:130,cancelled:true})});
 const result=await startExtract({executable:'jadclient.exe'},destination).completion;
 assert.equal(result.cancelled,true);assert.equal(result.success,false);
});

test('Settings default is two hours and explicit extraction overrides remain configurable',()=>{
 const setting=require('../../extension/package.json').contributes.configuration.properties['jadeNative.extractionTimeoutSeconds'];
 assert.equal(setting.default,7200);assert.equal(setting.minimum,1);assert.equal(setting.maximum,86400);
});