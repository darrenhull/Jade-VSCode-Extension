'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {SourceIndex}=require('../../extension/src/workspace-index');
test('pending reads report active source and elapsed time without claiming completion',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),events=[],timings=[];const index=new SourceIndex({onTiming:value=>timings.push(value),list:async()=>['file:///slow.cls'],read:async()=>{await gate;return '';}});index.onDidChange(state=>events.push(state));const ready=index.ready();
 try{await new Promise(resolve=>setTimeout(resolve,620));const heartbeat=events.filter(state=>state.phase==='indexing'&&state.currentUri==='file:///slow.cls');assert.ok(heartbeat.length>=2,'No live pending-file progress');assert.ok(heartbeat.at(-1).elapsedMs>=250);assert.equal(index.status.completed,0);assert.equal(index.status.total,1);assert.equal(index.status.phase,'indexing');}finally{release();await ready;index.dispose();}assert.equal(index.status.phase,'ready');assert.equal(timings.length,1);assert.ok(timings[0].readMs>=500);assert.ok(timings[0].parseMs>=0);
});

test('watcher flush does not claim a blocked initial scan completed and disposal stops heartbeats',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),events=[];const index=new SourceIndex({list:async()=>['file:///blocked.cls'],read:async uri=>{if(uri.endsWith('blocked.cls'))await gate;return '';}});index.onDidChange(state=>events.push(state));const ready=index.ready();await new Promise(setImmediate);index.schedule('file:///saved.cls');await index.flush();assert.equal(index.status.phase,'indexing');index.dispose();const before=events.length;await new Promise(resolve=>setTimeout(resolve,350));assert.equal(events.length,before);release();await ready;
});
