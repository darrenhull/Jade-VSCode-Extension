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