'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,oid}=require('../../test/fixtures/object-ui.cjs');
const latest=panel=>panel.messages.filter(message=>message.command==='object').at(-1);
async function populate(count,width){const f=setup();await f.connect();const request=f.clients[0].request;f.clients[0].request=async(command,args)=>command==='object'?{oid:args.oid,className:'Fish',schema:'Pets',collection:false,readOnly:true,properties:Array.from({length:100},(_,i)=>({name:'p'+i,type:'String',value:'x'.repeat(width)})),nativeExtra:{details:'Private native object metadata'}}:request(command,args);for(let i=0;i<count;i++)await f.commands.get('jadeNative.inspectObject')(oid(30+i));return f;}
for(const count of [25,101])test('history dropdown for '+count+' inspected objects sends bounded identities rather than retained property values',async()=>{
 const f=await populate(count,1000);try{const message=latest(f.panels[0]),retained=Math.min(count,100),historyBytes=Buffer.byteLength(JSON.stringify(message.history));
  assert.ok(historyBytes<retained*128+128,'History payload '+historyBytes+' bytes must scale with identity count, not 100 KB native property snapshots');
  assert.equal(message.history.entries.length,retained);assert.deepEqual(Object.keys(message.history.entries[0]).sort(),['className','oid','schema']);assert.equal(message.history.entries[0].oid,oid(count>100?31:30));assert.equal(message.object.properties.length,100);assert.equal(message.object.properties[99].value.length,1000);assert.ok(Buffer.byteLength(JSON.stringify(message.object))>100000);assert.equal(message.history.position,retained-1);assert.equal(message.history.back,true);assert.equal(message.history.forward,false);
 }finally{await f.cleanup();}
});
test('history serialized size is independent of property value sizes',async()=>{let small,large;try{small=await populate(25,1);large=await populate(25,1000);assert.equal(Buffer.byteLength(JSON.stringify(latest(small.panels[0]).history)),Buffer.byteLength(JSON.stringify(latest(large.panels[0]).history)));}finally{await small?.cleanup();await large?.cleanup();}});
test('identity-only history preserves complete native snapshots, view state and native OIDs for Back and Forward',async()=>{
 const f=await populate(2,1000);try{const panel=f.panels[0],second=latest(panel).object;await panel.receive({command:'viewState',oid:second.oid,scrollY:142,propertiesFilter:'p99',selection:'p99'});await panel.receive({command:'back'});const first=latest(panel).object;assert.equal(first.oid,oid(30));assert.equal(first.properties[99].value.length,1000);await panel.receive({command:'forward'});assert.strictEqual(latest(panel).object,second);assert.equal(latest(panel).view.scrollY,142);assert.equal(latest(panel).view.propertiesFilter,'p99');assert.deepEqual(latest(panel).object.nativeExtra,{details:'Private native object metadata'});await panel.receive({command:'copyOid'});assert.equal(f.copied.at(-1),second.oid);assert.deepEqual(latest(panel).history.entries.map(entry=>entry.oid),[first.oid,second.oid]);
 }finally{await f.cleanup();}
});
