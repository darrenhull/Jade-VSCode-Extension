'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClassWorkspaces}=require('../../extension/src/class-workspace');

function fixture(rejectPost=false){
 let receive,closed,disposed=false,posts=0;
 const panel={title:'Fish',webview:{cspSource:'resource:',asWebviewUri:uri=>uri.toString(),postMessage(){posts++;if(disposed){if(rejectPost)return Promise.reject(Error('Webview is disposed'));throw Error('Webview is disposed');}return Promise.resolve(true);},onDidReceiveMessage(callback){receive=callback;return{dispose(){}};}},onDidDispose(callback){closed=callback;return{dispose(){}};}};
 const context={extensionUri:{toString:()=> 'file:///extension'},workspaceState:{get:()=>({}),update:async()=>{}}},vscode={Uri:{joinPath:()=>({toString:()=> 'file:///media'})}};
 const shell=createClassWorkspaces(vscode,context,{load:async()=>({identity:{qualifiedName:'Pets::Fish'},groups:[],total:0})});
 const view=shell.attach({panel,row:{name:'Fish',schema:'Pets',projectId:'file:///project',file:'file:///project/Fish.cls'}});
 return{shell,view,receive:value=>receive(value),disposeNativeBeforeNotification(){disposed=true;},notifyClosed(){closed();},posts:()=>posts};
}

test('a native webview disposed before its close notification cannot reject a late refresh or selection',async()=>{
 const f=fixture();try{
  await f.receive({command:'ready'});
  f.disposeNativeBeforeNotification();
  await assert.doesNotReject(f.view.refresh());
  await assert.doesNotReject(f.view.select('next'));
  f.notifyClosed();
  const count=f.posts();await f.shell.refresh();assert.equal(f.posts(),count,'retired panels must not receive later refreshes');
 }finally{f.shell.dispose();}
});

test('a rejected disposed-webview post is retired before another refresh',async()=>{
 const f=fixture(true);try{
  await f.receive({command:'ready'});
  f.disposeNativeBeforeNotification();await f.view.select('next');const count=f.posts();
  await f.shell.refresh();await f.view.select('next');assert.equal(f.posts(),count);
 }finally{f.shell.dispose();}
});
