'use strict';
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath}=require('node:url');
const {registerDebugger}=require('./debugger');

function projectionPath(value){
 if(typeof value!=='string')return;
 try{return value.startsWith('file:')?fileURLToPath(value):path.isAbsolute(value)?value:undefined;}catch{return;}
}
function selectNativeMethod(native,text,methodName){
 const entity=native.entity,qualified=entity?.qualifiedName;
 if(entity?.id!==native.entityId||entity.kind!=='method'||typeof qualified?.schema!=='string'||typeof qualified?.type!=='string'||typeof qualified?.member!=='string')
  throw Error('Open a native Jade method member before starting the debugger.');
 if(methodName&&methodName!==qualified.member)throw Error('The selected method does not match this native member.');
 if(entity.flags?.typeMethod===true)throw Error('The selected method must be concrete, non-static and parameterless.');
 const escaped=qualified.member.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const match=new RegExp('(?:^|\\n)\\s*'+escaped+'\\s*\\(([^)]*)\\)','i').exec(text);
 if(!match||match[1].trim()||!/(?:^|\n)\s*begin\b/i.test(text))throw Error('The selected method must be concrete, non-static and parameterless.');
 return{schema:qualified.schema,owner:qualified.type,name:qualified.member,file:projectionPath(native.projection.cacheUri),unitTest:entity.flags?.unitTest===true,start:0,end:text.length,selection:match.index,line:1,body:text};
}

function cancellationToken(signal){
 return {get isCancellationRequested(){return signal?.aborted===true;},onCancellationRequested(listener){
  if(!signal)return{dispose(){}};const invoke=()=>listener();signal.addEventListener('abort',invoke,{once:true});
  return{dispose:()=>signal.removeEventListener('abort',invoke)};
 }};
}

async function prepareSemanticDebugLaunch(workspace,client,document,output,signal,reportDiagnostic=()=>{}){
 const {project,document:native}=workspace.record(document.uri);
 if(project.provider.flags?.nativeDebug!==true)throw Error('Native debugging is not qualified for this JOX runtime.');
 const token=cancellationToken(signal),synced=await workspace.sync(project,{token,output});
 reportDiagnostic(project,synced);
 if(!synced?.passed)throw Error(synced?.report?.error||'Saved JOX changes did not sync to Working.');
 if(signal?.aborted)throw Object.assign(Error('Native debugging cancelled.'),{cancelled:true});
 const working=await client.prepareWorking({...project.provider.config,sourceFormat:'jox'},output,{cwd:project.provider.root,signal});
 if(working?.workingMode!=='git-first'||working.sourceDatabasePath!==undefined||!['ansi','unicode'].includes(working.characterSet))
  throw Error('Native debugging requires the accepted Source-free Git-first Working generation and its detected character mode.');
 const projection=projectionPath(native.projection?.cacheUri);
 if(!projection)throw Error('Native debugger source projection is unavailable.');
 const mappings=[...project.files.documents.values()].map(value=>({editor:value.uri.toString(),projection:projectionPath(value.document.projection?.cacheUri)}))
  .filter(value=>value.projection);
 if(!mappings.some(value=>value.editor===document.uri.toString()))mappings.push({editor:document.uri.toString(),projection});
 return {working,sourceMappings:mappings,config:{...project.provider.config,installPath:working.installPath,sourceFormat:'jox',characterSet:working.characterSet,files:[...new Set(mappings.map(value=>value.projection))]}};
}

function registerNativeSourceDebugger(vscode,context,workspace,client,{reportDiagnostic=()=>{}}={}){
 if(!vscode.debug?.registerDebugAdapterDescriptorFactory||!vscode.debug?.registerDebugConfigurationProvider)return;
 // VS Code requires this extension to own the debugger contribution before registration.
 if(!context.extension?.packageJSON?.contributes?.debuggers?.some(row=>row.type==='jade-native-experimental'))return;
 let debugging=false;
 const record=document=>workspace.record(document.uri),debugRoot=path.join(context.extensionPath,'vendor','jade-tools-cli','native');
 return registerDebugger(vscode,context,{
  beforeOperation:()=>workspace.beforeOperation?.(),isBusy:()=>workspace.executing||debugging,setBusy:async value=>{debugging=value;},
  supportsSource:uri=>uri?.scheme==='jade-source',parseSourceUri:value=>vscode.Uri.parse(value),
  resolveSource:uri=>uri?vscode.workspace.openTextDocument(uri):vscode.window.activeTextEditor?.document,sourcePath:document=>record(document).document.projection.cacheUri,
  selectMethod:async(document,methodName)=>selectNativeMethod(record(document).document,document.getText(),methodName),
  resolveDebugSource:async frame=>{
   const row=await workspace.findClass(frame.owner,frame.schema);
   if(!row)return;
   const uri=await row.project.files.open(row.entity.id),binding=row.project.files.binding(uri);
   return{editor:uri.toString(),projection:binding.projection.cacheUri,text:binding.projection.text};
  },
  config:document=>({...record(document).project.provider.config,sourceFormat:'jox'}),
  prepareLaunch:async(document,selected,output,signal)=>{
   const prepared=await prepareSemanticDebugLaunch(workspace,client,document,text=>output.append(text),signal,reportDiagnostic);
   const typed=path.join(debugRoot,'debugger-abi-'+prepared.working.characterSet+'.json');
   const abi=fs.existsSync(typed)?typed:prepared.working.characterSet==='unicode'?path.join(debugRoot,'debugger-abi.json'):typed;
   if(!fs.existsSync(abi))throw Error('Install a Jade CLI package containing the qualified '+prepared.working.characterSet+' debugger ABI profile.');
   return {...prepared,abi};
  }
 });
}
module.exports={prepareSemanticDebugLaunch,registerNativeSourceDebugger,selectNativeMethod};
