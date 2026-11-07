'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {MethodDraftRecovery}=require('../../extension/src/method-draft-recovery');
const identity={uri:'file:///project/Fish.cls',projectId:'file:///project',schema:'Pets',owner:'Fish',member:'name'};
function state(){let data;return{get:()=>data,update:async(key,value)=>{data=structuredClone(value);}};}
test('recovers unacknowledged drafts after reload and clears only exact native acknowledgements',async()=>{
 const storage=state(),first=new MethodDraftRecovery(storage);await first.save(identity,{text:'name();\r\nbegin\r\n write "🐟";\r\nend;',version:3});
 const reloaded=new MethodDraftRecovery(storage);assert.match(reloaded.get(identity).text,/🐟/);
 assert.equal(await reloaded.acknowledge(identity,{text:'different native source',version:4}),false);assert.ok(reloaded.get(identity));
 assert.equal(await reloaded.acknowledge(identity,{text:reloaded.get(identity).text,version:4}),true);assert.equal(new MethodDraftRecovery(storage).get(identity),undefined);
});
test('serializes multiple drafts and never clears a newer optimistic revision with an earlier acknowledgement',async()=>{
 const recovery=new MethodDraftRecovery(state());await Promise.all([recovery.save(identity,{text:'first',version:1}),recovery.save(identity,{text:'second',version:1}),recovery.acknowledge(identity,{text:'first',version:2})]);
 assert.equal(recovery.get(identity).text,'second');
});
test('refuses over-cap writes and preserves existing drafts instead of evicting edits',async()=>{
 const recovery=new MethodDraftRecovery(state(),{maxCharacters:8,maxRecords:1,maxBytes:4096});await recovery.save(identity,{text:'retained',version:1});
 await assert.rejects(recovery.save(identity,{text:'too long to retain',version:2}),/large/);assert.equal(recovery.get(identity).text,'retained');
 await assert.rejects(recovery.save({...identity,member:'other'},{text:'new',version:1}),/full/);assert.equal(recovery.get(identity).text,'retained');
});
test('separates identical class/member names by project, schema, and original source URI',async()=>{
 const recovery=new MethodDraftRecovery(state());await recovery.save(identity,{text:'one',version:1});await recovery.save({...identity,schema:'Other'},{text:'two',version:1});
 assert.equal(recovery.get(identity).text,'one');assert.equal(recovery.get({...identity,schema:'Other'}).text,'two');await recovery.discard(identity);assert.equal(recovery.get(identity),undefined);assert.equal(recovery.get({...identity,schema:'Other'}).text,'two');
});
test('recognizes the same real source after reload resets native document version numbers',async()=>{
 const storage=state(),recovery=new MethodDraftRecovery(storage);await recovery.save(identity,{text:'saved source',version:40});
 const afterReload=new MethodDraftRecovery(storage);assert.equal(await afterReload.acknowledge(identity,{text:'saved source',version:1}),true);
});
test('reserves bounded recovery capacity before typing and keeps reservation after native acknowledgement',async()=>{
 const storage=state(),recovery=new MethodDraftRecovery(storage,{maxCharacters:8,maxRecords:1,maxBytes:200000});
 await recovery.reserve(identity);assert.equal(recovery.get(identity),undefined);assert.equal(recovery.list({uri:identity.uri}).length,0);
 await assert.rejects(recovery.reserve({...identity,member:'other'}),/full/);
 await recovery.save(identity,{text:'edits',version:1});await recovery.acknowledge(identity,{text:'edits',version:2});
 await assert.rejects(recovery.reserve({...identity,member:'other'}),/full/);
 await recovery.release(identity);await recovery.reserve({...identity,member:'other'});
 assert.equal(new MethodDraftRecovery(storage).list({uri:identity.uri}).length,0,'Clean reservations must not appear as recovered edits after reload');
});
test('does not remove recovery protection while a second view holds the same source method',async()=>{
 const recovery=new MethodDraftRecovery(state(),{maxCharacters:8,maxRecords:1,maxBytes:200000});await recovery.reserve(identity);await recovery.reserve(identity);await recovery.release(identity);
 await assert.rejects(recovery.reserve({...identity,member:'other'}),/full/);await recovery.release(identity);await recovery.reserve({...identity,member:'other'});
});
test('a reopened unapplied draft cannot be replaced by fresh backing-source typing or cleared by its acknowledgement',async()=>{
 const storage=state(),first=new MethodDraftRecovery(storage);await first.save(identity,{text:'original recovered work',version:9});
 const reopened=new MethodDraftRecovery(storage);await assert.rejects(reopened.reserve(identity),/Restore|discard/i);
 await assert.rejects(reopened.save(identity,{text:'new text based on old backing file',version:1}),/Restore|discard/i);
 assert.equal(await reopened.acknowledge(identity,{text:'new text based on old backing file',version:2}),false);assert.equal(reopened.get(identity).text,'original recovered work');
 await reopened.discard(identity);await reopened.reserve(identity);await reopened.save(identity,{text:'new deliberate edit',version:3});assert.equal(reopened.get(identity).text,'new deliberate edit');
});
test('closing a view protects its remaining unapplied draft even when reopened in the same session',async()=>{
 const recovery=new MethodDraftRecovery(state());await recovery.reserve(identity);await recovery.save(identity,{text:'pending draft',version:1});await recovery.release(identity);
 await assert.rejects(recovery.reserve(identity),/Restore|discard/i);await assert.rejects(recovery.save(identity,{text:'replacement',version:2}),/Restore|discard/i);assert.equal(recovery.get(identity).text,'pending draft');
});
