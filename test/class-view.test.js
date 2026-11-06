'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classSections,memberPreview}=require('../extension/src/class-view-model');
const source=`jadeVersionNumber "25.0.02";
schemaDefinition
Pets subschemaOf RootSchema partialDefinition;
typeHeaders
Fish subclassOf Object transient;
typeDefinitions
Fish completeDefinition
(
constantDefinitions
 MaxLength: Integer = 100;
attributeDefinitions
 name: String[50];
referenceDefinitions
 tank: Tank;
jadeMethodDefinitions
 getName() : String;
 make() typeMethod;
)
typeSources
Fish (
jadeMethodSources
getName
{
getName() : String;
begin
 return self.name;
end;
}
make
{
make() typeMethod;
begin
end;
}
)`;
test('class view groups source members with schema-qualified identities and source locations',()=>{
 const result=classSections(source,'Fish.cls');assert.equal(result[0].id,'Pets::Fish');
 const groups=Object.fromEntries(result[0].groups.map(g=>[g.label,g.items]));
 assert.deepEqual(groups.Properties.map(m=>m.name),['name']);assert.deepEqual(groups.References.map(m=>m.name),['tank']);
 assert.deepEqual(groups.Constants.map(m=>m.name),['MaxLength']);assert.deepEqual(groups.Methods.map(m=>m.name),['getName']);assert.deepEqual(groups['Type methods'].map(m=>m.name),['make']);
 assert.equal(source.slice(groups.Methods[0].selection).startsWith('getName'),true);
 assert.match(groups.Properties[0].detail,/String\[50\]/);assert.match(groups.Methods[0].detail,/\(\).*String/);
});
test('focused member preview is derived from current source, with no copied file',()=>{
 assert.match(memberPreview(source,'Fish.cls','Fish','getName').text,/return self.name/);
 assert.match(memberPreview(source.replace('return self.name','return "new value"'),'Fish.cls','Fish','getName').text,/new value/);
 assert.equal(memberPreview(source,'Fish.cls','Fish','missing'),undefined);
});
test('collection keys are distinct from ordinary properties',()=>{
 const text='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFishByName subclassOf MemberKeyDictionary transient;\nmembershipDefinitions\nFishByName of Fish;\ntypeDefinitions\nFishByName completeDefinition\n(\n)\nmemberKeyDefinitions\nFishByName completeDefinition\n(\n name caseInsensitive;\n)\ntypeSources\n';
 const cls=classSections(text,'Collection.cls')[0];assert.equal(cls.membership,'Fish');assert.equal(cls.groups.find(g=>g.label==='Collection keys').items[0].name,'name');
});
test('partial class selections point at their actual class name rather than leading whitespace',()=>{
 const text='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeDefinitions\n\n   Fish partialDefinition\n(\nattributeDefinitions\n name: String;\n)\ntypeSources\n';
 const cls=classSections(text,'Partial.cls')[0];assert.equal(text.slice(cls.selection,cls.selection+cls.name.length),'Fish');
});
