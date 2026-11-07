'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {registerClassWorkspaces}=require('../src/class-workspace-controller');
const STATE='jade.classWorkspaceContexts.v1';

async function run(context){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=process.env.JADE_HEADLESS_HOST_REPORT||path.resolve(root,'../host-report.json'),phaseFile=path.join(root,'class-workspace-move-phase.json');
 const file=path.join(root,'SharedMoveClasses.cls'),uri=vscode.Uri.file(file),projectId=vscode.workspace.workspaceFolders[0].uri.toString(),sessions=[];
 assert.ok(context?.workspaceState,'The private development host must provide the real extension memento.');
 const phase=fs.existsSync(phaseFile)?JSON.parse(fs.readFileSync(phaseFile,"utf8")):undefined;
 const restored=Boolean(phase);
 if(!restored)fs.writeFileSync(file,'schemaDefinition\r\nMovePets subschemaOf RootSchema partialDefinition;\r\ntypeHeaders\r\nFish subclassOf Object transient;\r\nBird subclassOf Object transient;\r\ntypeDefinitions\r\nFish completeDefinition ( )\r\nBird completeDefinition ( )\r\ntypeSources\r\n');
 const controller=registerClassWorkspaces(vscode,context,{viewType:'jade.testClassWorkspace',model:{resolveClass:async row=>{
  const name=row.name||row.owner;if(!['Fish','Bird'].includes(name))throw Error('Unknown private move-proof class.');
  return{name,schema:'MovePets',projectId,file:uri.toString(),qualifiedName:'MovePets::'+name};
 }},shell:{attach(session){sessions.push(session);session.panel.webview.html='<!doctype html><html><body><h1>'+session.row.name+'</h1><p>Native moved class restore proof</p></body></html>';return{dispose(){},state:()=>({}),setOrigin(){}};},dispose(){}}});
 async function wait(predicate,label){for(let attempt=0;attempt<200;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Timed out: '+label);}
 const savedClass=name=>Object.values(context.workspaceState.get(STATE)||{}).find(value=>value.row.name===name&&value.row.file===uri.toString());
 try{
  if(!restored){
   await vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:0,groups:[{},{},{}]});
   // Keep the original group present when its class tab moves. Otherwise Code's
   // normal close-empty-groups setting renumbers group three to group two.
   const anchor=path.join(root,'MoveGroupAnchor.txt');fs.writeFileSync(anchor,'Private saved group anchor.');await vscode.window.showTextDocument(vscode.Uri.file(anchor),{viewColumn:vscode.ViewColumn.One,preview:false});
   await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
   await controller.open({name:'Fish',schema:'MovePets',file:uri.toString()},{origin:{scope:'workspace',kind:'catalogue',filter:{query:'fish',offset:100},selectedId:'Fish',scrollTop:31}});
   await wait(()=>sessions.some(value=>value.row.name==='Fish'),'first class tab');
   await controller.open({name:'Bird',schema:'MovePets',file:uri.toString()},{origin:{scope:'workspace',kind:'catalogue',filter:{query:'bird',offset:0},selectedId:'Bird',scrollTop:19}});await wait(()=>sessions.some(value=>value.row.name==='Bird'),'second class sharing the original file');
   const fish=sessions.find(value=>value.row.name==='Fish'),bird=sessions.find(value=>value.row.name==='Bird');assert.equal(fish.panel.viewColumn,1);assert.equal(bird.panel.viewColumn,2);
   fish.panel.reveal(vscode.ViewColumn.One);await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
   await wait(()=>vscode.window.tabGroups.activeTabGroup.viewColumn===1&&vscode.window.tabGroups.activeTabGroup.activeTab?.label==='MovePets::Fish','the Fish tab is active before its native move');
   const commands=await vscode.commands.getCommands(true);
   if(commands.includes('workbench.action.moveEditorToLastGroup'))await vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup');
   else await vscode.commands.executeCommand('moveActiveEditor',{to:'position',by:'group',value:3});
   await wait(()=>fish.panel.viewColumn===3,'native editor movement to group three');await wait(()=>savedClass('Fish')?.column===3,'moved class location persisted');
   assert.equal(savedClass('Bird').column,2);assert.equal(savedClass('Fish').origin.filter.query,'fish');
   await context.workspaceState.update(STATE,context.workspaceState.get(STATE));
   fs.writeFileSync(phaseFile,JSON.stringify({fishColumn:3,birdColumn:2,file:uri.toString()}));
   // The first host is deliberately unloaded by the native reload. Keeping its
   // activation task pending prevents the normal UI harness from quitting early.
   void vscode.commands.executeCommand('workbench.action.reloadWindow');return await new Promise(()=>{});
  }
  if(phase.phase==='closed-sibling'){
   await wait(()=>sessions.some(value=>value.row.name==='Bird'&&value.panel.viewColumn===1),'remaining Bird class restores in the closed Fish group');
   const bird=sessions.find(value=>value.row.name==='Bird'&&value.panel.viewColumn===1);
   assert.equal(sessions.some(value=>value.row.name==='Fish'),false);assert.equal(savedClass('Fish'),undefined);assert.equal(savedClass('Bird').column,1);
   assert.equal(bird.document.uri.toString(),uri.toString());assert.equal(bird.origin.filter.query,'bird');assert.equal(bird.origin.scrollTop,19);
   fs.writeFileSync(report,JSON.stringify({passed:true,nativeMove:true,nativeWindowReload:true,sameFileMultipleClasses:true,fishColumn:3,birdColumn:2,discoveryOriginPreserved:true,sharedNativeTextDocument:true,closedSiblingRestoreRetired:true,remainingClassMovedToClosedColumn:1,remainingClassRestored:'Bird',nativeDatabaseOpened:false},null,2));controller.dispose();return;
  }
  await wait(()=>sessions.some(value=>value.row.name==='Fish'&&value.panel.viewColumn===3)&&sessions.some(value=>value.row.name==='Bird'&&value.panel.viewColumn===2),'native reload restores both same-file class identities in their moved groups');
  const fish=sessions.find(value=>value.row.name==='Fish'&&value.panel.viewColumn===3),bird=sessions.find(value=>value.row.name==='Bird'&&value.panel.viewColumn===2);
  assert.strictEqual(fish.document,bird.document,'Restored classes retain the same native TextDocument');assert.equal(fish.document.uri.toString(),uri.toString());assert.equal(bird.document.uri.toString(),uri.toString());
  assert.equal(fish.origin.filter.query,'fish');assert.equal(fish.origin.filter.offset,100);assert.equal(fish.origin.scrollTop,31);
  const currentTabs=()=>vscode.window.tabGroups.all.flatMap(group=>group.tabs.filter(tab=>tab.input instanceof vscode.TabInputCustom&&tab.input.viewType==='jade.testClassWorkspace').map(tab=>({column:group.viewColumn,label:tab.label})));
  await wait(()=>currentTabs().some(tab=>tab.column===3&&tab.label==='MovePets::Fish')&&currentTabs().some(tab=>tab.column===2&&tab.label==='MovePets::Bird'),'restored tab titles reach the native workbench');
  assert.deepEqual(currentTabs().sort((a,b)=>a.column-b.column),[{column:2,label:'MovePets::Bird'},{column:3,label:'MovePets::Fish'}]);
  fish.panel.reveal(vscode.ViewColumn.Three);await wait(()=>vscode.window.tabGroups.activeTabGroup.activeTab?.label==='MovePets::Fish','Fish active before native close');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await wait(()=>!currentTabs().some(tab=>tab.label==='MovePets::Fish'),'Fish tab actually closed');await wait(()=>savedClass('Fish')===undefined,'closed class restore slot retired');
  bird.panel.reveal(bird.panel.viewColumn);await wait(()=>vscode.window.tabGroups.activeTabGroup.activeTab?.label==='MovePets::Bird','Bird active before move to the closed class group');
  await vscode.commands.executeCommand('moveActiveEditor',{to:'position',by:'group',value:1});await wait(()=>bird.panel.viewColumn===1&&savedClass('Bird')?.column===1,'remaining Bird moved into group one');
  await context.workspaceState.update(STATE,context.workspaceState.get(STATE));fs.writeFileSync(phaseFile,JSON.stringify({phase:'closed-sibling',file:uri.toString()}));
  void vscode.commands.executeCommand('workbench.action.reloadWindow');return await new Promise(()=>{});
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));controller.dispose();throw error;}
}
module.exports={run};
