'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerWorkspaces}=require('../../extension/src/jade-workspaces');
function uri(value,scheme='file'){return {scheme,fsPath:value,toString:()=>scheme+':'+value};}
function harness(){
 const entries=new Map(),documents=new Map(),state={result:{code:0,passed:true,report:{compiled:true,executed:true,diagnostics:[]}},token:{isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})}};
 const folder={uri:uri('C:/project')},output={append(){},appendLine(){},show(){},dispose(){}},noop=()=>({dispose(){}});
 const vscode={
  window:{activeTextEditor:undefined,createOutputChannel:()=>output,withProgress:(_options,run)=>run({},state.token)},
  languages:{createDiagnosticCollection:()=>({clear:()=>entries.clear(),set:(resource,items)=>entries.set(resource.toString(),items),dispose(){}})},
  EventEmitter:class{constructor(){this.event=()=>{};}fire(){}dispose(){}},
  Range:class{constructor(...args){this.args=args;}},Diagnostic:class{constructor(range,message,severity){Object.assign(this,{range,message,severity});}},DiagnosticSeverity:{Error:0},
  Uri:{parse:value=>uri(value.slice(value.indexOf(':')+1),value.slice(0,value.indexOf(':'))),file:value=>uri(value)},
  notebooks:{createNotebookController:()=>({dispose(){}}),registerNotebookCellStatusBarItemProvider:noop},
  workspace:{getConfiguration:()=>({get:()=>false}),workspaceFolders:[folder],notebookDocuments:[],getWorkspaceFolder:()=>folder,registerNotebookSerializer:noop,registerTextDocumentContentProvider:noop},
  commands:{registerCommand:noop},ProgressLocation:{Notification:1}
 };
 const workspaces=registerWorkspaces(vscode,{subscriptions:[],extension:{id:'test'}},{
  client:{request(){state.requests=(state.requests||0)+1;if(state.transportError)throw Error('Transport unavailable');return {id:1,promise:Promise.resolve(state.result)};}},
  configFor:async()=>{if(state.configError)throw Error('Configuration unavailable');return {schema:'Pets'};},schemaChoices:async()=>[],
  beforeOperation:async()=>{if(state.ownershipError)throw Error('Another operation owns Working');if(state.cancelAfterAcquire)state.token.isCancellationRequested=true;}
 });
 function select(name){if(!documents.has(name))documents.set(name,{uri:uri('C:/project/'+name+'.jade'),languageId:'jade-nz',version:1,getText:()=> 'begin\n write missing;\nend;',positionAt:offset=>({line:0,character:offset})});vscode.window.activeTextEditor={document:documents.get(name)};}
 const run=()=>workspaces.runEditor(false,'Pets');
 async function fail(name='first',code=6027){select(name);state.result={code,passed:false,report:{compiled:false,diagnostics:[{message:'Unknown '+name,source:vscode.window.activeTextEditor.document.uri.toString(),position:13,length:7,compiler_error:code}]}};await run();return entries.get(vscode.window.activeTextEditor.document.uri.toString());}
 return {state,entries,documents,select,run,fail};
}
for(const [name,arrange] of [
 ['pre-request cancellation',h=>{h.state.token.isCancellationRequested=true;}],
 ['cancellation after acquiring ownership',h=>{h.state.cancelAfterAcquire=true;}],
 ['configuration failure',h=>{h.state.configError=true;}],
 ['ownership failure',h=>{h.state.ownershipError=true;}],
 ['transport failure',h=>{h.state.transportError=true;}],
 ['incomplete native response',h=>{h.state.result={passed:false};}],
 ['native cancellation without compilation',h=>{h.state.result={code:130,passed:false,cancelled:true,report:{compiled:false,diagnostics:[]}};}],
 ['native startup failure without compilation',h=>{h.state.result={code:2,passed:false,report:{compiled:false,diagnostics:[],error:'Startup failed'}};}],
 ['timeout without compilation',h=>{h.state.result={code:124,passed:false,timedOut:true,report:{compiled:false,diagnostics:[]}};}],
 ['invalid compilation markers',h=>{h.state.result={code:2,passed:false,report:{compiled:'false',executed:'true',diagnostics:[]}};}]
])test('keeps existing compiler Problems after '+name,async()=>{
 const h=harness(),before=await h.fail();arrange(h);await h.run();assert.deepEqual(h.entries.get('file:C:/project/first.jade'),before);
});
test('new compiler diagnostics replace the same owner and a successful compiler result clears only that owner',async()=>{
 const h=harness();await h.fail('first');const second=await h.fail('second');await h.fail('first',6026);
 assert.equal(h.entries.get('file:C:/project/first.jade')[0].code,6026);
 h.state.result={code:0,passed:true,report:{compiled:true,executed:true,diagnostics:[]}};await h.run();
 assert.equal(h.entries.has('file:C:/project/first.jade'),false);assert.deepEqual(h.entries.get('file:C:/project/second.jade'),second);
});
test('runtime failure after successful compilation retires previous compiler Problems',async()=>{
 const h=harness();await h.fail();h.state.result={code:4001,passed:false,report:{compiled:true,executed:true,diagnostics:[],error:'Runtime failed'}};await h.run();assert.equal(h.entries.size,0);
});
test('cancellation after a real compile still replaces compiler Problems with the new native result',async()=>{
 const h=harness();await h.fail();h.state.result={code:130,passed:false,cancelled:true,report:{compiled:true,executed:true,diagnostics:[]}};await h.run();assert.equal(h.entries.size,0);
 await h.fail();h.state.result={code:130,passed:false,cancelled:true,report:{compiled:false,diagnostics:[{message:'New compile error',position:0,length:1,compiler_error:6026}]}};await h.run();assert.equal(h.entries.get('file:C:/project/first.jade')[0].code,6026);
});
test('a stale result cannot replace Problems owned by a newer source snapshot',async()=>{
 const h=harness(),before=await h.fail();const document=h.documents.get('first');
 h.state.result={code:0,passed:true,report:{compiled:true,executed:true,diagnostics:[]}};
 const oldText=document.getText;document.getText=()=>{const text=oldText();queueMicrotask(()=>document.version++);return text;};
 const result=await h.run();assert.equal(result.stale,true);assert.deepEqual(h.entries.get('file:C:/project/first.jade'),before);
});
