'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {registerClassWorkspaces}=require('../../extension/src/class-workspace-controller');
const {safeContext}=require('../../extension/src/class-workspace-controller');
test('persists source navigation identity without live session or credential metadata',()=>{
 const value=safeContext({row:{name:'Fish',schema:'Pets',projectId:'file:///project',file:'file:///project/Fish.cls',packageAlias:'ImportedPets',password:'secret'},column:1,origin:{scope:'workspace',kind:'quickpick',session:'live',token:'secret',filter:{query:'fish',password:'secret'},selectedId:'Fish',scrollTop:80}});
 assert.equal(value.origin.kind,'quickpick');
 assert.equal(value.row.packageAlias,'ImportedPets');assert.equal(value.origin.filter.query,'fish');assert.equal(value.origin.scrollTop,80);assert.doesNotMatch(JSON.stringify(value),/secret|session|password|token/);
 assert.equal(safeContext({row:{name:'Fish',schema:'Pets',projectId:'file:///project',file:'https://source/Fish.cls'}}),undefined);
});
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
test('explains the no-argument original-source action when no class workspace is open',async()=>{
 const vscode={window:{registerCustomEditorProvider:()=>({dispose(){}})}};
 const controller=registerClassWorkspaces(vscode,{subscriptions:[],workspaceState:{get:()=>({}),update:async()=>{}}},{model:{},shell:{dispose(){}}});await assert.rejects(controller.openOriginal(),/Choose a class workspace/);controller.dispose();
});

test('reopening the same class refreshes its latest discovery origin without another tab',async()=>{
 let provider,opens=0;const origins=[],stored=new Map(),identity={name:'Fish',schema:'Pets',file:'file:///project/Fish.cls',projectId:'file:///project'};
 const disposable={dispose(){}};const panel={viewColumn:1,webview:{asWebviewUri:uri=>uri},onDidDispose:()=>disposable,reveal(){}};
 const vscode={Uri:{parse:s=>({toString:()=>s}),joinPath:()=>({toString:()=>''})},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider:(_name,value)=>{provider=value;return disposable;}},commands:{executeCommand:async()=>{opens++;await provider.createView({document:{uri:{toString:()=>identity.file}},panel,binding:{},services:{}});}}};
 const controller=registerClassWorkspaces(vscode,{extensionUri:{},subscriptions:[],workspaceState:{get:k=>stored.get(k),update:async(k,v)=>stored.set(k,v)}},{model:{resolveClass:async()=>identity},shell:{attach:()=>({setOrigin:origin=>origins.push(origin),dispose(){}}),dispose(){}}});
 await controller.open(identity,{origin:{scope:'workspace',filter:{query:'first'}}});
 await controller.open(identity,{origin:{scope:'workspace',filter:{query:'latest',offset:100}}});
 assert.equal(opens,1);assert.equal(origins[0].filter.query,'latest');
 assert.equal(Object.values(stored.get('jade.classWorkspaceContexts.v1'))[0].origin.filter.query,'latest');controller.dispose();
});
test('prepares all edited class views in the owning project before a workspace operation',async()=>{
 let provider;const flushed=[],disposable={dispose(){}},stored=new Map(),uri=value=>({toString:()=>value});
 const vscode={Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},workspace:{getWorkspaceFolder:resource=>({uri:uri(resource.toString().includes('/other/')?'file:///other':'file:///project')})},window:{registerCustomEditorProvider:(_id,value)=>{provider=value;return disposable;}},commands:{executeCommand:async(_command,resource)=>provider.createView({document:{uri:resource},panel:{active:true,viewColumn:1,webview:{asWebviewUri:uri=>uri},onDidDispose:()=>disposable},binding:{},services:{}})}};
 const controller=registerClassWorkspaces(vscode,{extensionUri:{},subscriptions:[],workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)}},{model:{resolveClass:async row=>({...row,schema:'Pets',file:row.projectId+'/'+row.name+'.cls'})},shell:{attach:session=>({flushPendingEdits:async()=>{flushed.push(session.row.name);return true;},dispose(){},state:()=>({})}),dispose(){}}});
 await controller.open({name:'Fish',projectId:'file:///project'});await controller.open({name:'Bird',projectId:'file:///project'});await controller.open({name:'Other',projectId:'file:///other'});
 await controller.prepareActiveSource(uri('file:///project/Fish.cls'));assert.deepEqual(flushed,['Fish','Bird']);controller.dispose();
});
