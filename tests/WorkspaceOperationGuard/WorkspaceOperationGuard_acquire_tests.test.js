"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceOperationGuard}=require('../../extension/src/WorkspaceOperationGuard');
function setup(options={}){let busy=options.busy??false;const contexts=[];const guard=new WorkspaceOperationGuard({isBusy:()=>busy,claim:value=>{busy=value;},updateContext:async value=>{contexts.push(value);if(options.contextFailure&&value)throw Error('context failed');}});return{guard,contexts,isBusy:()=>busy};}
test('preserves an active compile/test lease',async()=>{const f=setup({busy:true});await assert.rejects(f.guard.acquire(),/Wait/);assert.equal(f.isBusy(),true);assert.deepEqual(f.contexts,[]);});
test('cleans only its own lease after context failure',async()=>{const f=setup({contextFailure:true});await assert.rejects(f.guard.acquire(),/failed/);assert.equal(f.isBusy(),false);assert.deepEqual(f.contexts,[true,false]);await f.guard.release({});assert.equal(f.isBusy(),false);});
test('concurrent acquisition has exactly one owner and a stale release cannot clear it',async()=>{const f=setup();const values=await Promise.allSettled([f.guard.acquire(),f.guard.acquire()]);assert.equal(values.filter(v=>v.status==='fulfilled').length,1);const lease=values.find(v=>v.status==='fulfilled').value;await f.guard.release({});assert.equal(f.isBusy(),true);await f.guard.release(lease);assert.equal(f.isBusy(),false);});
