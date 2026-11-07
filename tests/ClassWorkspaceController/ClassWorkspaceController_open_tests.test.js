'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {registerClassWorkspaces}=require('../../extension/src/class-workspace-controller');
test('registers real-document custom editor and opens resolved source without a projection URI',async()=>{
 const calls=[],subscriptions=[],stored=new Map();
 const vscode={Uri:{parse:s=>({toString:()=>s})},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider:(...args)=>{calls.push(['register',...args]);return {dispose(){}};}},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const identity={name:'Fish',schema:'Pets',file:'file:///project/Fish.cls',projectId:'file:///project'};
 const controller=registerClassWorkspaces(vscode,{subscriptions,workspaceState:{get:k=>stored.get(k),update:async(k,v)=>stored.set(k,v)}},{model:{resolveClass:async()=>identity},shell:{dispose(){}}});
 await controller.open({name:'Fish',schema:'Pets'});
 const open=calls.find(call=>call[0]==='vscode.openWith');assert.equal(open[1].toString(),identity.file);assert.equal(open[2],'jade.classWorkspace');assert.equal(open[3].preview,false);
 assert.equal(calls[0][3].supportsMultipleEditorsPerDocument,true);controller.dispose();
});
test('serializes overlapping requests instead of replacing pending class identities',async()=>{
 let active=0,maximum=0;const calls=[],subscriptions=[];
 const vscode={Uri:{parse:s=>({toString:()=>s})},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider:()=>({dispose(){}})},commands:{executeCommand:async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;calls.push('open');}}};
 const controller=registerClassWorkspaces(vscode,{subscriptions,workspaceState:{get:()=>({}),update:async()=>{}}},{model:{resolveClass:async row=>({...row,file:'file:///shared.cls',projectId:'file:///project'})},shell:{dispose(){}}});
 await Promise.all([controller.open({name:'Fish',schema:'Pets'}),controller.open({name:'Bird',schema:'Pets'})]);
 assert.equal(maximum,1,'Opening one source must complete before reusing its pending context');assert.equal(calls.length,2);controller.dispose();
});
