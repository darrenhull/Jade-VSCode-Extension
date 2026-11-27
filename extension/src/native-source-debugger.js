'use strict';
const path=require('node:path'),{fileURLToPath}=require('node:url');
const {registerDebugger}=require('./debugger');

function debugSourceUri(vscode,value){return path.isAbsolute(value)||/^[a-z]:[\\/]/i.test(value)?vscode.Uri.file(value):vscode.Uri.parse(value);}
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

async function resolveNativeDebugDocument(workspace,document,position,signal){
 if(document.uri.scheme!=='file')return workspace.record(document.uri);
 if(!/\.jox$/i.test(document.uri.fsPath||''))throw Error('Open a Jade JOX method source.');
 if(document.isDirty)throw Error('Save the JOX file before starting native debugging.');
 const project=workspace.projectForUri(document.uri);
 await workspace.prepare(project.folder);
 const native=await project.provider.readAtOrigin({originUri:document.uri.toString(),originText:document.getText(),position},cancellationToken(signal));
 return {project,document:native};
}

async function prepareSemanticDebugLaunch(workspace,client,document,output,signal,reportDiagnostic=()=>{},selection){
 const {project,document:native}=selection||workspace.record(document.uri);
 if(project.provider.flags?.nativeDebug!==true)throw Error('Native debugging is not qualified for this JOX runtime.');
 const location=await client.workingLocation({...project.provider.config,cwd:project.provider.root,signal});
 if(typeof location?.identity!=='string'||!location.identity)throw Error('Native Working target identity is unavailable.');
 const expectedWorkingIdentity=location.identity;
 const token=cancellationToken(signal),synced=await workspace.sync(project,{token,output,expectedWorkingIdentity});
 reportDiagnostic(project,synced);
 if(!synced?.passed)throw Error(synced?.report?.error||'Saved JOX changes did not sync to Working.');
 if(signal?.aborted)throw Object.assign(Error('Native debugging cancelled.'),{cancelled:true});
 const working=await client.prepareDebugSession({...project.provider.config,sourceFormat:'jox'},output,{cwd:project.provider.root,signal,expectedWorkingIdentity});
 if(!['git-first','existing'].includes(working?.workingMode)||working.sourceDatabasePath!==undefined||!['ansi','unicode'].includes(working.characterSet))
  throw Error('Native debugging requires the accepted Source-free Working generation and its detected character mode.');
 const projection=projectionPath(native.projection?.cacheUri);
 if(!projection)throw Error('Native debugger source projection is unavailable.');
 const mappings=[...project.files.documents.values()].map(value=>({editor:value.uri.toString(),projection:projectionPath(value.document.projection?.cacheUri)}))
  .filter(value=>value.projection);
 const editorSource=document.uri.scheme==='file'?document.uri.fsPath:document.uri.toString();
 if(!mappings.some(value=>value.editor===editorSource))mappings.push({editor:editorSource,projection,...(document.uri.scheme==='file'?{runs:native.projection.mapping}:{})});
 return {working,debugSession:working,abi:working.abi,sourceMappings:mappings,config:{...project.provider.config,installPath:working.installPath,sourceFormat:'jox',characterSet:working.characterSet,files:[...new Set(mappings.map(value=>value.projection))]}};
}

function registerNativeSourceDebugger(vscode,context,workspace,client,{reportDiagnostic=()=>{},activeDocument}={}){
 if(!vscode.debug?.registerDebugAdapterDescriptorFactory||!vscode.debug?.registerDebugConfigurationProvider)return;
 // VS Code requires this extension to own the debugger contribution before registration.
 if(!context.extension?.packageJSON?.contributes?.debuggers?.some(row=>row.type==='jade-native-experimental'))return;
 let debugging=false,debugProject;
 const records=new WeakMap(),rawDocuments=new Map();
 const record=document=>document.uri.scheme==='file'?records.get(document):workspace.record(document.uri);
 return registerDebugger(vscode,context,{
  beforeOperation:()=>workspace.beforeOperation?.(),isBusy:()=>workspace.executing||debugging,setBusy:async value=>{debugging=value;},
  supportsSource:uri=>uri?.scheme==='jade-source'||uri?.scheme==='file'&&/\.jox$/i.test(uri.fsPath||''),selectedSourceUri:()=>activeDocument?.()?.uri,parseSourceUri:value=>debugSourceUri(vscode,value),
  resolveSource:async (uri,signal)=>{
   const selected=activeDocument?.(uri),document=selected&&(!uri||uri.scheme==='jade-source')?selected:uri?await vscode.workspace.openTextDocument(uri):vscode.window.activeTextEditor?.document;
   if(!document)return;
   const editor=vscode.window.activeTextEditor,position=editor?.document.uri.toString()===document.uri.toString()?editor.selection.active:undefined;
   if(document.uri.scheme==='file'&&!position)throw Error('Place the cursor inside the JOX method to debug.');
   records.set(document,await resolveNativeDebugDocument(workspace,document,position,signal));if(document.uri.scheme==='file')rawDocuments.set(path.resolve(document.uri.fsPath).toLowerCase(),document);return document;
  },sourcePath:document=>record(document).document.projection.cacheUri,
  selectMethod:async(document,methodName)=>selectNativeMethod(record(document).document,document.uri.scheme==='file'?record(document).document.projection.text:document.getText(),methodName),
  resolveDebugSource:async frame=>{
   const row=await workspace.findClass(frame.owner,frame.schema,debugProject?.provider.root);
   if(!row)return;
   const page=await row.project.provider.query({kind:'member',parentId:row.entity.id,search:frame.method,limit:100});
   const method=page.items.find(value=>value.kind==='method'&&value.qualifiedName?.schema===frame.schema&&value.qualifiedName?.type===frame.owner&&value.qualifiedName?.member===frame.method);
   if(!method)return;
   const uri=await row.project.files.open(method.id),binding=row.project.files.binding(uri),rawPath=projectionPath(binding.origin?.uri),raw=rawPath&&rawDocuments.get(path.resolve(rawPath).toLowerCase());
   if(raw&&!raw.isDirty){
    const mapped=await row.project.provider.readAtOrigin({entityId:method.id,originUri:raw.uri.toString(),originText:raw.getText()});
    return{editor:raw.uri.fsPath,projection:projectionPath(mapped.projection.cacheUri),text:mapped.projection.text,runs:mapped.projection.mapping};
   }
   return{editor:uri.toString(),projection:projectionPath(binding.projection.cacheUri),text:binding.projection.text};
  },
  config:document=>({...record(document).project.provider.config,sourceFormat:'jox'}),
  prepareLaunch:async(document,selected,output,signal)=>{
   debugProject=record(document).project;
   const prepared=await prepareSemanticDebugLaunch(workspace,client,document,text=>output.append(text),signal,reportDiagnostic,record(document));
   if(typeof prepared.abi!=='string'||!prepared.abi)throw Error('Native debug preparation returned no admitted ABI profile.');
   return prepared;
  }
 });
}
module.exports={prepareSemanticDebugLaunch,registerNativeSourceDebugger,selectNativeMethod,resolveNativeDebugDocument,debugSourceUri};
