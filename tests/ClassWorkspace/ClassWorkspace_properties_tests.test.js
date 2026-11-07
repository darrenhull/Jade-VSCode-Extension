'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClassWorkspaces}=require('../../extension/src/class-workspace');
function fixture(kind='property',foreign=false){
 const sent=[],selected=[],edits=[];let receive,changed;const uri='file:///project/Fish.cls',row={name:'Fish',schema:'Pets',projectId:'file:///project',file:uri};
 const member={id:'field',name:'name',kind,owner:foreign?'Parent':'Fish',file:foreign?'file:///project/Parent.cls':uri,inherited:foreign};
 const snapshot={available:true,owner:'Fish',member:'name',kind,version:1,text:'name: String[50];',uri};
 const binding={select(...args){selected.push(args);return snapshot;},snapshot:()=>snapshot,edit:async value=>{edits.push(value);return snapshot;},onDidChange:callback=>{changed=callback;return{dispose(){}};}};
 const panel={webview:{cspSource:'vscode-resource:',asWebviewUri:value=>value,postMessage:async value=>sent.push(value),onDidReceiveMessage:callback=>{receive=callback;return{dispose(){}};}},onDidDispose:()=>({dispose(){}})};
 const shell=createClassWorkspaces({Uri:{joinPath:()=>''}},{extensionUri:{},workspaceState:{get:()=>undefined,update:async()=>{}}},{load:async()=>({identity:row,groups:[{label:kind==='reference'?'References':'Properties',items:[member]}],total:1}),preview:async()=>({text:'name: String[50];'})});
 shell.attach({panel,document:{uri:{toString:()=>uri}},binding,row});return{sent,selected,edits,member,receive:value=>receive(value),change:value=>changed(value),shell};
}
for(const kind of ['property','reference'])test('edits a current-file '+kind+' through its native declaration binding',async()=>{
 const f=fixture(kind);await f.receive({command:'ready'});await f.receive({command:'select',id:'field'});
 assert.deepEqual(f.selected,[['Fish','name',kind]]);assert.equal(f.sent.find(value=>value.command==='editorSnapshot').snapshot.text,'name: String[50];');
 const edit={owner:'Fish',member:'name',kind,version:1,start:12,end:14,text:'60'};await f.receive({command:'editorEdit',edit});assert.deepEqual(f.edits,[edit]);f.shell.dispose();
});
test('foreign inherited properties remain read-only and never bind the current document',async()=>{
 const f=fixture('property',true);await f.receive({command:'ready'});await f.receive({command:'select',id:'field'});assert.deepEqual(f.selected,[]);assert.equal(f.sent.find(value=>value.command==='editorSnapshot').snapshot.available,false);await f.receive({command:'editorEdit',edit:{owner:'Parent',member:'name',kind:'property'}});assert.deepEqual(f.edits,[]);f.shell.dispose();
});
test('property document updates reach the shared canvas without routing another member kind',async()=>{
 const f=fixture();await f.receive({command:'ready'});await f.receive({command:'select',id:'field'});f.change({available:true,owner:'Fish',member:'name',kind:'property',text:'name: String[60];',version:2});assert.equal(f.sent.at(-1).snapshot.text,'name: String[60];');const count=f.sent.length;f.change({available:true,owner:'Fish',member:'name',kind:'method',text:'name(); begin end;',version:2});assert.equal(f.sent.length,count);f.shell.dispose();
});
