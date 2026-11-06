'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSource}=require('../extension/src/source_symbols');
test('large joined native sources keep every owner, field, method and selection boundary',()=>{
 const count=2500,names=Array.from({length:count},(_,n)=>'JoinedType'+n);
 const text='schemaDefinition\nLarge subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+names.map(name=>name+' subclassOf Object transient;').join('\n')+'\ntypeDefinitions\n'+names.map(name=>`${name} completeDefinition\n(\nattributeDefinitions\n value: Integer;\njadeMethodDefinitions\n getValue() : Integer;\n)`).join('\n')+'\ndatabaseDefinitions\ntypeSources\n'+names.map(name=>`${name} (\njadeMethodSources\ngetValue\n{\ngetValue() : Integer;\nbegin\n return self.value;\nend;\n}\n)`).join('\n');
 const result=parseSource(text,'aggregate.cls');assert.equal(result.classes.length,count);
 for(const cls of result.classes){assert.equal(cls.members.length,2);assert.equal(text.slice(cls.selection,cls.selection+cls.name.length),cls.name);const method=cls.members.find(m=>m.name==='getValue');assert.ok(method.bodyStart>0);assert.equal(text.slice(method.selection,method.selection+method.name.length),method.name);}
});
