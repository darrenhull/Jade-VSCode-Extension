'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {testDependencies}=require('../extension/src/test-dependencies');
const cls=(schema,name,parent,body='')=>`schemaDefinition\n${schema} subschemaOf ${schema==='Domain'?'RootSchema':'Domain'} partialDefinition;\ntypeHeaders\n${name} subclassOf ${parent} transient;\ntypeDefinitions\n${name} completeDefinition\n(\n)\ntypeSources\n${body}`;
test('test dependencies include local domain and base classes, exclude unrelated broken classes and other-schema namesakes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-test-scope-'));const files=[];
 function put(file,text){const to=path.join(root,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,text);files.push(to);return to;}
 const domain=put('any-folder/Pet.cls',cls('Domain','Pet','Object'));
 const base=put('elsewhere/Base.cls',cls('Tests','Base','JadeTestCase'));
 const selected=put('CatTest.cls',cls('Tests','CatTest','Base','CatTest (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nvars\npet : Pet;\nbegin\n// BrokenClass is not a dependency\nwrite "BrokenClass";\nend;\n}\n)'));
 put('BrokenClass.cls',cls('Tests','BrokenClass','MissingType'));
 put('another-schema/Pet.cls',cls('Other','Pet','UnknownBase'));
 assert.deepEqual(new Set(await testDependencies(files,selected)),new Set([selected,base,domain]));
});
