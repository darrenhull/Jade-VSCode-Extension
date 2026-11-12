'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewChanges}=require('../../extension/src/project-tools');
const schema=(name,owners)=>({name,classes:owners.map(owner=>({owner,hash:'unchanged',model:{classes:[{members:[]}]}}))});
test('full publication review lists deletions only inside authoritative local schemas',()=>{
 const before={schemas:[schema('Pets',['Cat','Removed']),schema('Unrelated',['Preserved'])]},after={schemas:[schema('Pets',['Cat'])]};
 const changes=reviewChanges(before,after);assert.ok(changes.includes('DELETE class/override Pets::Removed'));assert.equal(changes.some(line=>line.includes('Unrelated')),false);
});
