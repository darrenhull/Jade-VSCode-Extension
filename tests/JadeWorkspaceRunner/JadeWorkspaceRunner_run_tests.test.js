'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JadeWorkspaceRunner}=require('../../extension/src/JadeWorkspaceRunner');
function document(text='begin\n write 42;\nend;'){return {version:1,uri:{toString:()=> 'untitled:Workspace-1.jade'},getText:()=>text};}
function cancellation(){const listeners=new Set();return {isCancellationRequested:false,onCancellationRequested(fn){listeners.add(fn);return {dispose:()=>listeners.delete(fn)};},cancel(){this.isCancellationRequested=true;for(const fn of listeners)fn();}};}
test('run passes an immutable unsaved snapshot to native Working execution and never requests publication',async()=>{
 const calls=[],doc=document(),runner=new JadeWorkspaceRunner({client:{request(command,body){calls.push({command,body});return {id:7,promise:Promise.resolve({code:0,passed:true,report:{output:'42'}})};}},configFor:async()=>({schema:'Pets',workspaceRoots:['C:/repo']}),beforeOperation:async()=>{}});
 const result=await runner.run({document:doc,schema:'Pets'});
 assert.equal(result.passed,true);assert.equal(result.stale,false);assert.equal(calls.length,1);assert.equal(calls[0].command,'workspace.run');
 assert.equal(calls[0].body.sourceText,doc.getText());assert.equal(calls[0].body.source,doc.uri.toString());assert.equal(calls[0].body.config.schema,'Pets');
});
test('edits during native execution mark results stale instead of mapping errors onto changed text',async()=>{
 const doc=document();let finish;const runner=new JadeWorkspaceRunner({client:{request(){return {id:1,promise:new Promise(resolve=>finish=resolve)};}},configFor:async()=>({schema:'Pets'})});
 const operation=runner.run({document:doc,schema:'Pets'});while(!finish)await new Promise(resolve=>setImmediate(resolve));doc.version++;
 finish({code:6027,passed:false,report:{diagnostics:[{position:6,length:4}]}});assert.equal((await operation).stale,true);
});
test('cancellation targets only its owned request and queued cancelled cells never call native code',async()=>{
 const calls=[],token=cancellation();let finish;
 const runner=new JadeWorkspaceRunner({client:{request(command,body){calls.push({command,body});return command==='cancel'?{id:2,promise:Promise.resolve({passed:true})}:{id:9,promise:new Promise(resolve=>finish=resolve)};}},configFor:async()=>({schema:'Pets'})});
 const first=runner.run({document:document(),schema:'Pets',token});while(!finish)await new Promise(resolve=>setImmediate(resolve));
 const queuedToken=cancellation(),second=runner.run({document:document(),schema:'Pets',token:queuedToken});queuedToken.cancel();token.cancel();
 finish({code:130,passed:false,cancelled:true,report:{}});
 assert.equal((await first).cancelled,true);assert.equal((await second).cancelled,true);
 assert.deepEqual(calls.map(call=>call.command),['workspace.run','cancel']);assert.equal(calls[1].body.operationId,9);
});
test('failed native responses and transport errors remain failures and allow subsequent runs',async()=>{
 let count=0;const runner=new JadeWorkspaceRunner({client:{request(){if(!count++)throw Error('Native unavailable');return {id:1,promise:Promise.resolve({code:0,passed:true,report:{}})};}},configFor:async()=>({schema:'Pets'})});
 const failed=await runner.run({document:document(),schema:'Pets'});assert.equal(failed.passed,false);assert.match(failed.report.error,/unavailable/);
 assert.equal((await runner.run({document:document(),schema:'Pets'})).passed,true);
});
test('releases exactly the acquired operation lease after native failure and never releases a rejected acquisition',async()=>{
 const lease={},released=[];let blocked=false;
 const runner=new JadeWorkspaceRunner({client:{request(){throw Error('native failed');}},configFor:async()=>({schema:'Pets'}),beforeOperation:async()=>{if(blocked)throw Error('another operation owns the runtime');return lease;},afterOperation:async value=>released.push(value)});
 assert.equal((await runner.run({document:document()})).passed,false);assert.deepEqual(released,[lease]);
 blocked=true;assert.match((await runner.run({document:document()})).report.error,/owns/);assert.deepEqual(released,[lease]);
});
