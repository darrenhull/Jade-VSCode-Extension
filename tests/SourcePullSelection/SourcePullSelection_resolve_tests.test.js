"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {resolveSourcePullSelection}=require("../../extension/src/source-pull-selection");
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),"jade-pull-selection-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const uri=fsPath=>({scheme:"file",fsPath,toString:()=>"file:///"+fsPath});const folder={uri:uri(root)},doc={uri:uri(path.join(root,"Fish.cls")),isDirty:false};fs.writeFileSync(doc.uri.fsPath,'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object;\ntypeDefinitions\nFish completeDefinition\n(\n)\ntypeSources\n');const vscode={Uri:{file:uri,parse:value=>uri(value.replace(/^file:\/\/\//,""))},window:{activeTextEditor:{document:doc}},workspace:{workspaceFolders:[folder],getWorkspaceFolder:input=>input.fsPath.startsWith(root)?folder:undefined,openTextDocument:async()=>doc}};return{root,folder,doc,vscode};}
test("current saved CLS supplies schema-qualified identity and same-file target without auto-save",async t=>{
 const f=fixture(t);f.doc.save=()=>assert.fail("Pull must never auto-save local edits");const result=await resolveSourcePullSelection(f.vscode,undefined,()=>({databasePath:"C:/Source/system"}));
 assert.equal(result.destination,f.root);assert.equal(result.selection[0].path,"Fish.cls");assert.equal(result.selection[0].schema,"Pets");assert.equal(result.selection[0].name,"Fish");assert.equal(result.config.databasePath,"C:/Source/system");
 f.doc.isDirty=true;await assert.rejects(resolveSourcePullSelection(f.vscode,undefined,()=>({})),/unsaved|save|discard/i);
});
test("an explicit class row can select a fresh canonical target in an existing source subfolder",async t=>{
 const f=fixture(t);fs.mkdirSync(path.join(f.root,"src"));const result=await resolveSourcePullSelection(f.vscode,{kind:"class",schema:"Pets",name:"Cow",projectRoot:f.root},()=>({extractionDirectory:"src"}));
 assert.equal(result.destination,path.join(f.root,"src"));assert.equal(result.selection[0].path,"schemas/Pets/types/Cow.cls");assert.equal(fs.existsSync(path.join(result.destination,result.selection[0].path)),false);
});
test("a closed explicit project is rejected instead of borrowing the active document",async t=>{
 const f=fixture(t);await assert.rejects(resolveSourcePullSelection(f.vscode,{kind:"class",schema:"Pets",name:"Cow",projectRoot:path.join(f.root,"closed")},()=>({})),/project|workspace/i);
});

test("native top-level interfaceDefs identifies an interface without interpreting comment or literal text",async t=>{
 const f=fixture(t);fs.writeFileSync(f.doc.uri.fsPath,'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\n// Cow subclassOf Object;\ninterfaceDefs\nDocumentInterface number = 1292 (\n)\ninterfaceSources\n');
 const result=await resolveSourcePullSelection(f.vscode,undefined,()=>({}));assert.equal(result.selection[0].kind,"interface");assert.equal(result.selection[0].name,"DocumentInterface");
});
test("a multi-class file is rejected instead of replacing it with one class",async t=>{
 const f=fixture(t);fs.writeFileSync(f.doc.uri.fsPath,'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object;\nCow subclassOf Object;\ntypeDefinitions\nFish completeDefinition\n(\n)\nCow completeDefinition\n(\n)\n');
 await assert.rejects(resolveSourcePullSelection(f.vscode,undefined,()=>({})),/single.class|one saved/i);
});

test("class-view flush reaches backing dirty document before pull checks without saving",async t=>{
 const f=fixture(t);const original=fs.readFileSync(f.doc.uri.fsPath);let flushed=false;f.doc.save=()=>assert.fail("No auto-save");
 await assert.rejects(resolveSourcePullSelection(f.vscode,undefined,()=>({}),{prepareSource:async()=>{flushed=true;f.doc.isDirty=true;return true;}}),/unsaved|save|discard/i);
 assert.equal(flushed,true);assert.ok(fs.readFileSync(f.doc.uri.fsPath).equals(original));
});
