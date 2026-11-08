'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../../test/fixtures/object-ui.cjs');
test('an idle native inspection connection leaves IDE execution ownership available',async()=>{
 const f=setup();
 try{
  await f.connect();
  assert.ok(f.controller.session.client,'inspection remains connected');
  assert.equal(f.busy(),false,'a connected idle inspector must not claim active compile/test ownership');
  assert.equal(f.changes.includes(true),false,'inspection must not claim the global execution flag');
 }finally{await f.cleanup();}
});
for(const kind of ['settings','project file'])test('changed '+kind+' invalidate the logical reader without keeping old objects',async()=>{
 const f=setup();try{await f.connect();const c=f.clients[0];const pending=kind==='settings'?f.changeConfiguration({affectsConfiguration:name=>name==='jadeNative'}):f.saveConfiguration(require('node:path').join(f.root,'source','jade.json'));await Promise.resolve();assert.equal(c.stopCalled,true);c.finishClose();await pending;assert.equal(f.controller.session.client,undefined);assert.equal(f.busy(),false);}finally{await f.cleanup();}
});

test('Refresh lazily opens inspection when no native reader exists',async()=>{const f=setup();try{await f.commands.get('jadeNative.refreshObjects')();assert.equal(f.clients.length,1);assert.ok(f.controller.session.client);assert.equal(f.busy(),false);}finally{await f.cleanup();}});

test('extension disposal tolerates the shared service already closing without an unhandled rejection',async()=>{const f=setup();try{await f.connect();f.clients[0].stop=async()=>{throw Error('CLI service is disposed');};f.disposeExtension();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.controller.session.client,undefined);}finally{await f.cleanup();}});
