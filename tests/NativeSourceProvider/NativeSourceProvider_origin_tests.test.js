 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NativeSourceProvider}=require('../../extension/src/NativeSourceProvider');
const {fixture,clone}=require('./fixtures/provider.cjs');
const run={rawRange:{start:{line:3,character:8},end:{line:3,character:13}},projectionRange:{start:{line:0,character:0},end:{line:0,character:5}}};
function setup(options={}){const f=fixture({flags:{originLookup:true},...options});f.document.projection.mapping=[run];return {...f,provider:new NativeSourceProvider({client:f.client,config:f.config})};}
test('origin lookup uses native saved-generation selector and returns exact mapped method',async()=>{
 const f=setup();await f.provider.prepare();const selector={originUri:f.document.origin.uri,originText:'<source>value</source>',position:{line:3,character:9}};
 const result=await f.provider.readAtOrigin(selector);assert.equal(result.entityId,f.document.entityId);
 assert.deepEqual(f.requests.at(-1).body,{...f.provider.binding(),...selector});assert.deepEqual(result.projection.mapping,[run]);
});
test('raw lookup refuses old capabilities, foreign origins, malformed maps and invalid cursor before launch',async()=>{
 const old=setup({flags:{originLookup:false}});await old.provider.prepare();await assert.rejects(old.provider.readAtOrigin({}),/update|lookup/i);
 const f=setup();await f.provider.prepare();await assert.rejects(f.provider.readAtOrigin({originUri:'file:///C:/foreign/Fish.jox',originText:'x',position:{line:0,character:0}}),/origin|outside/i);
 await assert.rejects(f.provider.readAtOrigin({originUri:f.document.origin.uri,originText:'x',position:{line:-1,character:0}}),/position/i);
 f.document.projection.mapping=[];await assert.rejects(f.provider.readAtOrigin({originUri:f.document.origin.uri,originText:'x',position:{line:0,character:0}}),/mapping/i);
});

test('native stack lookup selects exact method identity in the same raw origin without a cursor',async()=>{
 const f=setup();await f.provider.prepare();
 const selector={originUri:f.document.origin.uri,originText:'raw',entityId:f.document.entityId};
 const result=await f.provider.readAtOrigin(selector);assert.equal(result.entityId,selector.entityId);assert.deepEqual(f.requests.at(-1).body,{...f.provider.binding(),...selector});
 await assert.rejects(f.provider.readAtOrigin({...selector,entityId:'foreign'}),/entity|method/i);
});
