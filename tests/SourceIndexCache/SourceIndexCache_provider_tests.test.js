'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {SourceIndex}=require('../../extension/src/workspace-index');
const {parseSource}=require('../../extension/src/source_symbols');
const uri='file:///synthetic/Fish.cls';
const source=name=>'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+name+' subclassOf Object;\ntypeDefinitions\n'+name+' completeDefinition ()\ntypeSources\n';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture({rows=[],read=async()=>Buffer.from(source('Fish')),proof}={}){
 const saved=[],cleared=[],errors=[];let loads=0,lists=0,reads=0;
 const cache={nativeVersion:'test-cli',async load(){loads++;return rows;},set:(uri,row)=>saved.push({uri,...row}),delete:uri=>cleared.push(uri),flush:async()=>{},invalidate(){}};
 const index=new SourceIndex({list:async()=>{lists++;return[uri];},read:async()=>{reads++;return read();},proof,cache,onError:error=>errors.push(error)});
 return{index,saved,cleared,errors,cache,loads:()=>loads,lists:()=>lists,reads:()=>reads,setRows:next=>{rows=next;}};
}
test('provider hashes original UTF16 bytes and decodes the same single saved read',async()=>{
 const bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(source('SavedFish'),'utf16le')]),f=fixture({read:async()=>bytes});
 await f.index.ready();await f.index.persist();
 assert.equal(f.reads(),1);assert.equal(f.saved[0]?.rawSha256,hash(bytes));assert.equal(f.saved[0]?.model.classes[0].name,'SavedFish');assert.equal(f.saved[0].model.text,'');f.index.dispose();
});
test('validated native digest proof reuses shared rows without a fake timestamp or file read',async()=>{
 const bytes=Buffer.from(source('Fish')),rawSha256=hash(bytes),f=fixture({rows:[{uri,rawSha256,model:parseSource(source('Fish'),uri)}],proof:async()=>({rawSha256})});
 await f.index.ready();assert.equal(f.reads(),0);assert.equal(f.index.records.get(uri).rawSha256,rawSha256);assert.equal(f.index.records.get(uri).stamp,undefined);f.index.dispose();
});
test('changed native proof reads saved bytes; failed saved read never persists a dirty buffer',async()=>{
 const old=Buffer.from(source('Fish')),next=Buffer.from(source('NewFish')),f=fixture({rows:[{uri,rawSha256:hash(old),model:parseSource(source('Fish'),uri)}],proof:async()=>({rawSha256:hash(next)}),read:async()=>next});
 await f.index.ready();assert.equal(f.reads(),1);assert.equal(f.saved[0].rawSha256,hash(next));assert.equal(f.index.records.get(uri).model.classes[0].name,'NewFish');
 const dirty={uri:{toString:()=>uri},version:2,isDirty:true,getText:()=>source('UnsavedFish')};f.index.document(dirty);f.index.read=async()=>{throw Error('disk read failed');};f.index.schedule(uri);await f.index.flush();await f.index.persist();assert.equal(f.saved.length,1);assert.equal(f.index.records.get(uri).model.classes[0].name,'UnsavedFish');f.index.dispose();
 const broken=fixture({read:async()=>{throw Error('save failed');}});await broken.index.ready();assert.equal(broken.saved.length,0);assert.equal(broken.index.records.size,0);broken.index.dispose();
});
test('cache version repair reloads saved rows while dirty models survive without a global scan',async()=>{
 const f=fixture();await f.index.restore();f.index.document({uri:{toString:()=>uri},version:1,isDirty:true,getText:()=>source('UnsavedFish')});
 const other='file:///synthetic/Bird.cls';f.setRows([{uri,rawSha256:'a'.repeat(64),model:parseSource(source('SavedFish'),uri)},{uri:other,rawSha256:'b'.repeat(64),model:parseSource(source('Bird'),other)}]);
 await f.index.reloadSavedCache();assert.equal(f.loads(),2);assert.equal(f.lists(),0);assert.equal(f.index.records.get(uri).model.classes[0].name,'UnsavedFish');assert.equal(f.index.records.get(other).model.classes[0].name,'Bird');assert.equal(f.saved.length,0);f.index.dispose();
});
