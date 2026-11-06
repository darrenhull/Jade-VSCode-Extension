'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceDiagnostics}=require('../../extension/src/WorkspaceDiagnostics');
test('a later successful preparation clears resolved dependency errors across cells but preserves independent script errors',()=>{
 const store=new WorkspaceDiagnostics(),scope={schema:'Pets',target:'C:/working'};
 store.replace('cellA',new Map([['file:Cow.cls',{uri:'Cow',items:['7041']}],['cellA',{uri:'A',items:['script']}]]),scope);
 store.replace('cellB',new Map(),{...scope,prepared:true});
 assert.deepEqual([...store.groups().keys()],['cellA']);assert.deepEqual(store.groups().get('cellA').items,['script']);
});
test('preparation in another schema or database does not clear unrelated dependency diagnostics',()=>{
 const store=new WorkspaceDiagnostics(),groups=new Map([['file:Cow.cls',{uri:'Cow',items:['7041']}]]);
 store.replace('cellA',groups,{schema:'Pets',target:'C:/workingA'});
 store.replace('cellB',new Map(),{schema:'Pets',target:'C:/workingB',prepared:true});
 store.replace('cellC',new Map(),{schema:'Other',target:'C:/workingA',prepared:true});assert.equal(store.groups().get('file:Cow.cls').items[0],'7041');
});
