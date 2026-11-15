'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vscode=require('vscode');
const stage=process.env.JADE_PROOF_STAGE,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cases=[{method:'completion',report:{tests_completed:false,cleanup_complete:false,results:[]},message:'Native test method completion was not confirmed (code 2).'}, {method:'cleanup',report:{tests_completed:true,cleanup_complete:false,results:[{method:'cleanup',status:'passed'}]},message:'Native test cleanup was not confirmed for cleanup (code 2).'}, {method:'missingMethod',report:{tests_completed:true,cleanup_complete:true,results:[]},message:'Native test report did not include the selected method missingMethod (code 2).'}];
exports.activate=async context=>{
 fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));
 try{
 const reported=[];const productApi={...vscode,tests:{createTestController(...args){const controller=vscode.tests.createTestController(...args);return new Proxy(controller,{get(target,key){if(key==='createTestRun')return(...runArgs)=>{const run=target.createTestRun(...runArgs);return new Proxy(run,{get(owned,method){if(method==='errored')return(item,message,...rest)=>{reported.push(message.message);return owned.errored(item,message,...rest);};const value=owned[method];return typeof value==='function'?value.bind(owned):value;}});};const value=target[key];return typeof value==='function'?value.bind(target):value;}});}}};
 const manager=require('../src/testing').registerTesting(productApi,context,async(uri,methods)=>({passed:false,code:2,report:cases.find(row=>row.method===methods[0]).report}));
 setTimeout(async()=>{try{
  fs.appendFileSync(path.join(stage,'trace.log'),'opening document\n');const document=await vscode.workspace.openTextDocument(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath,'Probe.cls'));await vscode.window.showTextDocument(document);const checked=[];
  fs.appendFileSync(path.join(stage,'trace.log'),'opening testing view\n');await vscode.commands.executeCommand('workbench.view.testing.focus');fs.appendFileSync(path.join(stage,'trace.log'),'testing view ready\n');
  for(const row of cases){await manager.runFile(document.uri,row.method);assert.ok(reported.includes(row.message),row.message);checked.push({method:row.method,message:row.message});await vscode.commands.executeCommand('testing.showMostRecentOutput');fs.writeFileSync(path.join(stage,row.method+'-ready'),'ready');let finished=false;for(let i=0;i<600;i++){if(fs.existsSync(path.join(stage,row.method+'-release'))){finished=true;break;}await pause(100);}assert.ok(finished,'Screenshot gate timed out');}
  fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify({actualPackagedTestingModule:true,actualVSCodeTestResults:true,controlledNativeResponses:true,nativeDatabaseOpened:false,checked}));await vscode.commands.executeCommand('workbench.action.quit');
 }catch(error){fs.writeFileSync(path.join(stage,'failure.json'),JSON.stringify({error:error.stack}));await vscode.commands.executeCommand('workbench.action.quit');}},200);
 }catch(error){fs.writeFileSync(path.join(stage,'failure.json'),JSON.stringify({error:error.stack}));await vscode.commands.executeCommand('workbench.action.quit');}
};
