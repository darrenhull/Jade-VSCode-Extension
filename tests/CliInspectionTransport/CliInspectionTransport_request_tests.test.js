'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {CliInspectionTransport} = require('../../extension/src/CliInspectionTransport');
function fixture(handler) {
 const calls = [], child = new EventEmitter(); let next = 0;
 const service = {connect: () => ({child}), request(command, body, output) {
  const id = ++next; calls.push({id, command, body});
  const promise = Promise.resolve().then(() => handler ? handler(command, body, output) : ({passed:true, code:0, sessionId:body.sessionId,
   body:command==='inspect.close'?{oidFormat:'jade-native'}:{readOnly:true, oidFormat:'jade-native', connectionEpoch:body.target+'-1', schemas:[], command}}));
  return {id, promise};
 }};
 const config = {installPath:'C:/Jade', databasePath:'C:/Source/system', iniPath:'C:/Source/jade.ini', workspaceRoots:['C:/project'], storagePath:'C:/state'};
 const create = target => new CliInspectionTransport(service, {config, target, catalogArgs:{includeSystem:false}});
 return {service, config, calls, child, create};
}
test('opens native inspection through the existing shared service and reuses the first exact catalogue response once', async () => {
 const f = fixture(), transport = f.create('working');
 try {
  await transport.ready;
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].command, 'inspect.catalog');
  assert.equal(f.calls[0].body.config.databasePath, f.config.databasePath, 'send original Source config, not derived Working config');
  assert.equal(f.calls[0].body.target, 'working');
  await transport.request('catalog', {includeSystem:false}); assert.equal(f.calls.length, 1);
  await transport.request('catalog', {includeSystem:false}); assert.equal(f.calls.length, 2);
  await transport.request('object', {oid:'9002.1'}); assert.equal(f.calls[2].body.args.oid, '9002.1');
  assert.equal(new Set(f.calls.map(call=>call.body.sessionId)).size, 1);
 } finally {await transport.stop();}
 assert.equal(f.calls.at(-1).command, 'inspect.close');
 assert.equal(f.calls.some(call=>call.command==='disconnect'), false);
});
test('Source and Working inspection use separate logical identities on the same service without changing their target config', async () => {
 const f = fixture(), working=f.create('working'), source=f.create('source');
 await Promise.all([working.ready, source.ready]);
 assert.notEqual(f.calls[0].body.sessionId, f.calls[1].body.sessionId);
 assert.deepEqual(f.calls.map(call=>call.body.target).sort(), ['source','working']);
 await working.stop(); assert.equal(source.state, 'ready'); await source.request('object', {oid:'9002.1'}); await source.stop();
});
for(const body of [{readOnly:false,oidFormat:'jade-native',connectionEpoch:'1'},{readOnly:true,connectionEpoch:'1'},{readOnly:true,oidFormat:'jade-native'}])
 test('native readiness rejects missing read-only, OID or connection identity capability '+JSON.stringify(body), async () => {
  const f=fixture((command,args)=>({passed:true,code:0,sessionId:args.sessionId,body:command==='inspect.close'?{}:body})), transport=f.create('working');
  await assert.rejects(transport.ready,/read.only|identit|epoch|native|update/i); await transport.stop();
 });
test('mutation commands are refused before service dispatch and native error codes survive unchanged', async () => {
 const f=fixture((command,args)=>command==='inspect.object'?{passed:false,code:1713,report:{error:'Access denied'}}:{passed:true,code:0,sessionId:args.sessionId,body:{readOnly:true,oidFormat:'jade-native',connectionEpoch:'1',schemas:[]}}), transport=f.create('source');
 await transport.ready;
 await assert.rejects(transport.request('execute',{source:'delete all'}),/read.only/i); assert.equal(f.calls.length,1);
 await assert.rejects(transport.request('object',{oid:'9002.1'}), error=>error.code===1713&&error.message==='Access denied'); await transport.stop();
});
test('stopping cancels only inspection-owned requests and rejects their late values without disconnecting the shared service', async () => {
 let finish;
 const f=fixture((command,args)=>command==='inspect.object'?new Promise(resolve=>{finish=()=>resolve({passed:true,code:0,sessionId:args.sessionId,body:{readOnly:true,oidFormat:'jade-native',connectionEpoch:'1',oid:'9002.1'}});}):{passed:true,code:0,sessionId:args.sessionId,body:{readOnly:true,oidFormat:'jade-native',connectionEpoch:'1',schemas:[]}}), transport=f.create('working');
 await transport.ready; const pending=transport.request('object',{oid:'9002.1'}), rejected=assert.rejects(pending,/closed|cancelled/i);
 await new Promise(resolve=>setImmediate(resolve)); const operation=f.calls.find(call=>call.command==='inspect.object');
 await transport.stop(); finish(); await rejected;
 assert.deepEqual(f.calls.filter(call=>call.command==='cancel').map(call=>call.body.operationId),[operation.id]);
 assert.equal(f.calls.some(call=>call.command==='disconnect'),false); assert.equal(transport.state,'closed');
});
test('a replaced native connection reports its opaque epoch and a closed shared channel invalidates inspection', async () => {
 let epoch='node-1';
 const f=fixture((command,args)=>({passed:true,code:0,sessionId:args.sessionId,body:{readOnly:true,oidFormat:'jade-native',connectionEpoch:epoch,schemas:[]}})), transport=f.create('working'), changes=[];
 transport.on('epoch',value=>changes.push(value)); await transport.ready; await transport.request('catalog',{includeSystem:false});
 epoch='node-2'; await transport.request('object',{oid:'9002.1'}); assert.equal(transport.connectionEpoch,'node-2'); assert.deepEqual(changes,[{previous:'node-1',current:'node-2'}]);
 f.child.emit('close',2); await assert.rejects(transport.request('object',{oid:'9002.1'}),/closed/i); assert.equal(transport.state,'closed');
});
test('stale native handles carry the previous epoch and are rejected without replay',async()=>{
 const f=fixture((command,args)=>({passed:true,code:0,sessionId:args.sessionId,body:{readOnly:true,oidFormat:'jade-native',connectionEpoch:command==='inspect.object'?'new-node':'old-node',staleConnection:command==='inspect.object',schemas:[]}}));
 const transport=f.create('working');try{await transport.ready;await assert.rejects(transport.request('object',{oid:'9002.1'}),/changed|refresh/i);const calls=f.calls.filter(c=>c.command==='inspect.object');assert.equal(calls.length,1);assert.equal(calls[0].body.args.connectionEpoch,'old-node');assert.equal(transport.connectionEpoch,'new-node');}finally{await transport.stop();}
});

test('explicit disconnect asks native to release only its bound target while ordinary close remains logical',async()=>{const f=fixture(),working=f.create('working'),source=f.create('source');await Promise.all([working.ready,source.ready]);await working.stop({disconnect:true});await source.stop();const closes=f.calls.filter(c=>c.command==='inspect.close');assert.equal(closes[0].body.target,'working');assert.deepEqual(closes[0].body.args,{disconnect:true});assert.notEqual(closes[1].body.args?.disconnect,true);assert.equal(f.calls.some(c=>c.command==='disconnect'),false);});

test('idle targeted disconnect uses existing close without opening a reader or invoking global disconnect',async()=>{const f=fixture();await CliInspectionTransport.disconnectTarget(f.service,{config:f.config,target:'source'});assert.equal(f.calls.length,1);assert.equal(f.calls[0].command,'inspect.close');assert.equal(f.calls[0].body.target,'source');assert.equal(f.calls[0].body.config.databasePath,f.config.databasePath);assert.deepEqual(f.calls[0].body.args,{disconnect:true});});
