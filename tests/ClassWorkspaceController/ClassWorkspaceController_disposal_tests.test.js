'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerClassWorkspaces}=require('../../extension/src/class-workspace-controller');
const {createClassWorkspaces}=require('../../extension/src/class-workspace');

test('reopening a class retires a native-disposed panel even before its disposal event arrives',async()=>{
 let provider,retired=0;const panels=[],disposable={dispose(){}},uri=value=>({toString:()=>value}),identity={name:'Fish',schema:'Pets',projectId:'file:///project',file:'file:///project/Fish.cls'};
 const vscode={Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider(_name,value){provider=value;return disposable;}},commands:{async executeCommand(_command,resource){
  const panel={viewColumn:1,webview:{asWebviewUri:uri=>uri},onDidDispose:()=>disposable,reveal(){if(this.nativeDisposed)throw Error('Webview is disposed');}};panels.push(panel);
  await provider.createView({document:{uri:resource},panel,binding:{},services:{}});
 }}};
 const context={extensionUri:uri('file:///extension'),subscriptions:[],workspaceState:{get:()=>({}),update:async()=>{}}};
 const controller=registerClassWorkspaces(vscode,context,{model:{resolveClass:async()=>identity},shell:{attach:()=>({dispose(){retired++;},setOrigin(){}}),dispose(){}}});
 try{
  await controller.open(identity);panels[0].nativeDisposed=true;
  const reopened=await controller.open(identity);assert.equal(reopened.reused,false);assert.equal(panels.length,2);assert.equal(retired,1);
  const reused=await controller.open(identity);assert.equal(reused.reused,true);assert.equal(panels.length,2);
 }finally{controller.dispose();}
});
for(const failureAt of ['active','flush'])test('F5 preparation retires disposed '+failureAt+' view but still flushes the live project canvas',async()=>{
 let provider;const panels=[],flushed=[],retired=[],disposable={dispose(){}},uri=value=>({toString:()=>value});
 const vscode={Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},workspace:{getWorkspaceFolder:()=>({uri:uri('file:///project')})},window:{registerCustomEditorProvider(_name,value){provider=value;return disposable;}},commands:{async executeCommand(_command,resource){const panel={viewColumn:1,webview:{asWebviewUri:uri=>uri},onDidDispose:()=>disposable,get active(){if(this.nativeDisposed&&failureAt==='active')throw Error('Webview is disposed');return !this.nativeDisposed;}};panels.push(panel);await provider.createView({document:{uri:resource},panel,binding:{snapshot:()=>({available:true})},services:{}});}}};
 const controller=registerClassWorkspaces(vscode,{extensionUri:uri('file:///extension'),subscriptions:[],workspaceState:{get:()=>({}),update:async()=>{}}},{model:{resolveClass:async row=>({...row,schema:'Pets',projectId:'file:///project',file:'file:///project/'+row.name+'.cls'})},shell:{attach:session=>({flushPendingEdits:async()=>{if(session.panel.nativeDisposed)throw Error('Webview is disposed');flushed.push(session.row.name);return true;},dispose(){retired.push(session.row.name);}}),dispose(){}}});
 try{await controller.open({name:'Fish'});await controller.open({name:'Bird'});panels[0].nativeDisposed=true;assert.equal(await controller.prepareActiveSource(uri('file:///project/Bird.cls')),true);assert.deepEqual(flushed,['Bird']);assert.deepEqual(retired,['Fish']);await controller.prepareActiveSource(uri('file:///project/Bird.cls'));assert.deepEqual(flushed,['Bird','Bird']);}finally{controller.dispose();}
});
test('F5 preparation preserves genuine live editing failures instead of silently compiling stale input',async()=>{
 let provider;const disposable={dispose(){}},uri=value=>({toString:()=>value});
 const vscode={Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider(_name,value){provider=value;return disposable;}},commands:{async executeCommand(_command,resource){await provider.createView({document:{uri:resource},panel:{active:true,viewColumn:1,webview:{asWebviewUri:uri=>uri},onDidDispose:()=>disposable},binding:{},services:{}});}}};
 const controller=registerClassWorkspaces(vscode,{extensionUri:uri('file:///extension'),subscriptions:[],workspaceState:{get:()=>({}),update:async()=>{}}},{model:{resolveClass:async row=>({...row,schema:'Pets',projectId:'file:///project',file:'file:///project/Fish.cls'})},shell:{attach:()=>({flushPendingEdits:async()=>{throw Error('Draft persistence failed');},dispose(){}}),dispose(){}}});
 try{await controller.open({name:'Fish'});await assert.rejects(controller.prepareActiveSource(uri('file:///project/Fish.cls')),/Draft persistence failed/);}finally{controller.dispose();}
});
test('F5 continues after the actual shell closes during its pending-edit handshake and still flushes live canvases',async()=>{
 let provider;const flushed=[],disposable={dispose(){}},uri=value=>({toString:()=>value}),context={extensionUri:uri('file:///extension'),subscriptions:[],workspaceState:{get:()=>({}),update:async()=>{}}};
 const vscode={Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},workspace:{getWorkspaceFolder:()=>({uri:uri('file:///project')})},window:{registerCustomEditorProvider(_name,value){provider=value;return disposable;}},commands:{async executeCommand(_command,resource){
  let receive;const name=resource.toString().includes('Fish')?'Fish':'Bird';
  const panel={active:true,viewColumn:1,webview:{cspSource:'resource:',asWebviewUri:uri=>uri,onDidReceiveMessage(callback){receive=callback;return disposable;},async postMessage(message){if(message.command==='flushPendingEdits'){if(name==='Fish')throw Error('Webview is disposed');flushed.push(name);setImmediate(()=>receive({command:'pendingEditsReady',requestId:message.requestId,ok:true}));}return true;}},onDidDispose:()=>disposable};
  await provider.createView({document:{uri:resource},panel,binding:{},services:{}});await receive({command:'ready'});
 }}};
 const shell=createClassWorkspaces(vscode,context,{load:async row=>({identity:row,groups:[],total:0})});
 const controller=registerClassWorkspaces(vscode,context,{model:{resolveClass:async row=>({...row,schema:'Pets',projectId:'file:///project',file:'file:///project/'+row.name+'.cls'})},shell});
 try{await controller.open({name:'Fish'});await controller.open({name:'Bird'});assert.equal(await controller.prepareActiveSource(uri('file:///project/Bird.cls')),true);assert.deepEqual(flushed,['Bird']);assert.equal(await controller.prepareActiveSource(uri('file:///project/Bird.cls')),true);assert.deepEqual(flushed,['Bird','Bird']);}finally{controller.dispose();}
});
