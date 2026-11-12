'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewChanges}=require('../../extension/src/project-tools');
const schema=(name,owners)=>({name,classes:owners.map(owner=>({owner,hash:'unchanged',model:{classes:[{members:[]}]}}))});
test('full publication review lists deletions only inside authoritative local schemas',()=>{
 const before={schemas:[schema('Pets',['Cat','Removed']),schema('Unrelated',['Preserved'])]},after={schemas:[schema('Pets',['Cat'])]};
 const changes=reviewChanges(before,after);assert.ok(changes.includes('DELETE class/override Pets::Removed'));assert.equal(changes.some(line=>line.includes('Unrelated')),false);
});

test('native empty inherited files do not appear as added or deleted local classes in review',()=>{
 const inherited=(owner,body='')=>({owner,hash:owner,model:{classes:[{members:[]}]},text:'typeHeaders\ntypeDefinitions\n '+owner+' completeDefinition\n (\n '+body+'\n )\ndatabaseDefinitions\ntypeSources\n'});
 const empty=inherited('Object'),override=inherited('SubstantiveOverride','attributeDefinitions\n localValue: Integer;');
 const before={schemas:[{...schema('Pets',['Cat']),classes:[...schema('Pets',['Cat']).classes,empty,override]}]},after={schemas:[schema('Pets',['Cat'])]};
 const removals=reviewChanges(before,after);assert.equal(removals.some(line=>line.includes('Pets::Object')),false);assert.ok(removals.includes('DELETE class/override Pets::SubstantiveOverride'));
 const additions=reviewChanges(after,{schemas:[{...schema('Pets',['Cat']),classes:[...schema('Pets',['Cat']).classes,empty]}]});assert.equal(additions.some(line=>line.includes('Pets::Object')),false);
});