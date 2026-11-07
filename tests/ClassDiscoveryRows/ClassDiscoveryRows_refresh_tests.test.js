'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createClassDiscoveryRows}=require('../../extension/src/class-discovery-rows');
test('warm metadata edits reuse class identities and resolve only the changed file project',()=>{
 let lookups=0;const read=createClassDiscoveryRows(uri=>{lookups++;return {name:'Project',uri:{toString:()=> 'file:///project',fsPath:'/project'}};});
 const groups=new Map(Array.from({length:30000},(_,i)=>['Pets::C'+i,[{cls:{name:'C'+i,parent:'Object'},model:{schema:'Pets',uri:'file:///project/C'+i+'.cls'}}]]));
 const first=read(groups);assert.equal(lookups,30000);
 groups.set('Pets::C0',[{cls:{name:'C0',parent:'Object'},model:{schema:'Pets',uri:'file:///project/C0.cls',revision:2}}]);
 const next=read(groups);assert.equal(lookups,30001);assert.equal(next[0],first[0]);assert.equal(next[0].entries[0].model.revision,2);
 groups.delete('Pets::C1');assert.equal(read(groups).length,29999);
});
