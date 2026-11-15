'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ScratchPadProgress}=require('../../extension/src/ScratchPadProgress');
test('coalesces native bursts behind one pending render and stops without late output overwriting final results',async()=>{
 const rendered=[],timers=[];let release;
 const progress=new ScratchPadProgress(message=>{rendered.push(message);return new Promise(resolve=>release=resolve);},{setTimer:fn=>{timers.push(fn);return fn;},clearTimer:fn=>{const index=timers.indexOf(fn);if(index>=0)timers.splice(index,1);}});
 progress.update('Queued');await new Promise(resolve=>setImmediate(resolve));
 for(let i=0;i<1000;i++)progress.native('[Scratch Pad] source '+i+'\n');
 assert.equal(rendered.length,1);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(timers.length,1);
 timers.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(rendered.length,2);assert.match(rendered[1],/source 999/);assert.ok(rendered[1].length<1024);
 const stopped=progress.stop();progress.update('must never overwrite completion');release();await stopped;
 assert.equal(timers.length,0);assert.equal(rendered.length,2);
});
test('reports rendering failure without throwing from asynchronous progress or retrying it indefinitely',async()=>{
 const error=Error('Notebook closed'),progress=new ScratchPadProgress(()=>{throw error;});
 progress.update('Preparing');await new Promise(resolve=>setImmediate(resolve));assert.equal(await progress.stop(),error);
});
test('spaced native chunks remain rate limited after each asynchronous render has already resolved',async()=>{
 const rendered=[],timers=[];
 const progress=new ScratchPadProgress(async message=>rendered.push(message),{setTimer:fn=>{timers.push(fn);return fn;},clearTimer:fn=>{const index=timers.indexOf(fn);if(index>=0)timers.splice(index,1);}});
 progress.update('Queued');await new Promise(resolve=>setImmediate(resolve));
 for(let i=0;i<25;i++){progress.native('[Scratch Pad] spaced '+i+'\n');await new Promise(resolve=>setImmediate(resolve));}
 try{assert.equal(rendered.length,1,'Completed renders must still retain a cooldown instead of redrawing per spaced chunk');assert.equal(timers.length,1);timers.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(rendered.length,2);assert.match(rendered[1],/spaced 24/);}
 finally{await progress.stop();}
});