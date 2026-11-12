'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sourceExtractionFailureContext}=require('../../extension/src/source-extraction-failure-log');
const failed=report=>({passed:false,status:'failed',code:1205,report});
const operation=i=>({stage:'inventory',targetSchema:'Pets',lastSuccessfullySelectedSchema:'Pets',currentType:'Fish'+i,operation:'selectType',receiverNull:false,receiverKind:'Type'});
test('failure context distinguishes execution, target and last selected schema and preserves ordered recent operations',()=>{
 const lines=sourceExtractionFailureContext(failed({executionSchema:'JadeSchema',sourceVersion:'CURRENT',targetSchema:'Pets',lastSuccessfullySelectedSchema:'BasePets',recentOperations:[operation(1),operation(2)]}));
 assert.match(lines.join('\n'),/executionSchema="JadeSchema"/);assert.match(lines.join('\n'),/lastSuccessfullySelectedSchema="BasePets"/);assert.ok(lines.findIndex(v=>v.includes('Fish1'))<lines.findIndex(v=>v.includes('Fish2')));assert.match(lines.join('\n'),/receiverNull=false/);
});
test('success and absent diagnostic reports do not produce failure history',()=>{
 assert.deepEqual(sourceExtractionFailureContext({passed:true,status:'completed',report:{recentOperations:[operation(1)]}}),[]);
 for(const report of [undefined,null,42,[],{recentOperations:'not-an-array'}])assert.deepEqual(sourceExtractionFailureContext(failed(report)),[]);
});
test('only scalar allowlisted metadata is logged; secret or nested fields are ignored',()=>{
 const lines=sourceExtractionFailureContext(failed({executionSchema:{password:'TOPSECRET'},config:{password:'TOPSECRET'},source:'TOPSECRET',recentOperations:[null,[],{...operation(1),currentType:{source:'TOPSECRET'},password:'TOPSECRET',oid:'TOPSECRET',source:'TOPSECRET',receiverNull:'TOPSECRET',nested:{operation:'TOPSECRET'}}]}));
 const text=lines.join('\n');assert.doesNotMatch(text,/TOPSECRET|password|nested|oid|source=/);assert.match(text,/operation="selectType"/);
});
test('at most the latest 32 operations are logged without line injection or broken Unicode',()=>{
 const trace=Array.from({length:40},(_,i)=>operation(i));trace[39].currentType='🐟'.repeat(200)+'\nFAKE';
 const text=sourceExtractionFailureContext(failed({recentOperations:trace})).join('\n');assert.doesNotMatch(text,/currentType="Fish7"/);assert.match(text,/currentType="Fish8"/);assert.equal((text.match(/operation="selectType"/g)||[]).length,32);assert.ok(text.isWellFormed());assert.doesNotMatch(text,/\nFAKE/);assert.ok(Buffer.byteLength(text)<=16384);
});
test('oversized metadata and trace cannot exceed the total output cap and retain newest operations',()=>{
 const huge='🐠'.repeat(100000);const trace=Array.from({length:10000},(_,i)=>({...operation(i),stage:huge,targetSchema:huge,lastSuccessfullySelectedSchema:huge,operation:huge,receiverKind:huge}));
 const text=sourceExtractionFailureContext(failed({executionSchema:huge,sourceVersion:huge,recentOperations:trace})).join('\n');assert.ok(Buffer.byteLength(text)<=16384);assert.match(text,/Fish9999/);assert.match(text,/older operations omitted/);assert.ok(text.isWellFormed());
});
test('lastOperation is available when the operation ring is absent',()=>{
 assert.match(sourceExtractionFailureContext(failed({lastOperation:operation(3)})).join('\n'),/Fish3/);
});
