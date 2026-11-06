'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {LanguageModel}=require('../../extension/src/language-model');
const {parseSource}=require('../../extension/src/source_symbols');
test('signatureless scratch code resolves declared locals and schema-qualified members using the existing source model',()=>{
 const project=new LanguageModel();project.update(parseSource('schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\nattributeDefinitions\nname:String[50];\njadeMethodDefinitions\nsetName(value:String);\n)\ntypeSources\n','Fish.cls'));
 const text='vars\n fish : Fish;\nbegin\n fish.na\nend;',model={...parseSource(text,'vscode-notebook-cell:/Pets.jadeworkspace#1'),schema:'Pets',workspace:true};
 const result=project.complete(model,text.indexOf('fish.na')+'fish.na'.length);
 assert.ok(result.items.some(item=>item.name==='name'));
 const signature={...model,text:text.replace('fish.na','fish.setName('),code:text.replace('fish.na','fish.setName(')};
 assert.match(project.signatureHelp(signature,signature.code.indexOf('fish.setName(')+'fish.setName('.length).label,/setName/);
});
