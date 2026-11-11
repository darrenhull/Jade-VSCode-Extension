"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {SourceIndex}=require("../../extension/src/workspace-index");
const text='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object;\ntypeDefinitions\nFish completeDefinition\n(\n)\ntypeSources\n';
test("30k disk events coalesce behind a bulk lease while editor changes stay live",async()=>{
 const reads=[];const index=new SourceIndex({list:async()=>[],read:async uri=>{reads.push(uri);return text;}});await index.ready();const release=await index.pauseDiskUpdates();
 try{
  for(let i=0;i<30000;i++)index.schedule("file:///"+(i%8)+".cls");await index.flush();assert.equal(reads.length,0);
  index.document({uri:{toString:()=>"file:///dirty.cls"},version:1,getText:()=>text});assert.equal(index.records.get("file:///dirty.cls").open,true);
 }finally{await release();}
 assert.equal(reads.length,8);assert.equal(index.bulkUpdating,false);assert.equal(index.pending.size,0);index.dispose();
});
test("nested leases release once and finally cleanup resumes queued saved-file updates",async()=>{
 const reads=[];const index=new SourceIndex({list:async()=>[],read:async uri=>{reads.push(uri);return text;}});
 const outer=await index.pauseDiskUpdates(),inner=await index.pauseDiskUpdates();index.schedule("file:///saved.cls");await inner();await inner();assert.equal(index.bulkUpdating,true);assert.equal(reads.length,0);
 try{throw Error("native cancelled");}catch{}finally{await outer();}assert.equal(reads.length,1);assert.equal(index.bulkUpdating,false);index.dispose();
});
test("a bulk lease waits for already-running disk reads before native writes start",async()=>{
 let finish;const reads=[];const index=new SourceIndex({list:async()=>[],read:async uri=>{reads.push(uri);if(reads.length===1)await new Promise(resolve=>{finish=resolve;});return text;}});
 index.schedule("file:///first.cls");const flushing=index.flush();let acquired=false;const acquiring=index.pauseDiskUpdates().then(release=>{acquired=true;return release;});
 index.schedule("file:///second.cls");await new Promise(setImmediate);assert.equal(acquired,false);finish();await flushing;const release=await acquiring;assert.equal(reads.length,1);await release();assert.equal(reads.length,2);index.dispose();
});
