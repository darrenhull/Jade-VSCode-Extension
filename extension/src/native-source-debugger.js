'use strict';
const fs=require('node:fs'),path=require('node:path');
const {registerDebugger}=require('./debugger');

function cancellationToken(signal){
 return {get isCancellationRequested(){return signal?.aborted===true;},onCancellationRequested(listener){
  if(!signal)return{dispose(){}};const invoke=()=>listener();signal.addEventListener('abort',invoke,{once:true});
  return{dispose:()=>signal.removeEventListener('abort',invoke)};
 }};
}

async function prepareSemanticDebugLaunch(workspace,client,document,output,signal){
 const {project,document:native}=workspace.record(document.uri);
 if(project.provider.flags?.nativeDebug!==true)throw Error('Native debugging is not qualified for this JOX runtime.');
 const token=cancellationToken(signal),synced=await workspace.sync(project,{token,output});
 if(!synced?.passed)throw Error(synced?.report?.error||'Saved JOX changes did not sync to Working.');
 if(signal?.aborted)throw Object.assign(Error('Native debugging cancelled.'),{cancelled:true});
 const working=await client.prepareWorking({...project.provider.config,sourceFormat:'jox',signal},output,{cwd:project.provider.root});
 if(working?.workingMode!=='git-first'||working.sourceDatabasePath!==undefined||!['ansi','unicode'].includes(working.characterSet))
  throw Error('Native debugging requires the accepted Source-free Git-first Working generation and its detected character mode.');
 const projection=native.projection?.cacheUri;
 if(typeof projection!=='string'||!path.isAbsolute(projection))throw Error('Native debugger source projection is unavailable.');
 return {working,config:{...project.provider.config,sourceFormat:'jox',characterSet:working.characterSet,files:[projection]}};
}

function registerNativeSourceDebugger(vscode,context,workspace,client){
 let debugging=false;
 const record=document=>workspace.record(document.uri),debugRoot=path.join(context.extensionPath,'vendor','jade-tools-cli','native');
 return registerDebugger(vscode,context,{
  beforeOperation:()=>workspace.beforeOperation?.(),isBusy:()=>workspace.executing||debugging,setBusy:async value=>{debugging=value;},
  supportsSource:uri=>uri?.scheme==='jade-source',parseSourceUri:value=>vscode.Uri.parse(value),
  resolveSource:uri=>vscode.workspace.openTextDocument(uri),sourcePath:document=>record(document).document.projection.cacheUri,
  config:document=>({...record(document).project.provider.config,sourceFormat:'jox'}),
  prepareLaunch:async(document,selected,output,signal)=>{
   const prepared=await prepareSemanticDebugLaunch(workspace,client,document,text=>output.append(text),signal);
   const typed=path.join(debugRoot,'debugger-abi-'+prepared.working.characterSet+'.json');
   const abi=fs.existsSync(typed)?typed:prepared.working.characterSet==='unicode'?path.join(debugRoot,'debugger-abi.json'):typed;
   if(!fs.existsSync(abi))throw Error('Install a Jade CLI package containing the qualified '+prepared.working.characterSet+' debugger ABI profile.');
   return {...prepared,abi};
  }
 });
}
module.exports={prepareSemanticDebugLaunch,registerNativeSourceDebugger};
