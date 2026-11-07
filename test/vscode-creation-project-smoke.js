'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {scanProject,scaffoldSchema}=require('../src/native-project');
const {createCreationModel}=require('../src/creation-model');
const {writeCreation}=require('../src/creation-files');
const {createDesignerSession,designerHtml}=require('../src/creation-designer');
const {withPrivateDesigner}=require('./creation-ui-capture.cjs');
/** Actual product webview/controller/models/writer; only the asynchronous save boundary is held. */
async function runProjectSwitchProof(vscode,extension,root,{schemaName='CreationDesignerSchema'}={}){
 await vscode.commands.executeCommand('workbench.action.closeAllEditors');
 const secondRoot=path.join(path.dirname(root),'second-project');fs.mkdirSync(secondRoot,{recursive:true});await scaffoldSchema(secondRoot,schemaName,'RootSchema','25.0.02');
 if(!vscode.workspace.workspaceFolders.some(folder=>folder.uri.fsPath===secondRoot)){assert.equal(vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders.length,0,{uri:vscode.Uri.file(secondRoot),name:'Second source project'}),true);}
 const projects=[{id:'first',name:'First source project',root},{id:'second',name:'Second source project',root:secondRoot}],writes=[],gates=[];let held;
 function hold(fail=false){let start,release,done;const gate={fail,started:new Promise(resolve=>start=resolve),waiting:new Promise(resolve=>release=resolve),finished:new Promise(resolve=>done=resolve),start,release,done};held=gate;gates.push(gate);return gate;}
 const panel=vscode.window.createWebviewPanel('jade.creation.project-proof','Create Jade Source',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[vscode.Uri.file(path.join(extension.extensionPath,'media'))]});
 const session=createDesignerSession({projects,post:message=>panel.webview.postMessage(message),modelProvider:async project=>createCreationModel(await scanProject(project.root)),save:async(target,generated,options)=>{const gate=held;held=undefined;if(gate){gate.target=target;gate.start();try{await gate.waiting;if(gate.fail)throw Error('The selected source folder is temporarily unavailable.');}finally{gate.done();}}const result=writeCreation(target,generated,options);writes.push({target,files:result.files});return result;}});
 const listener=panel.webview.onDidReceiveMessage(message=>session.handle(message));
 const asset=name=>panel.webview.asWebviewUri(vscode.Uri.file(path.join(extension.extensionPath,'media',name))).toString();panel.webview.html=designerHtml({nonce:crypto.randomBytes(24).toString('hex'),cspSource:panel.webview.cspSource,asset});
 const file=(directory,name)=>path.join(directory,'schemas',schemaName,'types',name+'.cls');
 try{
  await withPrivateDesigner(Number(process.env.JADE_CREATION_DEBUG_PORT),async designer=>{
   const execute=code=>designer.evaluate(`(async()=>{const $=id=>document.getElementById(id);const input=(id,value)=>{const el=$(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('Project proof timed out: '+predicate.toString()+'; '+$('error').textContent);};${code}})()`);
   await execute(`await wait(()=>$('project').options.length===2&&$('schema').value===${JSON.stringify(schemaName)});if($('project').value!=='first')throw Error('Unexpected initial project');input('name','RaceFailedSave');$('next').click();await wait(()=>!$('save').disabled);return true;`);
   const failed=hold(true);await execute(`$('save').click();return true;`);await failed.started;
   assert.equal(failed.target,root);
   await execute(`if(!$('project').disabled)throw Error('Project must lock before save acknowledgement');$('back').click();$('project').value='second';$('project').dispatchEvent(new Event('change',{bubbles:true}));if($('project').value!=='first'||!$('project').disabled)throw Error('Pending failed save diverged from acknowledged project');return true;`);
   failed.release();await execute(`await wait(()=>!$('project').disabled&&!$('error').hidden);if($('project').value!=='first')throw Error('Failed save lost acknowledged project');return true;`);
   assert.equal(fs.existsSync(file(root,'RaceFailedSave')),false);assert.equal(fs.existsSync(file(secondRoot,'RaceFailedSave')),false);
   await execute(`input('name','RaceSavedInFirst');$('next').click();await wait(()=>!$('save').disabled);return true;`);
   const successful=hold();await execute(`$('save').click();return true;`);await successful.started;assert.equal(successful.target,root);
   await execute(`$('back').click();$('project').value='second';$('project').dispatchEvent(new Event('change',{bubbles:true}));if(!$('project').disabled||$('project').value!=='first')throw Error('Pending successful save diverged from acknowledged project');if(!$('refresh-choices').disabled)throw Error('Refresh must not switch source models during a save');return true;`);
   assert.equal(fs.existsSync(file(root,'RaceSavedInFirst')),false);
   await designer.screenshot(path.join(process.env.JADE_CREATION_SCREENSHOTS,'unified-creation-project-lock.png'));
   successful.release();await execute(`await wait(()=>$('status').textContent.startsWith('Saved ')&&!$('project').disabled);if($('project').value!=='first')throw Error('Save acknowledgement changed the selected project');return true;`);
   assert.ok(fs.existsSync(file(root,'RaceSavedInFirst')));assert.equal(fs.existsSync(file(secondRoot,'RaceSavedInFirst')),false);
   await execute(`$('project').value='second';$('project').dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>$('project').value==='second'&&!$('project').disabled&&$('schema').value===${JSON.stringify(schemaName)});input('name','RaceSavedInSecond');$('next').click();await wait(()=>!$('save').disabled);$('save').click();await wait(()=>$('status').textContent.startsWith('Saved ')&&!$('project').disabled);return true;`);
   assert.equal(fs.existsSync(file(root,'RaceSavedInSecond')),false);assert.ok(fs.existsSync(file(secondRoot,'RaceSavedInSecond')));assert.deepEqual(writes.map(entry=>entry.target),[root,secondRoot]);
  });
  return {passed:true,realProductWebview:true,realSessionAndFileWriter:true,twoOwnedWorkspaceFolders:true,projectLockedThroughPendingSave:true,forcedSwitchRestoresAcknowledgedProject:true,failedSaveUnlocks:true,savedFilesUseAcknowledgedRoot:true,subsequentSwitchUsesSecondRoot:true};
 }finally{for(const gate of gates){gate.fail=true;gate.release();}session.dispose();listener.dispose();panel.dispose();}
}
module.exports={runProjectSwitchProof};
