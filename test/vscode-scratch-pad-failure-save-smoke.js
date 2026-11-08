'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json'),native=process.env.JADE_SCRATCH_PAD_NATIVE_FAILURE==='1';let notebook,client,restore,subscription,nativeResult,api;const events=[];
 try{
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  api=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview').exports;
  const file=path.join(root,'SaveFailure.jadeworkspace');fs.writeFileSync(file,JSON.stringify({version:1,schema:native?'SJetSchema':'Pets',cells:[{kind:'code',source:['begin\n write 1;\nend;']}]}));
  notebook=await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));const notebookEditor=await vscode.window.showNotebookDocument(notebook);api.workspaces.controller.updateNotebookAffinity(notebook,vscode.NotebookControllerAffinity.Preferred);await vscode.commands.executeCommand('notebook.selectKernel',{notebookEditor,id:api.workspaces.controller.id,extension:'jade-local-tools.jade-native-runner-cpp-preview'});
  const cell=notebook.cellAt(0),source='vars\n    secondFloat : Real;\nbegin\n    secondFloat := 2.5;\n    write "Value: " & secondFloat.String();\nend;';
  const edit=new vscode.WorkspaceEdit();edit.replace(cell.document.uri,new vscode.Range(cell.document.positionAt(0),cell.document.positionAt(cell.document.getText().length)),source);assert.equal(await vscode.workspace.applyEdit(edit),true);
  subscription=vscode.workspace.onDidChangeTextDocument(event=>{if(event.document.uri.toString()===cell.document.uri.toString())events.push({contentChanges:event.contentChanges.length,version:event.document.version,dirty:event.document.isDirty});});
  await vscode.workspace.getConfiguration('jadeNative').update('installPath','C:/Jade2025',vscode.ConfigurationTarget.Workspace);
  const original=api.nativeTests.request;restore=()=>{api.nativeTests.request=original;};
  if(!native)api.nativeTests.request=function(command,body,output){if(command!=='workspace.run')return original.call(this,command,body,output);return {id:7056,promise:Promise.resolve({cancelled:false,timedOut:false,code:7056,passed:false,report:{compiled:false,executed:false,error:'Expecting ;',source:body.source,success:false,diagnostics:[{column:43,compiler_error:7056,length:1,line:5,message:'Expecting ;',position:source.indexOf('()'),source:body.source}]}})};};
  nativeResult=await api.workspaces.controller.executeHandler([cell],notebook);assert.equal(nativeResult.code,7056);
  client=await connectPrivateDebugger(Number(process.env.JADE_CLASS_WORKSPACE_DEBUG_PORT));const targets=await client.request('Target.getTargets');const page=targets.targetInfos.find(value=>value.type==='page'&&value.url.startsWith('vscode-file://'));const {sessionId}=await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true});
  const visibleFix=async()=>{const value=await client.request('Runtime.evaluate',{expression:'[...document.querySelectorAll(".cell-status-item-has-command")].some(value=>value.textContent.includes("Fix with Copilot"))',returnByValue:true},sessionId);return value.result?.value;};
  for(let attempt=0;attempt<100&&!await visibleFix();attempt++)await new Promise(resolve=>setTimeout(resolve,30));assert.equal(await visibleFix(),true,'Native-shaped7056 must initially offer Fix');
  assert.equal(await notebook.save(),true);await new Promise(resolve=>setTimeout(resolve,400));assert.equal(cell.document.getText(),source);assert.equal(await visibleFix(),true,'Saving unchanged notebook must retain Fix context: '+JSON.stringify(events));
  const tokenData=await client.request('Runtime.evaluate',{expression:'[...document.querySelectorAll(".monaco-editor .view-line span")].filter(element=>element.textContent?.trim()).map(element=>({text:element.textContent,cls:element.className,color:getComputedStyle(element).color})).slice(0,100)',returnByValue:true},sessionId);
  const screenshot=path.join(process.env.JADE_CLASS_WORKSPACE_SCREENSHOTS,'scratch-pad-fix-after-save.png');const image=await client.request('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(screenshot,Buffer.from(image.data,'base64'));
  fs.writeFileSync(report,JSON.stringify({passed:true,controlledNative7056:!native,nativeTransport:native,sourcePublished:false,savedNotebook:true,fixRetainedAfterSave:true,events,nativeResult,cellLanguage:cell.document.languageId,syntaxTokens:tokenData.result?.value,screenshot},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack,events,nativeResult},null,2));throw error;}
 finally{restore?.();subscription?.dispose();client?.close();if(native&&api)await api.nativeTests.request('shutdown').promise.catch(()=>{});if(notebook&&!notebook.isClosed){await vscode.window.showNotebookDocument(notebook);await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');}}
}
module.exports={run};
