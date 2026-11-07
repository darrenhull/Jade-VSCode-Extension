'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classSections}=require('../../extension/src/class-view-model');
test('classifies editable declarations while retaining exact multiline Unicode CRLF source and Jade metadata',()=>{
 const text=['schemaDefinition','Pets subschemaOf RootSchema;','typeHeaders','Fish subclassOf Object transient;','typeDefinitions','Fish completeDefinition','(','// 🐟 declarations','attributeDefinitions',' balance: Decimal[12,2]','  readonly, subschemaHidden, number = 4, ordinal = 2;','referenceDefinitions',' tank: Object implicitMemberInverse, number = 5;','constantDefinitions',' label: String = "fish";',')','typeSources'].join('\r\n');
 const cls=classSections(text,'file:///Fish.cls')[0],property=cls.groups.find(g=>g.label==='Properties').items[0],reference=cls.groups.find(g=>g.label==='References').items[0],constant=cls.groups.find(g=>g.label==='Constants').items[0];
 assert.equal(property.kind,'property');assert.equal(property.name,'balance');assert.equal(text.slice(property.start,property.end),'balance: Decimal[12,2]\r\n  readonly, subschemaHidden, number = 4, ordinal = 2;');
 assert.equal(reference.kind,'reference');assert.equal(text.slice(reference.start,reference.end),'tank: Object implicitMemberInverse, number = 5;');assert.equal(constant.kind,'constant');
});
