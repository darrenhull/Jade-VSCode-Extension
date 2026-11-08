"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {setup}=require("../../test/fixtures/class-view.cjs");
function manySource(count){return 'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\nattributeDefinitions\n'+Array.from({length:count},(_,index)=>'property'+String(index).padStart(4,'0')+': String[50];').join('\n')+'\n)\ntypeSources\n';}
test("native member groups page all275 declarations within100 rows without rereading source",async()=>{
 const s=setup();try{await s.index.ready();s.first.text=manySource(275);s.first.version++;s.index.document(s.first);
 const schema=(await s.api.provider.getChildren()).find(row=>row.name==='Pets');const cls=(await s.api.provider.getChildren(schema)).find(row=>row.name==='Fish');
 const group=(await s.api.provider.getChildren(cls)).find(row=>row.label==='Properties');let reads=0;const open=s.vscode.workspace.openTextDocument;s.vscode.workspace.openTextDocument=async(...args)=>{reads++;return open(...args);};
 const seen=[];let next;
 do{const rows=await s.api.provider.getChildren(group);assert.ok(rows.length<=100);seen.push(...rows.filter(row=>row.kind==='property').map(row=>row.name));next=rows.find(row=>row.kind==='memberPage'&&row.direction==='next');
 if(next){const command=s.api.provider.getTreeItem(next).command;assert.deepEqual(command.arguments,[group.id,next.offset]);assert.ok(JSON.stringify(command).length<1000);await s.commands.get(command.command)(...command.arguments);}
 }while(next);
 assert.equal(seen.length,275);assert.equal(new Set(seen).size,275);assert.equal(reads,0);
 const previous=(await s.api.provider.getChildren(group)).find(row=>row.kind==='memberPage'&&row.direction==='previous');assert.ok(previous);assert.equal(s.api.provider.getParent(previous),group);
 assert.equal(s.api.provider.getTreeItem((await s.api.provider.getChildren(group)).find(row=>row.kind==='property')).command.command,'jadeNative.previewClassMember');
 const openClass=s.api.provider.getTreeItem(cls).command;assert.equal(openClass.arguments[0].entries,undefined);
 const opened=await s.commands.get(openClass.command)(...openClass.arguments);assert.equal(opened.opened,true);assert.equal(opened.uri,s.first.uri.toString());
 }finally{s.dispose();}
});

test("same named groups keep independent project offsets and reject forged pager targets",async()=>{
 const s=setup();try{
 s.first.text=manySource(275);s.second.text=manySource(275);
 const a={name:"One",uri:s.vscode.Uri.file("/workspace/arbitrary")},b={name:"Two",uri:s.vscode.Uri.file("/workspace/different")};
 s.vscode.workspace.workspaceFolders=[a,b];s.vscode.workspace.getWorkspaceFolder=uri=>uri.fsPath.startsWith(a.uri.fsPath)?a:b;
 const schema=(await s.api.provider.getChildren()).find(row=>row.name==="Pets"),classes=await s.api.provider.getChildren(schema);
 const first=(await s.api.provider.getChildren(classes.find(row=>row.projectName==="One"))).find(row=>row.label==="Properties");
 const second=(await s.api.provider.getChildren(classes.find(row=>row.projectName==="Two"))).find(row=>row.label==="Properties");
 assert.notEqual(first.id,second.id);await s.commands.get("jadeNative.pageSourceMembers")(first.id,98);
 assert.equal((await s.api.provider.getChildren(first)).find(row=>row.kind==="property").name,"property0098");
 assert.equal((await s.api.provider.getChildren(second)).find(row=>row.kind==="property").name,"property0000");
 await s.commands.get("jadeNative.pageSourceMembers")(first.id,99);await s.commands.get("jadeNative.pageSourceMembers")({id:first.id,items:Array(10000)},0);
 assert.equal((await s.api.provider.getChildren(first)).find(row=>row.kind==="property").name,"property0098");
 assert.ok(first.items.length<=98);assert.ok(s.api.provider.getTreeItem(first).description.includes("99–196"));
 }finally{s.dispose();}
});
