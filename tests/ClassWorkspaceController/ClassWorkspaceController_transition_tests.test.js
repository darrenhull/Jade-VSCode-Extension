'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerClassWorkspaces}=require('../../extension/src/class-workspace-controller');
function fixture({cancel=false,readonly=false,ambiguous=false}={}){
 let provider;const events=[],panels=[],tabs=[],identity={name:'Fish',schema:'Pets',projectId:'file:///project',file:'file:///project/Fish.cls',qualifiedName:'Pets::Fish'};
 const dispose={dispose(){}};class TabInputCustom{constructor(uri){this.uri=uri;this.viewType='jade.classWorkspace';}}
 const uri=value=>({scheme:'file',toString:()=>value});
 const vscode={FilePermission:{Readonly:1},TabInputCustom,Uri:{parse:uri,joinPath:()=>uri('file:///media')},ViewColumn:{Active:-1,Beside:-2},workspace:{fs:{isWritableFileSystem:()=>true,stat:async()=>({permissions:readonly?1:0})}},window:{registerCustomEditorProvider:(_id,value)=>{provider=value;return dispose;},tabGroups:{all:[{viewColumn:1,tabs}],close:async tab=>{events.push('close');if(cancel)return false;for(const panel of panels.filter(value=>value.uri===tab.input.uri.toString()))for(const callback of panel.closed)callback();tabs.splice(tabs.indexOf(tab),1);return true;}}},commands:{executeCommand:async(_command,target)=>{
  events.push('open:'+target.toString());const closed=[],panel={uri:target.toString(),viewColumn:1,active:true,closed,webview:{asWebviewUri:()=>uri('file:///media')},onDidDispose:callback=>{closed.push(callback);return dispose;},reveal(){},dispose(){for(const callback of closed)callback();}};panels.push(panel);tabs.push({input:new TabInputCustom(target)});
  await provider.createView({document:{uri:target},panel,binding:{},services:{}});
 }}};
 const model={resolveClass:async()=>identity,resolveMemberSource:async()=>{events.push('resolve');if(ambiguous)throw Error('Method source ownership is ambiguous');return {identity,member:{id:'extra',owner:'Fish',name:'extra'},file:'file:///project/Fish-extra.cls'};}};
 const selections=[];const controller=registerClassWorkspaces(vscode,{extensionUri:{},subscriptions:[],workspaceState:{get:()=>undefined,update:async()=>{}}},{model,shell:{attach:()=>({prepareSourceSwitch:async()=>{events.push('flush');return true;},select:async id=>selections.push(id),dispose(){},state:()=>({}),setOrigin(){}}),dispose(){}}});
 return {controller,identity,events,tabs,selections};
}
test('moves the same logical class to its actual secondary source only after native close accepts',async()=>{
 const f=fixture();await f.controller.open(f.identity);f.events.length=0;
 const result=await f.controller.openOwningSource(f.identity,'extra');assert.equal(result.opened,true);assert.equal(f.tabs.length,1);assert.equal(f.tabs[0].input.uri.toString(),'file:///project/Fish-extra.cls');assert.deepEqual(f.events,['resolve','flush','close','open:file:///project/Fish-extra.cls']);assert.deepEqual(f.selections,['extra']);
});
test('keeps the current class page and original resource when the native close is cancelled',async()=>{
 const f=fixture({cancel:true});await f.controller.open(f.identity);f.events.length=0;
 const result=await f.controller.openOwningSource(f.identity,'extra');assert.equal(result.cancelled,true);assert.equal(f.tabs.length,1);assert.equal(f.tabs[0].input.uri.toString(),f.identity.file);assert.deepEqual(f.events,['resolve','flush','close']);
});
test('rejects ambiguous or read-only owning source before closing the current page',async()=>{
 for(const options of [{readonly:true},{ambiguous:true}]){const f=fixture(options);await f.controller.open(f.identity);f.events.length=0;await assert.rejects(f.controller.openOwningSource(f.identity,'extra'),/read-only|ambiguous/);assert.equal(f.tabs.length,1);assert.equal(f.events.includes('close'),false);}
});
