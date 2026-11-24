'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NativeSourceProvider}=require('../../extension/src/NativeSourceProvider');
const {fixture}=require('./fixtures/provider.cjs');
// Simulated protocol contracts; native target enforcement is qualified in the CLI.
const make=(options={})=>{const f=fixture(options);return {...f,provider:new NativeSourceProvider({client:f.client,config:f.config,projectRoot:'C:/project'})};};
test('reviewed sync waits for preflight and forwards the opaque target identity',async()=>{
 let permit;const gate=new Promise(resolve=>permit=resolve);const f=make({flags:{sync:true,reviewedWorkingSync:true},reply:command=>command==='sync'?{passed:true,code:0,report:{inSync:true,reviewedWorkingIdentity:'target-A'}}:undefined});
 const pending=f.provider.sync({expectedWorkingIdentity:'target-A',beforeRequest:()=>gate});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.requests.some(row=>row.command==='sync'),false);permit();const result=await pending;assert.equal(result.passed,true);assert.equal(f.requests.find(row=>row.command==='sync').body.expectedWorkingIdentity,'target-A');
});
test('reviewed sync fails closed when the server does not advertise target enforcement',async()=>{const f=make({flags:{sync:true}});await assert.rejects(f.provider.sync({expectedWorkingIdentity:'target-A'}),/reviewed|update/i);assert.equal(f.requests.some(row=>row.command==='sync'||row.command==='source.semantic.prepare'),false);});
test('reviewed sync refuses success without matching native target confirmation',async()=>{const f=make({flags:{sync:true,reviewedWorkingSync:true},reply:command=>command==='sync'?{passed:true,code:0,report:{inSync:true,reviewedWorkingIdentity:'target-B'}}:undefined});await assert.rejects(f.provider.sync({expectedWorkingIdentity:'target-A'}),/confirm|target/i);});
test('native target refusal retains its original result and no-write evidence',async()=>{const refusal={passed:false,code:2,report:{error:'Reviewed target changed',uploaded:false,compiled:false,executed:false}};const f=make({flags:{sync:true,reviewedWorkingSync:true},reply:command=>command==='sync'?refusal:undefined});assert.equal(await f.provider.sync({expectedWorkingIdentity:'target-A'}),refusal);});
