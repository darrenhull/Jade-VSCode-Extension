'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {registerClassCatalogue}=require('../../extension/src/class-catalogue');
test('restores workspace discovery filter after extension reload without restoring a database session',async()=>{
 const state=new Map(),rows=Array.from({length:250},(_,i)=>({schema:'Pets',name:'Fish'+i}));
 function create(){const vscode={ViewColumn:{Active:-1},Uri:{file:s=>s},window:{createWebviewPanel:()=>({webview:{cspSource:'test',asWebviewUri:s=>s,onDidReceiveMessage:()=>({dispose(){}}),postMessage:async()=>true},onDidDispose:()=>({dispose(){}}),reveal(){},dispose(){}})}};return registerClassCatalogue(vscode,{extensionPath:'C:/extension',subscriptions:[],workspaceState:{get:k=>state.get(k),update:async(k,v)=>state.set(k,v)}},{scope:'workspace',getRows:async()=>rows,openClass:async()=>{}});}
 const first=create();await first.show();await first.setFilter({query:'Fish',schema:'Pets',offset:100});first.dispose();
 const restored=create();await restored.show();assert.deepEqual(restored.snapshot().filter,{query:'Fish',schema:'Pets',offset:100});restored.dispose();
});
