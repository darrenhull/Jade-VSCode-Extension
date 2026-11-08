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

test('explicit Disconnect releases the selected target but cancel and dispose remain logical',async()=>{for(const action of ['jadeNative.disconnectObjects','jadeNative.cancelObjectInspection','dispose']){const f=setup();try{await f.connect();let pending;if(action==='dispose')f.disposeExtension();else pending=f.commands.get(action)();await Promise.resolve();assert.equal(f.clients[0].stopOptions?.disconnect,action==='jadeNative.disconnectObjects'?true:undefined);f.clients[0].finishClose();await pending;}finally{await f.cleanup();}}});
test('explicit Disconnect refuses to interrupt an active IDE operation',async()=>{const f=setup();try{await f.connect();const oldStop=f.clients[0].stop;f.clients[0].stop=options=>{const result=oldStop(options);queueMicrotask(()=>f.clients[0].finishClose());return result;};f.setExternalBusy(true);await f.commands.get('jadeNative.disconnectObjects')();assert.equal(f.clients[0].stopCalled,undefined);assert.match(f.errors.at(-1),/operation|wait/i);f.setExternalBusy(false);}finally{await f.cleanup();}});

test('explicit Disconnect still releases the idle selected target after its logical reader closed',async()=>{const f=setup();try{await f.connect();const closing=f.commands.get('jadeNative.cancelObjectInspection')();await Promise.resolve();f.clients[0].finishClose();await closing;await f.commands.get('jadeNative.disconnectObjects')();assert.equal(f.clients.length,1,'disconnect must not reopen an inspector');assert.equal(f.targetDisconnections.length,1);assert.equal(f.targetDisconnections[0].target,'source');assert.equal(f.targetDisconnections[0].config.databasePath,require('node:path').join(f.root,'database'));}finally{await f.cleanup();}});

test('connected status uses the native resolved target path without requiring UI metadata in the CLI response',async()=>{const f=setup({nativeTarget:true});try{await f.commands.get('jadeNative.connectObjects')();assert.match(f.controller.view.message,/actual-native-working/);assert.doesNotMatch(f.controller.view.message,/Select database settings/);}finally{await f.cleanup();}});

function epochChanged(){return Object.assign(Error('Native connection changed; refresh the catalogue.'),{code:'JADE_INSPECTION_EPOCH_CHANGED'});}
test('one Refresh reloads the native catalogue after an epoch change with no cached instance cursors',async()=>{const f=setup();try{await f.connect();const client=f.clients[0],original=client.request;let requests=0;client.request=async(command,args)=>{if(command==='catalog'&&++requests===1){client.emit('epoch',{previous:'one',current:'two'});throw epochChanged();}return original(command,args);};await f.commands.get('jadeNative.refreshObjects')();assert.equal(requests,2);assert.equal(f.errors.length,0);assert.ok((await f.controller.provider.getChildren()).some(row=>row.kind==='schema'));assert.equal(f.controller.session.client,client);}finally{await f.cleanup();}});
test('a catalogue epoch reload cannot follow a changed database selection',async()=>{const f=setup();try{await f.connect();const client=f.clients[0];let requests=0;client.request=async()=>{requests++;client.emit('epoch',{previous:'one',current:'two'});const selected=f.controller.session.select('working');client.finishClose();await selected;throw epochChanged();};await f.commands.get('jadeNative.refreshObjects')();assert.equal(requests,1);assert.equal(f.clients.length,1);assert.equal(f.controller.session.client,undefined);assert.equal(f.controller.session.target,'working');}finally{await f.cleanup();}});
test('a continuously replaced catalogue retries once and a later stable Refresh recovers',async()=>{const f=setup();try{await f.connect();const client=f.clients[0],original=client.request;let requests=0;client.request=async()=>{requests++;client.emit('epoch',{previous:String(requests),current:String(requests+1)});throw epochChanged();};await f.commands.get('jadeNative.refreshObjects')();assert.equal(requests,2);assert.equal(f.errors.length,1);client.request=original;await f.commands.get('jadeNative.refreshObjects')();assert.ok((await f.controller.provider.getChildren()).some(row=>row.kind==='schema'));}finally{await f.cleanup();}});
