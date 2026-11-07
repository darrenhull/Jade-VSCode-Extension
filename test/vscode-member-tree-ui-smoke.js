"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto"),vscode=require("vscode");
const {registerClassView}=require("../src/class-view"),{SourceIndex}=require("../src/workspace-index");
const {connectPrivateDebugger}=require("./creation-ui-capture.cjs");
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,"../host-report.json"),captures=process.env.JADE_OBJECT_WORKSPACE_SCREENSHOTS,subscriptions=[],stored=new Map();
 const file=path.join(root,"NativeTreeFish.cls"),uri=vscode.Uri.file(file);
 const text='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\nattributeDefinitions\n'+Array.from({length:275},(_,index)=>'property'+String(index).padStart(4,'0')+': String[50];').join('\n')+'\n)\ntypeSources\n';
 fs.writeFileSync(file,text);let reads=0;
 const index=new SourceIndex({list:async()=>[uri.toString()],read:async()=>{reads++;return text;}});
 const host={...vscode,window:Object.assign(Object.create(vscode.window),{createTreeView:(_id,options)=>vscode.window.createTreeView("jade.testInspectionInstances",options)})};
 const context={subscriptions,extensionPath:path.resolve(__dirname,".."),extensionUri:vscode.Uri.file(path.resolve(__dirname,"..")),workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)}};
 let client;
 try{
  const api=registerClassView(host,context,{index});
  const schema=(await api.provider.getChildren()).find(row=>row.name==="Pets"),cls=(await api.provider.getChildren(schema)).find(row=>row.name==="Fish");
  const group=(await api.provider.getChildren(cls)).find(row=>row.label==="Properties");
  const editor=await vscode.window.showTextDocument(uri,{preview:false});
  await api.view.reveal(group,{select:true,focus:true,expand:true});
  client=await connectPrivateDebugger(Number(process.env.JADE_OBJECT_WORKSPACE_DEBUG_PORT));
  const targets=await client.request("Target.getTargets"),page=targets.targetInfos.find(target=>target.type==="page"&&target.url.startsWith("vscode-file://"));assert.ok(page);
  const session=(await client.request("Target.attachToTarget",{targetId:page.targetId,flatten:true})).sessionId;
  const evaluate=async expression=>(await client.request("Runtime.evaluate",{expression,returnByValue:true},session)).result.value;
  const wait=async expression=>{for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error("Native member tree did not render: "+expression);};
  const capture=async name=>{const image=await client.request("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},session);fs.mkdirSync(captures,{recursive:true});fs.writeFileSync(path.join(captures,name),Buffer.from(image.data,"base64"));};
  let rows=await api.provider.getChildren(group),next=rows.find(row=>row.kind==="memberPage"&&row.direction==="next");
  assert.equal(rows.filter(row=>row.kind==="property").length,98);assert.ok(rows.length<=100);
  await api.view.reveal(next,{select:true,focus:true});
  await wait('document.body.innerText.includes("Next98members")||document.body.innerText.includes("Next 98 members")');
  await capture("native-member-tree-first.png");
  const beforeReads=reads,command=api.provider.getTreeItem(next).command;assert.deepEqual(command.arguments,[group.id,98]);
  await vscode.commands.executeCommand(command.command,...command.arguments);
  rows=await api.provider.getChildren(group);assert.equal(rows.length,100);assert.equal(rows.find(row=>row.kind==="property").name,"property0098");
  await api.view.reveal(rows.find(row=>row.kind==="memberPage"&&row.direction==="previous"),{select:true,focus:true});
  await wait('document.body.innerText.includes("property0098")');
  await capture("native-member-tree-middle.png");
  const last=api.provider.getTreeItem(rows.find(row=>row.kind==="memberPage"&&row.direction==="next")).command;
  await vscode.commands.executeCommand(last.command,...last.arguments);rows=await api.provider.getChildren(group);
  assert.equal(rows.filter(row=>row.kind==="property").length,79);assert.ok(rows.length<=100);assert.equal(reads,beforeReads);
  await api.view.reveal(rows.at(-1),{select:true,focus:true});await wait('document.body.innerText.includes("property0274")');await capture("native-member-tree-last.png");
  assert.equal(editor.document.isDirty,false);
  const artifact=process.env.JADE_OBJECT_WORKSPACE_VSIX?{name:path.basename(process.env.JADE_OBJECT_WORKSPACE_VSIX),sha256:crypto.createHash("sha256").update(fs.readFileSync(process.env.JADE_OBJECT_WORKSPACE_VSIX)).digest("hex")}:undefined;
  fs.writeFileSync(report,JSON.stringify({passed:true,artifact,members:275,dataPageLimit:98,totalRowLimit:100,pageCounts:[99,100,80],nativeTreeRendered:true,nextPrevious:true,pagerArguments:"groupId + offset only",sourceReadsWhilePaging:reads-beforeReads,nativeDatabaseOpened:false,screenshots:["native-member-tree-first.png","native-member-tree-middle.png","native-member-tree-last.png"]},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{client?.close();for(const item of subscriptions.reverse())item.dispose?.();index.dispose();}
}
module.exports={run};
