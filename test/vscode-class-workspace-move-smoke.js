'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {registerClassWorkspaces}=require('../src/class-workspace-controller');
const {createClassWorkspaces}=require('../src/class-workspace');
const {withClassWorkspace}=require('./class-workspace-ui-capture.cjs');
const STATE='jade.classWorkspaceContexts.v1';

async function run(context){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=process.env.JADE_HEADLESS_HOST_REPORT||path.resolve(root,'../host-report.json'),phaseFile=path.join(root,'class-workspace-move-phase.json');
 const file=path.join(root,'SharedMoveClasses.cls'),uri=vscode.Uri.file(file),projectId=vscode.workspace.workspaceFolders[0].uri.toString(),sessions=[],splitFlushes=[];
 const splitFile=path.join(root,'NativeSplitFish.cls'),splitUri=vscode.Uri.file(splitFile);
 const splitShell=createClassWorkspaces(vscode,context,{load:async row=>({identity:row,groups:[{label:'Properties',items:[{id:'split-name',name:'name',owner:'SplitFish',kind:'property',file:splitUri.toString(),detail:'name: String[50];'}]}],total:1,offset:0,hasMore:false,inheritedAvailable:false,inheritedReason:'Private split proof has no inherited source.'})});
 assert.ok(context?.workspaceState,'The private development host must provide the real extension memento.');
 const phase=fs.existsSync(phaseFile)?JSON.parse(fs.readFileSync(phaseFile,"utf8")):undefined;
 const restored=Boolean(phase);
 if(!restored)fs.writeFileSync(file,'schemaDefinition\r\nMovePets subschemaOf RootSchema partialDefinition;\r\ntypeHeaders\r\nFish subclassOf Object transient;\r\nBird subclassOf Object transient;\r\ntypeDefinitions\r\nFish completeDefinition ( )\r\nBird completeDefinition ( )\r\ntypeSources\r\n');
 const controller=registerClassWorkspaces(vscode,context,{viewType:'jade.testClassWorkspace',model:{resolveClass:async row=>{
  const name=row.name||row.owner;if(!['Fish','Bird','SplitFish','SplitBird'].includes(name))throw Error('Unknown private move-proof class.');
  return{name,schema:'MovePets',projectId,file:(name.startsWith('Split')?splitUri:uri).toString(),qualifiedName:'MovePets::'+name};
 }},onOriginal:async row=>{const document=await vscode.workspace.openTextDocument(vscode.Uri.parse(row.file));await vscode.window.showTextDocument(document,{preview:false});return{uri:document.uri.toString()};},shell:{attach(session){sessions.push(session);if(session.row.name==='SplitFish'){const view=splitShell.attach(session),flush=view.flushPendingEdits;session.proofViewId=view.viewId;return{...view,flushPendingEdits:async()=>{splitFlushes.push({panel:session.panel,active:session.panel.active,focusedGroup:vscode.window.tabGroups.activeTabGroup.viewColumn});return flush();}};}session.panel.webview.html='<!doctype html><html><body><h1>'+session.row.name+'</h1><p>Native moved class restore proof</p></body></html>';return{dispose(){},state:()=>({}),setOrigin(){}};},dispose(){splitShell.dispose();}}});
 async function wait(predicate,label,details){for(let attempt=0;attempt<200;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Timed out: '+label+(details?' '+JSON.stringify(details()):''));}
 const savedClass=name=>Object.values(context.workspaceState.get(STATE)||{}).find(value=>value.row.name===name&&value.row.file===uri.toString());
 async function verifyNativeSplits(){
  if(phase?.phase!=='split-reload'){
  fs.writeFileSync(splitFile,'schemaDefinition\r\nMovePets subschemaOf RootSchema partialDefinition;\r\ntypeHeaders\r\nSplitFish subclassOf Object transient;\r\nSplitBird subclassOf Object transient;\r\ntypeDefinitions\r\nSplitFish completeDefinition\r\n(\r\nattributeDefinitions\r\nname: String[50];\r\n)\r\nSplitBird completeDefinition ( )\r\ntypeSources\r\n');
  await vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:0,groups:[{},{}]});
  await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
  await controller.open({name:'SplitFish',schema:'MovePets',file:splitUri.toString()},{selectedId:'split-name',origin:{scope:'workspace',kind:'catalogue',filter:{query:'split-fish',offset:20},scrollTop:11}});
  await wait(()=>sessions.some(session=>session.row.name==='SplitFish'),'first actual split proof editor');
  const first=sessions.find(session=>session.row.name==='SplitFish');
  await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{
   await browser.wait('document.getElementById("workspace").getAttribute("aria-busy")==="false"','first split class snapshot');
   await browser.evaluate('document.querySelector("[data-member-id=split-name]").click()');
   await browser.wait('document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true"','first split property editor');
  },{predicate:'document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(first.proofViewId)});
  await vscode.commands.executeCommand('workbench.action.splitEditorRight');
  await wait(()=>sessions.filter(session=>session.row.name==='SplitFish').length===2,'second native split custom editor');
  const second=sessions.filter(session=>session.row.name==='SplitFish')[1];
  assert.notStrictEqual(first.panel,second.panel);assert.strictEqual(first.document,second.document,'Native split editors share their original TextDocument');
  const splitTabs=()=>vscode.window.tabGroups.all.flatMap(group=>group.tabs.filter(tab=>tab.input instanceof vscode.TabInputCustom&&tab.input.viewType==='jade.testClassWorkspace'&&tab.input.uri.toString()===splitUri.toString()).map(tab=>({column:group.viewColumn,label:tab.label})));
  await wait(()=>splitTabs().length===2,'both real class split tabs appear');
  await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{
   await browser.wait('document.getElementById("workspace").getAttribute("aria-busy")==="false"','second split class snapshot');
   await browser.evaluate('document.querySelector("[data-member-id=split-name]").click()');
   await browser.wait('document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true"','second split property editor');
  },{predicate:'document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(second.proofViewId)});
  first.panel.reveal(first.panel.viewColumn);await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');await wait(()=>vscode.window.tabGroups.activeTabGroup.viewColumn===first.panel.viewColumn,'first split group focused before native edit');
  await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{
   await browser.evaluate('document.querySelector(".cm-content").focus()');await browser.key('a',65,2);await browser.type('name: String[51];');
  },{predicate:'document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(first.proofViewId)});
  second.panel.reveal(second.panel.viewColumn);await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');await wait(()=>vscode.window.tabGroups.activeTabGroup.viewColumn===second.panel.viewColumn&&vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputCustom&&vscode.window.tabGroups.activeTabGroup.activeTab.input.uri.toString()===splitUri.toString(),'second native split group focused for preflight',()=>({first:{active:first.panel.active,column:first.panel.viewColumn},second:{active:second.panel.active,column:second.panel.viewColumn},activeGroup:vscode.window.tabGroups.activeTabGroup.viewColumn,activeTab:vscode.window.tabGroups.activeTabGroup.activeTab?.label}));
  splitFlushes.length=0;assert.equal(await controller.prepareActiveSource(splitUri),true);
  assert.deepEqual(splitFlushes.map(value=>value.panel),[first.panel,second.panel],'Source preflight flushes every native same-class split');assert.notEqual(splitFlushes[0].focusedGroup,first.panel.viewColumn,'The original split is outside the focused native editor group');assert.equal(splitFlushes[1].focusedGroup,second.panel.viewColumn);const splitActivity=splitFlushes.map(value=>({panelColumn:value.panel.viewColumn,panelActive:value.active,focusedGroup:value.focusedGroup}));
  assert.ok(first.document.getText().includes('name: String[51];'),'Actual focused property edit reaches original source before source operations');await first.document.save();
  const screenshot=path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'class-workspace-native-splits.png');
  await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{await browser.screenshot(screenshot);},{predicate:'document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(second.proofViewId)});

   const slots=Object.values(context.workspaceState.get(STATE)||{}).filter(value=>value.row.file===splitUri.toString()&&value.row.name==='SplitFish');
   assert.deepEqual(slots.map(value=>value.column).sort(),[first.panel.viewColumn,second.panel.viewColumn].sort(),'Each multi-class split has a separate persisted native column');
   await context.workspaceState.update(STATE,context.workspaceState.get(STATE));
   fs.writeFileSync(phaseFile,JSON.stringify({phase:'split-reload',splitColumns:[first.panel.viewColumn,second.panel.viewColumn],splitEvidence:{nativeSplitCommand:true,sharedOriginalDocument:true,sourcePreflightBothPanels:true,unfocusedOriginalGroupFlushed:true,nativeFocusEvidence:splitActivity,actualPropertyEditSaved:true,screenshot}}));
   void vscode.commands.executeCommand('workbench.action.reloadWindow');return await new Promise(()=>{});
  }
  await wait(()=>sessions.filter(value=>value.row.name==='SplitFish').length===2,'both same-class multi-class-source native splits restored');
  const [first,second]=sessions.filter(value=>value.row.name==='SplitFish').sort((left,right)=>left.panel.viewColumn-right.panel.viewColumn);
  assert.equal(sessions.some(value=>value.row.name==='SplitBird'),false,'A split never changes to its sibling class from the same file');
  assert.deepEqual([first.panel.viewColumn,second.panel.viewColumn],phase.splitColumns.slice().sort());assert.strictEqual(first.document,second.document);
  assert.equal(first.origin.filter.query,'split-fish');assert.equal(second.origin.filter.query,'split-fish');
  const splitTabs=()=>vscode.window.tabGroups.all.flatMap(group=>group.tabs.filter(tab=>tab.input instanceof vscode.TabInputCustom&&tab.input.viewType==='jade.testClassWorkspace'&&tab.input.uri.toString()===splitUri.toString()));
  await wait(()=>splitTabs().length===2,'both restored native split tabs');
  for(const session of [first,second])await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{
   await browser.wait('document.getElementById("workspace").getAttribute("aria-busy")==="false"','restored split class snapshot');
   await browser.evaluate('document.querySelector("[data-member-id=split-name]").click()');await browser.wait('document.querySelector(".cm-content")?.getAttribute("contenteditable")==="true"','restored split property editor');
  },{predicate:'document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(session.proofViewId)});
  second.panel.reveal(second.panel.viewColumn);await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');await wait(()=>vscode.window.tabGroups.activeTabGroup.viewColumn===second.panel.viewColumn,'restored second split focused before close');
  splitFlushes.length=0;assert.equal(await controller.prepareActiveSource(splitUri),true);assert.deepEqual(splitFlushes.map(value=>value.panel),[first.panel,second.panel]);
  const reloadedScreenshot=path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'class-workspace-native-multiclass-splits-restored.png');
  await withClassWorkspace(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT),async browser=>{await browser.screenshot(reloadedScreenshot);},{predicate:'document.getElementById("workspace")?.dataset.viewId==='+JSON.stringify(second.proofViewId)});
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');await wait(()=>second.isClosed()&&splitTabs().length===1,'second split is natively closed');
  splitFlushes.length=0;assert.equal(await controller.prepareActiveSource(splitUri),true);assert.deepEqual(splitFlushes.map(value=>value.panel),[first.panel]);
  const original=await controller.openOriginal();assert.equal(original.uri,splitUri.toString());assert.equal(vscode.window.activeTextEditor?.document.uri.toString(),splitUri.toString(),'Surviving split still opens its actual original source editor');
  assert.equal((await controller.open({name:'SplitFish',schema:'MovePets',file:splitUri.toString()})).reused,true);assert.equal(sessions.filter(session=>session.row.name==='SplitFish').length,2);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');await wait(()=>first.isClosed()&&splitTabs().length===0,'owned final split is closed');
  return{...phase.splitEvidence,multiClassSource:true,bothSplitSlotsPersisted:true,bothNativeSplitsReloaded:true,bothReloadedSplitsFlushed:true,closedSplitPreservesSibling:true,originalSourceAfterClose:true,survivingClassReused:true,reloadedScreenshot};
 }


 try{
  if(!restored||phase.phase==='split-reload'){
   const splitEvidence=await verifyNativeSplits();
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
   fs.writeFileSync(phaseFile,JSON.stringify({fishColumn:3,birdColumn:2,file:uri.toString(),splitEvidence}));
   // The first host is deliberately unloaded by the native reload. Keeping its
   // activation task pending prevents the normal UI harness from quitting early.
   void vscode.commands.executeCommand('workbench.action.reloadWindow');return await new Promise(()=>{});
  }
  if(phase.phase==='closed-sibling'){
   await wait(()=>sessions.some(value=>value.row.name==='Bird'&&value.panel.viewColumn===1),'remaining Bird class restores in the closed Fish group');
   const bird=sessions.find(value=>value.row.name==='Bird'&&value.panel.viewColumn===1);
   assert.equal(sessions.some(value=>value.row.name==='Fish'),false);assert.equal(savedClass('Fish'),undefined);assert.equal(savedClass('Bird').column,1);
   assert.equal(bird.document.uri.toString(),uri.toString());assert.equal(bird.origin.filter.query,'bird');assert.equal(bird.origin.scrollTop,19);
   fs.writeFileSync(report,JSON.stringify({passed:true,nativeMove:true,nativeWindowReload:true,sameFileMultipleClasses:true,fishColumn:3,birdColumn:2,discoveryOriginPreserved:true,sharedNativeTextDocument:true,closedSiblingRestoreRetired:true,remainingClassMovedToClosedColumn:1,remainingClassRestored:'Bird',nativeDatabaseOpened:false,nativeSplits:phase.splitEvidence},null,2));controller.dispose();return;
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
  await context.workspaceState.update(STATE,context.workspaceState.get(STATE));fs.writeFileSync(phaseFile,JSON.stringify({phase:'closed-sibling',file:uri.toString(),splitEvidence:phase.splitEvidence}));
  void vscode.commands.executeCommand('workbench.action.reloadWindow');return await new Promise(()=>{});
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));controller.dispose();throw error;}
}
module.exports={run};
