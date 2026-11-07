'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {LanguageModel}=require('../../extension/src/language-model');
const {parseSource}=require('../../extension/src/source_symbols');
const {createClassWorkspaceModel}=require('../../extension/src/class-workspace-model');
function source(schema,name,parent,fields='',methods='') {return `schemaDefinition\n${schema} subschemaOf RootSchema;\ntypeHeaders\n${name} subclassOf ${parent} transient;\ntypeDefinitions\n${name} completeDefinition\n(\nattributeDefinitions\n${fields}\njadeMethodDefinitions\n${methods}\n)\ntypeSources\n`;}
function setup(files) {
 const project=new LanguageModel(),texts=new Map(Object.entries(files));let reads=0;
 for(const [uri,text] of texts)project.update(parseSource(text,uri));
 const vscode={Uri:{parse:uri=>({toString:()=>uri,fsPath:uri.replace('file:///','')})},workspace:{getWorkspaceFolder:uri=>({name:uri.toString().split('/')[3],uri:{toString:()=>uri.toString().split('/').slice(0,4).join('/'),fsPath:uri.toString().split('/')[3]}})}};
 const model=createClassWorkspaceModel({vscode,language:{index:{project,ready:async()=>{},flush:async()=>{}}},readSource:async uri=>{reads++;return {text:texts.get(uri),doc:{version:1,isDirty:false}};}});
 return {model,reads:()=>reads};
}
test('keeps same-schema class definitions in separate projects and refuses an ambiguous lookup',async()=>{
 const {model}=setup({'file:///one/Fish.cls':source('Pets','Fish','Object','name: String;'),'file:///two/Fish.cls':source('Pets','Fish','Object','weight: Integer;')});
 await assert.rejects(model.load({schema:'Pets',name:'Fish'},{}),/project|ambiguous/i);
 const value=await model.load({schema:'Pets',name:'Fish',file:'file:///one/Fish.cls'},{});
 assert.equal(value.identity.qualifiedName,'Pets::Fish');assert.equal(value.groups[0].items[0].name,'name');
});
test('searches and pages all metadata while reading only selected class source',async()=>{
 const fields=Array.from({length:10000},(_,i)=>`p${String(i).padStart(5,'0')}: Integer;`).join('\n');
 const {model,reads}=setup({'file:///one/Fish.cls':source('Pets','Fish','Object',fields),'file:///one/Other.cls':source('Pets','Other','Object')});
 const page=await model.load({schema:'Pets',name:'Fish'},{});assert.equal(page.total,10001);assert.equal(page.groups.flatMap(g=>g.items).length,100);
 const found=await model.load({schema:'Pets',name:'Fish'},{query:'p09999'});assert.equal(found.total,1);assert.equal(found.groups[0].items[0].name,'p09999');assert.equal(reads(),1);
});
test('resolves inherited ownership within the selected project and keeps overrides declared',async()=>{
 const {model}=setup({'file:///one/Base.cls':source('Pets','Base','Object','inherited: String;\nname: String;'),'file:///one/Fish.cls':source('Pets','Fish','Base','name: String;')});
 const value=await model.load({schema:'Pets',name:'Fish'},{includeInherited:true});
 assert.equal(value.inheritedAvailable,true,'known local ancestors remain browsable if the optional root cache is absent');
 const rows=value.groups.flatMap(g=>g.items);assert.equal(rows.filter(r=>r.name==='name').length,1);
 assert.equal(value.overview.superclassIdentity.name,'Base');assert.equal(value.overview.superclassIdentity.file,'file:///one/Base.cls');
 const inherited=rows.find(r=>r.name==='inherited');assert.equal(inherited.inherited,true);assert.equal(inherited.owner,'Base');assert.equal(inherited.file,'file:///one/Base.cls');
});
test('retains a resolved import identity without merging aliases into an unqualified class page',async()=>{
 const {model}=setup({'file:///one/Fish.cls':source('Pets','Fish','Object')});
 const first=await model.resolveClass({schema:'Pets',name:'Fish',file:'file:///one/Fish.cls',importIdentity:'PackageA::Fish',packageAlias:'Goldfish'});
 assert.equal(first.importIdentity,'PackageA::Fish');assert.equal(first.packageAlias,'Goldfish');assert.equal(first.file,'file:///one/Fish.cls');
});
test('keeps the exact secondary partial-file method ownership for explicit original-source navigation',async()=>{
 const primary='file:///one/Fish.cls',secondary='file:///one/Fish-extra.cls';
 const partial='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeDefinitions\nFish partialDefinition\n(\njadeMethodDefinitions\nextra() : String;\n)\ntypeSources\nFish (\njadeMethodSources\nextra\n{\nextra() : String;\nbegin\n return "extra";\nend;\n}\n)';
 const {model}=setup({[primary]:source('Pets','Fish','Object','','extra() : String;'),[secondary]:partial});
 const page=await model.load({name:'Fish',schema:'Pets',file:secondary},{});assert.equal(page.identity.file,primary);
 const member=page.groups.flatMap(group=>group.items).find(member=>member.name==='extra');assert.ok(member);assert.equal(member.file,secondary);
  assert.equal(page.groups.flatMap(group=>group.items).filter(member=>member.name==='extra').length,1,'Declaration metadata and the one real method source must form one navigation row');
 const detail=await model.preview(page.identity,member.id);assert.equal(detail.file,secondary);assert.match(detail.text,/return "extra"/);
  const owning=await model.resolveMemberSource(page.identity,member.id);assert.equal(owning.file,secondary);assert.equal(owning.identity.file,primary);assert.equal(owning.identity.superclass,'Object');
});
