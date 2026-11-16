'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,fixture}=require('../../test/fixtures/class-view.cjs');
const {memberId}=require('../../extension/src/class-workspace-model');
const {parseSource}=require('../../extension/src/source_symbols');
async function selected(t,{schema='ExampleSchema',readonly=false}={}){
 const s=setup();t.after(()=>s.dispose());s.first.text=fixture('ExampleSchema','Sample','one');s.second.text=fixture('OtherSchema','Sample','two');
 s.first.isDirty=true;s.first.languageId='jade-nz';s.second.languageId='jade-nz';let saves=0;s.first.save=async()=>{saves++;return true;};
 const shown=[],originalShow=s.vscode.window.showTextDocument;s.vscode.window.showTextDocument=async(document,options)=>{shown.push({document,options});return originalShow(document,options);};
 if(readonly)s.vscode.workspace.fs.isWritableFileSystem=()=>false;
 const document=schema==='ExampleSchema'?s.first:s.second;
 await s.commands.get('jadeNative.openClassWorkspace')({name:'Sample',schema,file:document.uri.toString()});const panel=s.panels[0];await panel.receive({command:'ready'});
 const id=memberId({schema,owner:'Sample',kind:'method',name:'getName'});await panel.receive({command:'select',id});
 return {s,panel,shown,document,id,saves:()=>saves};
}
test('selecting a member opens its real dirty backing document beside navigation at the exact member',async t=>{
 const f=await selected(t);assert.equal(f.shown.length,1,'Selection never opened the standard source editor');const opened=f.shown[0];assert.equal(opened.document,f.document);assert.equal(opened.document.languageId,'jade-nz');assert.equal(opened.document.isDirty,true);assert.equal(opened.options.viewColumn,f.s.vscode.ViewColumn.Beside);assert.equal(opened.options.preview,false);assert.equal(f.saves(),0,'Opening must not save or copy an unsaved document');
 const member=parseSource(f.document.getText(),f.document.uri.toString()).classes[0].members.find(m=>m.name==='getName');assert.deepEqual(opened.options.selection.start,f.document.positionAt(member.bodyStart));assert.equal(f.s.panels.length,1);assert.equal(f.panel.messages.filter(m=>m.command==='workspace').at(-1).snapshot.state.selectedId,f.id);assert.equal(f.panel.messages.filter(m=>m.command==='editorSnapshot').at(-1).snapshot.editorMode,'native');
});
test('same-named classes remain schema-qualified and the source action never trusts a webview file field',async t=>{
 const f=await selected(t,{schema:'OtherSchema'});assert.equal(f.shown[0]?.document,f.s.second);await f.panel.receive({command:'openOriginal',file:'file:///untrusted.cls'});assert.equal(f.shown.length,2);assert.ok(f.shown.every(row=>row.document===f.s.second&&row.options.viewColumn===f.s.vscode.ViewColumn.Beside));
});
test('read-only backing source never automatically becomes an editable native pane',async t=>{
 const f=await selected(t,{readonly:true});assert.equal(f.shown.length,0);const snapshot=f.panel.messages.filter(m=>m.command==='editorSnapshot').at(-1).snapshot;assert.equal(snapshot.readOnly,true);assert.notEqual(snapshot.editorMode,'native');
});
