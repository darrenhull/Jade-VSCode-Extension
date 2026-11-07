'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');let notebook,introNotebook,client;
 try{
  const builtin=vscode.extensions.getExtension('vscode.mermaid-markdown-features');assert.ok(builtin,'VS Code built-in Mermaid extension must be enabled');
  const probe=path.join(root,'NativeSkillProbe.cls');fs.writeFileSync(probe,'schemaDefinition\nSkillPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nSkillProbe subclassOf Object transient;\n');
  const probeDocument=await vscode.workspace.openTextDocument(probe);assert.equal(probeDocument.languageId,'jade-nz');
  const skillFiles=['jade-language/SKILL.md','jade-language/references/language-reference.md','mermaid/SKILL.md','drawio/SKILL.md'];
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
  let image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-markdown-source.png'),Buffer.from(image.data,'base64'));
  await vscode.commands.executeCommand('jadeNative.previewScratchMarkdown',notebook.cellAt(0));assert.equal(notebook.cellAt(0).document.getText(),fenced);
  introNotebook=await vscode.commands.executeCommand('jadeNative.newWorkspace');assert.ok(introNotebook.cellAt(0).document.getText().includes('Jade executes code in the local database.'));assert.ok(introNotebook.cellAt(0).document.getText().includes('Each run starts with fresh variables. Changes your code commits to the local database can remain between runs. After running twice, use **Compare Previous Run** to compare the code and results. Class definitions come from your saved project files.'));
  await new Promise(resolve=>setTimeout(resolve,350));image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},pageSession);fs.writeFileSync(path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-introduction.png'),Buffer.from(image.data,'base64'));
  fs.writeFileSync(report,JSON.stringify({passed:true,builtinMermaid:builtin.id,builtinVersion:builtin.packageJSON.version,realScratchPadMarkdown:true,rawDiagramWrapped:true,nativeEditPreview:true,sourcePreserved:true,renderedSvg:true,localDatabaseIntro:true,projectSkillAutoInstall:true,exactPackagedSkillFiles:skillFiles,markdownToolbar:controls.result?.value,nativeDatabaseExecuted:false,screenshot},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{client?.close();for(const item of [introNotebook,notebook])if(item&&!item.isClosed){await vscode.window.showNotebookDocument(item);await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');}}
}
module.exports={run};
