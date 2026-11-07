'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');let notebook,introNotebook,client,restoreCopilot,restoreRequest;
 try{
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  const builtin=vscode.extensions.getExtension('vscode.mermaid-markdown-features');assert.ok(builtin,'VS Code built-in Mermaid extension must be enabled');
  const probe=path.join(root,'NativeSkillProbe.cls');fs.writeFileSync(probe,'schemaDefinition\nSkillPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nSkillProbe subclassOf Object transient;\n');
  const probeDocument=await vscode.workspace.openTextDocument(probe);assert.equal(probeDocument.languageId,'jade-nz');
  const skillFiles=['jade-language/SKILL.md','jade-language/references/language-reference.md','jade-language/references/cls-format.md','mermaid/SKILL.md','drawio/SKILL.md'];
  for(let attempt=0;attempt<100&&!skillFiles.every(relative=>fs.existsSync(path.join(root,'.github/skills',relative)));attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  for(const relative of skillFiles)assert.deepEqual(fs.readFileSync(path.join(root,'.github/skills',relative)),fs.readFileSync(path.resolve(__dirname,'../skills',relative)),'project skill must match packaged content: '+relative);
  const text='flowchart LR\n A[Source]-->B[Working]';
  notebook=await vscode.workspace.openNotebookDocument('jade-workspace',new vscode.NotebookData([new vscode.NotebookCellData(vscode.NotebookCellKind.Markup,text,'markdown')]));
  await vscode.window.showNotebookDocument(notebook,{selections:[new vscode.NotebookRange(0,1)]});
  await vscode.commands.executeCommand('jadeNative.editScratchMarkdown',notebook.cellAt(0));
  assert.equal(notebook.cellAt(0).document.getText(),text);
  await vscode.commands.executeCommand('jadeNative.insertScratchMermaid',notebook.cellAt(0));
  const fenced='```mermaid\n'+text+'\n```';assert.equal(notebook.cellAt(0).document.getText(),fenced);
  await vscode.commands.executeCommand('jadeNative.editScratchMarkdown',notebook.cellAt(0));
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(),notebook.cellAt(0).document.uri.toString(),'Edit Markdown opens the actual native cell document');
  await vscode.commands.executeCommand('jadeNative.previewScratchMarkdown',notebook.cellAt(0));
  assert.equal(notebook.cellAt(0).document.getText(),fenced,'preview preserves native Markdown source');
  client=await connectPrivateDebugger(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT));let pageSession,found,frames=[];
  for(let attempt=0;attempt<100&&!found;attempt++){
   const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(value=>value.type==='page'&&value.url.startsWith('vscode-file://'));
   if(page&&!pageSession)pageSession=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
   for(const frame of targetInfos.filter(value=>value.type==='iframe')){
    const {sessionId}=await client.request('Target.attachToTarget',{targetId:frame.targetId,flatten:true});const contexts=[];
    const snapshot=await client.request('DOMSnapshot.captureSnapshot',{computedStyles:[]},sessionId);
    if(snapshot.documents.some(document=>document.nodes.nodeName.some(index=>snapshot.strings[index].toLowerCase()==='svg'))&&snapshot.strings.some(value=>value.includes('Source'))&&snapshot.strings.some(value=>value.includes('Working')))found={shadowDomSvg:true};
    const unsubscribe=client.onEvent(event=>{if(event.sessionId===sessionId&&event.method==='Runtime.executionContextCreated')contexts.push(event.params.context.id);});await client.request('Runtime.enable',{},sessionId);unsubscribe();
    for(const contextId of contexts){const result=await client.request('Runtime.evaluate',{expression:'({text:document.body?.innerText?.slice(0,1500),svg:[...document.querySelectorAll("svg")].map(element=>element.textContent)})',contextId,returnByValue:true},sessionId);frames.push(result.result?.value);if(result.result?.value?.svg?.some(value=>value.includes('Source')&&value.includes('Working')))found=result.result.value;}
    await client.request('Target.detachFromTarget',{sessionId});
   }
   if(!found)await new Promise(resolve=>setTimeout(resolve,100));
  }
  const screenshot=path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-mermaid.png');
  await new Promise(resolve=>setTimeout(resolve,700));
  if(pageSession){const value=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(screenshot,Buffer.from(value.data,'base64'));}
  assert.ok(found,'Mermaid SVG not rendered in Markdown preview: '+JSON.stringify(frames.slice(-12)));
  await vscode.commands.executeCommand('jadeNative.editScratchMarkdown',notebook.cellAt(0));await new Promise(resolve=>setTimeout(resolve,250));
  const controls=await client.request('Runtime.evaluate',{expression:'[...document.querySelectorAll(".cell-title-toolbar [aria-label]")].map(element=>element.getAttribute("aria-label"))',returnByValue:true},pageSession);
  async function clickToolbar(label){
   const result=await client.request('Runtime.evaluate',{expression:'(()=>{const element=[...document.querySelectorAll(".cell-title-toolbar [aria-label]")].find(value=>value.getAttribute("aria-label")==='+JSON.stringify(label)+');if(!element)return null;const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',returnByValue:true},pageSession);assert.ok(result.result?.value,'Visible native toolbar action: '+label);
   for(const type of ['mouseMoved','mousePressed','mouseReleased'])await client.request('Input.dispatchMouseEvent',{type,...result.result.value,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},pageSession);
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  await clickToolbar('Run Cells In Section');
  let previewButton=await client.request('Runtime.evaluate',{expression:'[...document.querySelectorAll(".cell-title-toolbar [aria-label]")].some(value=>value.getAttribute("aria-label")==="Jade: Preview Markdown")',returnByValue:true},pageSession);assert.equal(previewButton.result?.value,true,'Native section Play leaves a heading-free Markdown cell in edit mode');
  const toolbarPreview=await client.request('Runtime.evaluate',{expression:'(()=>{const elements=[...document.querySelectorAll("[aria-label]")].filter(value=>!value.closest(".cell-title-toolbar")),element=elements.find(value=>value.getAttribute("aria-label")==="Preview Markdown"||value.getAttribute("aria-label")==="Jade: Preview Markdown");if(!element)return {missing:true,labels:elements.map(value=>value.getAttribute("aria-label")).filter(value=>/preview|markdown/i.test(value))};const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',returnByValue:true},pageSession);assert.ok(toolbarPreview.result?.value&&!toolbarPreview.result.value.missing,'Labelled Preview Markdown is visible in the native notebook toolbar: '+JSON.stringify(toolbarPreview.result?.value));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await client.request('Input.dispatchMouseEvent',{type,...toolbarPreview.result.value,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},pageSession);await new Promise(resolve=>setTimeout(resolve,300));
  const editButton=await client.request('Runtime.evaluate',{expression:'[...document.querySelectorAll(".cell-title-toolbar [aria-label]")].some(value=>value.getAttribute("aria-label")==="Jade: Edit Markdown")',returnByValue:true},pageSession);assert.equal(editButton.result?.value,true,'Actual Preview mouse click switches the native Markdown cell into rendered mode');
  await vscode.commands.executeCommand('jadeNative.editScratchMarkdown',notebook.cellAt(0));
  let image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-markdown-source.png'),Buffer.from(image.data,'base64'));
  await vscode.commands.executeCommand('jadeNative.previewScratchMarkdown',notebook.cellAt(0));assert.equal(notebook.cellAt(0).document.getText(),fenced);
  introNotebook=await vscode.commands.executeCommand('jadeNative.newWorkspace');assert.ok(introNotebook.cellAt(0).document.getText().includes('Jade executes code in the local database.'));assert.ok(introNotebook.cellAt(0).document.getText().includes('Each run starts with fresh variables. Changes your code commits to the local database can remain between runs. After running twice, use **Compare Previous Run** to compare the code and results. Class definitions come from your saved project files.'));
  await new Promise(resolve=>setTimeout(resolve,350));image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-introduction.png'),Buffer.from(image.data,'base64'));
  const {ScratchPadCopilot}=require('../src/ScratchPadCopilot'),nativeEdit=ScratchPadCopilot.prototype.edit,nativeFix=ScratchPadCopilot.prototype.fix,copilotCalls=[],fixCalls=[];
  restoreCopilot=()=>{ScratchPadCopilot.prototype.edit=nativeEdit;ScratchPadCopilot.prototype.fix=nativeFix;};
  ScratchPadCopilot.prototype.edit=function(cell,options){const native=this.vscode;this.vscode={...native,commands:{...native.commands,executeCommand:async(command,...args)=>{if(command==='inlineChat.start'){if(options?.failure){const editor=vscode.window.activeTextEditor;fixCalls.push({uri:editor?.document.uri.toString(),options:args[0],selection:{start:editor.document.offsetAt(editor.selection.start),end:editor.document.offsetAt(editor.selection.end)},selectedText:editor.document.getText(editor.selection)});}else copilotCalls.push({uri:vscode.window.activeTextEditor?.document.uri.toString(),count:cell.notebook.cellCount,text:cell.document.getText()});return;}return native.commands.executeCommand(command,...args);}}};return nativeEdit.call(this,cell,options);};
  const codeCell=introNotebook.cellAt(1),originalCode=codeCell.document.getText(),originalCount=introNotebook.cellCount;
  let copilotButton;
  for(let attempt=0;attempt<100&&!copilotButton;attempt++){const value=await client.request('Runtime.evaluate',{expression:'(()=>{const element=[...document.querySelectorAll(".cell-status-item-has-command")].find(value=>value.textContent.includes("Edit with Copilot"));if(!element)return null;const r=element.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()',returnByValue:true},pageSession);copilotButton=value.result?.value;if(!copilotButton)await new Promise(resolve=>setTimeout(resolve,30));}
  assert.ok(copilotButton,'Visible labelled Edit with Copilot action on the existing code cell');
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await client.request('Input.dispatchMouseEvent',{type,...copilotButton,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},pageSession);
  for(let attempt=0;attempt<100&&!copilotCalls.length;attempt++)await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(copilotCalls,[{uri:codeCell.document.uri.toString(),count:originalCount,text:originalCode}]);assert.equal(introNotebook.cellCount,originalCount);assert.equal(codeCell.document.getText(),originalCode);
  image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-edit-with-copilot.png'),Buffer.from(image.data,'base64'));
  const api=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview').exports,originalRequest=api.nativeTests.request;let externalFailure=false;
  restoreRequest=()=>{api.nativeTests.request=originalRequest;};
  api.nativeTests.request=function(command,body,output){if(command!=='workspace.run')return originalRequest.call(this,command,body,output);return {id:6027,promise:Promise.resolve({passed:false,code:6027,report:{compiled:false,diagnostics:[{source:externalFailure?path.join(root,'Foreign.cls'):codeCell.document.uri.toString(),position:failedSource.indexOf('missingValue'),line:5,column:11,length:12,compiler_error:6027,message:'Unknown identifier'}]}})};};
  await vscode.workspace.getConfiguration('jadeNative').update('installPath','C:/Jade2025',vscode.ConfigurationTarget.Workspace);
  const metadata=new vscode.WorkspaceEdit();metadata.set(introNotebook.uri,[vscode.NotebookEdit.updateNotebookMetadata({schema:'Pets'})]);assert.equal(await vscode.workspace.applyEdit(metadata),true);
  const failedSource='vars\n    petName : String;\nbegin\n    petName := "Bubbles";\n    write missingValue;\nend;';
  const replace=new vscode.WorkspaceEdit();replace.replace(codeCell.document.uri,new vscode.Range(codeCell.document.positionAt(0),codeCell.document.positionAt(codeCell.document.getText().length)),failedSource);assert.equal(await vscode.workspace.applyEdit(replace),true);
  await api.workspaces.controller.executeHandler([codeCell],introNotebook);
  const currentEditor=vscode.window.activeTextEditor;currentEditor.selection=new vscode.Selection(codeCell.document.positionAt(failedSource.indexOf('missingValue')),codeCell.document.positionAt(failedSource.indexOf('missingValue')+12));
  let fixButton;
  for(let attempt=0;attempt<100&&!fixButton;attempt++){const value=await client.request('Runtime.evaluate',{expression:'(()=>{const element=[...document.querySelectorAll(".cell-status-item-has-command")].find(value=>value.textContent.includes("Fix with Copilot"));if(!element)return null;const r=element.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()',returnByValue:true},pageSession);fixButton=value.result?.value;if(!fixButton)await new Promise(resolve=>setTimeout(resolve,30));}
  assert.ok(fixButton,'Failed current cell exposes Fix with Copilot');
  await new Promise(resolve=>setTimeout(resolve,200));image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-fix-with-copilot.png'),Buffer.from(image.data,'base64'));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await client.request('Input.dispatchMouseEvent',{type,...fixButton,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},pageSession);
  for(let attempt=0;attempt<100&&!fixCalls.length;attempt++)await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(fixCalls.length,1);assert.equal(fixCalls[0].uri,codeCell.document.uri.toString());assert.ok(fixCalls[0].options.message.includes(JSON.stringify(failedSource)));assert.match(fixCalls[0].options.message,/6027/);assert.match(fixCalls[0].options.message,/Pets/);assert.equal(fixCalls[0].options.autoSend,false);assert.equal(fixCalls[0].options.attachDiagnostics,false);assert.equal(codeCell.document.getText(),failedSource);assert.equal(introNotebook.cellCount,originalCount);
  assert.deepEqual(fixCalls[0].selection,{start:0,end:failedSource.length},'Fix must replace the entire existing cell even when only the failing identifier was selected');assert.equal(fixCalls[0].selectedText,failedSource);
  await new Promise(resolve=>setTimeout(resolve,150));image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-fix-whole-cell.png'),Buffer.from(image.data,'base64'));
  const repairedSource=failedSource.replace('missingValue','petName');
  async function acceptSelectedReplacement(minimal=false){const editor=vscode.window.activeTextEditor,at=failedSource.indexOf('missingValue');assert.equal(await editor.edit(builder=>builder.replace(minimal?new vscode.Range(codeCell.document.positionAt(at),codeCell.document.positionAt(at+12)):editor.selection,minimal?'petName':repairedSource),{undoStopBefore:true,undoStopAfter:true}),true);assert.equal(codeCell.document.getText(),repairedSource);assert.equal(introNotebook.cellCount,originalCount);assert.equal((codeCell.document.getText().match(/\bbegin\b/g)||[]).length,1);assert.equal((codeCell.document.getText().match(/\bend;/g)||[]).length,1);await vscode.commands.executeCommand('notebook.cell.edit');await vscode.commands.executeCommand('undo');for(let attempt=0;attempt<100&&codeCell.document.getText()!==failedSource;attempt++)await new Promise(resolve=>setTimeout(resolve,30));assert.equal(codeCell.document.getText(),failedSource,'Native Undo restores exactly one original cell body');}
  await acceptSelectedReplacement();
  await api.workspaces.controller.executeHandler([codeCell],introNotebook);vscode.window.activeTextEditor.selection=new vscode.Selection(codeCell.document.positionAt(failedSource.length),codeCell.document.positionAt(failedSource.length));
  await vscode.commands.executeCommand('jadeNative.fixScratchPadWithCopilot',codeCell);assert.equal(fixCalls.length,2);assert.deepEqual(fixCalls[1].selection,{start:0,end:failedSource.length},'A repeated Fix at an end-of-cell caret must select replacement rather than append');await acceptSelectedReplacement(true);
  const changed=new vscode.WorkspaceEdit();changed.insert(codeCell.document.uri,codeCell.document.positionAt(failedSource.length),'\n');await vscode.workspace.applyEdit(changed);const stale=await vscode.commands.executeCommand('jadeNative.fixScratchPadWithCopilot',codeCell);assert.equal(stale.passed,false);assert.equal(fixCalls.length,2);
  externalFailure=true;await api.workspaces.controller.executeHandler([codeCell],introNotebook);const foreign=await vscode.commands.executeCommand('jadeNative.fixScratchPadWithCopilot',codeCell);assert.equal(foreign.passed,false);assert.equal(fixCalls.length,2);
  controls.fixEvidence={actualMouseFix:true,exactWholeCellWithPartialSelection:true,wholeCellSelectionFromPartialAndCaret:true,controlledNativeReplacement:true,controlledMinimalLineEdit:true,singleBodyAfterRepeatedFix:true,nativeUndoRestoresOriginal:true,nativeErrorAndSchema:true,autoSend:false,attachDiagnostics:false,staleFixRejected:true,foreignPreparationFixRejected:true,nativeAIRequestExecuted:false};
  fs.writeFileSync(report,JSON.stringify({passed:true,builtinMermaid:builtin.id,builtinVersion:builtin.packageJSON.version,realScratchPadMarkdown:true,rawDiagramWrapped:true,nativeEditPreview:true,actualMousePreview:true,nativeSectionPlayNoHeadingNoOp:true,sourcePreserved:true,renderedSvg:true,localDatabaseIntro:true,projectSkillAutoInstall:true,exactPackagedSkillFiles:skillFiles,visibleCopilotEdit:true,actualMouseCopilot:true,copilotOriginalCellFocused:true,copilotCellCountUnchanged:true,copilotTextUnchanged:true,inlineChatOnlyStubbed:true,fixWithCopilot:controls.fixEvidence,controlledNativeError6027:true,markdownToolbar:controls.result?.value,nativeDatabaseExecuted:false,screenshot},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{restoreRequest?.();restoreCopilot?.();client?.close();for(const item of [introNotebook,notebook])if(item&&!item.isClosed){await vscode.window.showNotebookDocument(item);await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');}}
}
module.exports={run};
