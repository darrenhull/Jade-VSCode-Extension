'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vscode=require('vscode');
exports.activate=async context=>{
 const stage=process.env.JADE_SCRATCH_STAGE,marker=name=>path.join(stage,name),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(name,predicate=()=>fs.existsSync(marker(name)))=>{for(let i=0;i<400;i++){if(predicate())return;await pause(50);}throw Error('Scratch UI marker timed out: '+name);};
 fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));
 const timer=setInterval(()=>{if(fs.existsSync(marker('stop'))){clearInterval(timer);void vscode.commands.executeCommand('workbench.action.quit');}},25);context.subscriptions.push({dispose(){clearInterval(timer);}});
 setTimeout(async()=>{let restore;try{
  const extension=vscode.extensions.getExtension(process.env.JADE_SCRATCH_EXTENSION_ID),api=await extension.activate(),requests=[];let finish,nativeProgress;
  const original=api.nativeTests.request;restore=()=>{api.nativeTests.request=original;};
  api.nativeTests.connect=()=>{throw Error('Native connections are blocked in this controlled UI proof.');};
  api.nativeTests.request=(command,body,onOutput)=>{
   requests.push(command);if(command==='cancel'){finish?.({code:130,passed:false,cancelled:true,report:{executed:false}});return {id:2,promise:Promise.resolve({passed:true})};}
   if(command!=='workspace.run')throw Error('Unexpected native request: '+command);
   nativeProgress=onOutput;return {id:1,promise:new Promise(resolve=>finish=resolve)};
  };
  const folder=vscode.workspace.workspaceFolders[0],file=vscode.Uri.joinPath(folder.uri,'Progress.jadeworkspace');
  const notebook=await vscode.workspace.openNotebookDocument(file),editor=await vscode.window.showNotebookDocument(notebook);
  api.workspaces.controller.updateNotebookAffinity(notebook,vscode.NotebookControllerAffinity.Preferred);
  await vscode.commands.executeCommand('notebook.selectKernel',{notebookEditor:editor,id:api.workspaces.controller.id,extension:extension.id});
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');const cell=notebook.cellAt(0),text=()=>cell.outputs.flatMap(output=>output.items).map(item=>Buffer.from(item.data).toString('utf8')).join('\n');
  const operation=api.workspaces.controller.executeHandler([cell],notebook);await wait('native request',()=>!!finish);
  nativeProgress('[Scratch Pad] Scanning saved project sources ...\n');await wait('visible preparation',()=>text().includes('Scanning saved project sources'));
  assert.doesNotMatch(text(),/Scratch code executed/);fs.writeFileSync(marker('preparation'),'ready');await wait('next-preparation');
  const busy=await vscode.commands.executeCommand('jadeNative.executeLocalTests',vscode.Uri.joinPath(folder.uri,'Worker.cls'),'nativeValue');
  assert.equal(busy.passed,false);assert.match(busy.report.error,/not started/);fs.writeFileSync(marker('busy-test'),'ready');await wait('next-busy-test');
  await vscode.commands.executeCommand('workbench.action.closePanel');await vscode.window.showNotebookDocument(notebook);
  finish({code:0,passed:true,report:{compiled:true,executed:true,output:'42',elapsedMilliseconds:17}});await operation;
  await wait('completion output',()=>text().includes('Scratch code executed')&&text().includes('42'));
  fs.writeFileSync(marker('completed'),'ready');await wait('next-completed');
  assert.deepEqual(requests,['workspace.run']);assert.equal(fs.existsSync(marker('database-never-opened')),false);
  fs.writeFileSync(marker('host-report.json'),JSON.stringify({passed:true,extensionVersion:extension.packageJSON.version,artifact:'unmodified packaged VSIX with separate companion',controlledNativeResult:true,nativeRuntimeExecuted:false,noDatabaseConnection:true,noUserInstallation:true,stagesVisible:true,busyTestNotStarted:true,confirmedExecutedResultVisible:true,nativeRequests:requests}));
 }catch(error){fs.writeFileSync(marker('host-error.txt'),error.stack||error.message);}finally{restore?.();}},500);
};