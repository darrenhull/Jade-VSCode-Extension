'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerClassWorkspaces}=require('../../extension/src/class-workspace-controller');
const STATE='jade.classWorkspaceContexts.v1';

function fixture(stored=new Map()){
 let provider;const sessions=[],attached=[],d={dispose(){}},uri=value=>({scheme:'file',toString:()=>value});
 const file='file:///project/Shared.cls',source='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object transient;\nBird subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition ( )\nBird completeDefinition ( )\ntypeSources\n';
 const model={resolveClass:async row=>({...row,name:row.name||row.owner,schema:'Pets',projectId:'file:///project',file,qualifiedName:'Pets::'+(row.name||row.owner)})};
 function panel(column){const moved=[],closed=[];return{viewColumn:column,active:true,webview:{asWebviewUri:()=>uri('file:///media')},onDidChangeViewState:callback=>{moved.push(callback);return d;},onDidDispose:callback=>{closed.push(callback);return d;},reveal(){},dispose(){for(const callback of closed)callback();},move(next,active=false){this.viewColumn=next;this.active=active;for(const callback of moved)callback({webviewPanel:this});}};}
 const vscode={Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider:(_type,value)=>{provider=value;return d;}},commands:{executeCommand:async(_command,resource)=>{
  const p=panel(sessions.length+1),session={document:{uri:resource,getText:()=>source},panel:p,binding:{},services:{}};sessions.push(session);await provider.createView(session);
 }}};
 const context={extensionUri:uri('file:///extension'),subscriptions:[],workspaceState:{get:key=>structuredClone(stored.get(key)),update:async(key,value)=>stored.set(key,structuredClone(value))}};
 const shell={attach:session=>{attached.push(session);return{dispose(){},setOrigin(origin){session.origin=origin;},state:()=>({})};},dispose(){}};
 const controller=registerClassWorkspaces(vscode,context,{model,shell});
 async function restore(file,column){const session={document:{uri:uri(file),getText:()=>source},panel:panel(column),binding:{},services:{}};await provider.createView(session);return attached.at(-1);}
 return{controller,sessions,attached,stored,restore,file};
}

test('restores each class in a shared source after moving its inactive tab to another editor group',async()=>{
 const f=fixture();await f.controller.open({name:'Fish'});await f.controller.open({name:'Bird'});
 f.sessions[0].panel.move(3,false);f.controller.dispose();
 const reopened=fixture(f.stored),fish=await reopened.restore(f.file,3),bird=await reopened.restore(f.file,2);
 assert.equal(fish.row.name,'Fish');assert.equal(bird.row.name,'Bird');
 assert.equal(Object.values(f.stored.get(STATE)).find(value=>value.row.name==='Fish').column,3);reopened.controller.dispose();
});

test('ignores temporary undefined and invalid columns without replacing the last valid restore location',async()=>{
 const f=fixture();await f.controller.open({name:'Fish'});f.sessions[0].panel.move(3);
 for(const column of [undefined,0,-1,10,NaN])f.sessions[0].panel.move(column);
 const saved=Object.values(f.stored.get(STATE)).find(value=>value.row.name==='Fish');assert.equal(saved.column,3);f.controller.dispose();
});

test('moving a reused page keeps the latest discovery origin and current-file identity',async()=>{
 const f=fixture();await f.controller.open({name:'Fish'},{origin:{scope:'workspace',filter:{query:'first'}}});
 await f.controller.open({name:'Fish'},{origin:{scope:'workspace',kind:'catalogue',filter:{query:'latest',offset:100},selectedId:'Fish',scrollTop:55}});
 f.sessions[0].panel.move(4,false);
 const saved=Object.values(f.stored.get(STATE))[0];assert.equal(saved.column,4);assert.equal(saved.origin.filter.query,'latest');assert.equal(saved.origin.filter.offset,100);assert.equal(saved.origin.scrollTop,55);assert.equal(saved.row.file,f.file);f.controller.dispose();
});

test('moving a restored current-file class keeps its import identity and discovery state',async()=>{
 const stored=new Map([[STATE,{'fish':{row:{name:'Fish',schema:'Pets',projectId:'file:///project',file:'file:///project/Shared.cls',packageAlias:'ImportedFish'},column:1,origin:{scope:'workspace',filter:{query:'extra'},scrollTop:21}}}]]);
 const f=fixture(stored),page=await f.restore(f.file,1);page.panel.move(3,false);
 const saved=Object.values(stored.get(STATE))[0];assert.equal(saved.column,3);assert.equal(saved.row.file,f.file);assert.equal(saved.row.packageAlias,'ImportedFish');assert.equal(saved.origin.filter.query,'extra');assert.equal(saved.origin.scrollTop,21);f.controller.dispose();
});
