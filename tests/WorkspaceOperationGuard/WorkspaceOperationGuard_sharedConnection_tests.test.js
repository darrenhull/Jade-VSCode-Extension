'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceOperationGuard}=require('../../extension/src/WorkspaceOperationGuard');
test('Scratch Pad claims execution without disconnecting a healthy shared native connection',async()=>{
 let busy=false,closed=0;const contexts=[];
 const guard=new WorkspaceOperationGuard({isBusy:()=>busy,inspectorOwnsLock:()=>false,
  releaseInspector:async()=>{closed++;},releaseNative:async()=>{closed++;},
  claim:value=>{busy=value;},updateContext:async value=>contexts.push(value)});
 const lease=await guard.acquire();
 assert.equal(busy,true);assert.equal(closed,0,'ordinary execution must leave native connection ownership to the CLI');
 await guard.release(lease);assert.equal(busy,false);assert.deepEqual(contexts,[true,false]);
});