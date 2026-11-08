'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ClassWorkspaceEditorProvider}=require('../../extension/src/class-workspace-editor-provider');
test('rejects late undo/redo after another document becomes active instead of modifying that document',async()=>{
 const calls=[],panel={active:false},document={isClosed:false};
 const provider=new ClassWorkspaceEditorProvider({commands:{executeCommand:async name=>calls.push(name)}},()=>{}),services=provider.services(document,{},panel);
 assert.throws(()=>services.undo(),/Select this class workspace/);assert.throws(()=>services.redo(),/Select this class workspace/);assert.deepEqual(calls,[]);
 panel.active=true;await services.undo();await services.redo();assert.deepEqual(calls,['undo','redo']);document.isClosed=true;assert.throws(()=>services.undo(),/Select this class workspace/);assert.equal(calls.length,2);
});
test('canvas actions dispatch original native source URI and preserve debugger function-key behavior',async()=>{
 const calls=[],uri={toString:()=> 'file:///two/Partial.cls'},panel={active:true},vscode={debug:{},commands:{executeCommand:async(...args)=>calls.push(args)}};
 const services=new ClassWorkspaceEditorProvider(vscode,()=>{}).services({uri,isClosed:false},{},panel);
 await services.build();await services.publish();await services.runTests();assert.deepEqual(calls,[['jadeNative.buildWorkspace',uri],['jadeNative.publishClass',uri],['jadeNative.runLocalTests',uri]]);
 vscode.debug.activeDebugSession={};await services.build();await services.publish();await services.runTests();assert.deepEqual(calls.slice(3),[['workbench.action.debug.continue'],['workbench.action.debug.stop'],['workbench.action.debug.run']]);
 panel.active=false;assert.throws(()=>services.build(),/Select this class workspace/);assert.equal(calls.length,6);
});
test('never applies completion edits whose original range escapes the selected method',async()=>{
 const selected={owner:'Fish',member:'name',version:1,start:100,end:110,text:'0123456789'};
 const document={version:1,uri:{},positionAt:offset=>({offset}),offsetAt:value=>value.offset};
 const binding={snapshot:()=>selected,toDocumentOffset:offset=>100+offset};
 const vscode={commands:{executeCommand:async()=>({items:[{label:'outside',range:{start:{offset:50},end:{offset:104}},insertText:'unsafe'},{label:'inside',range:{start:{offset:102},end:{offset:104}},insertText:'safe'}]})}};
 const result=await new ClassWorkspaceEditorProvider(vscode,()=>{}).services(document,binding,{active:true}).completions(4);
 assert.equal(result.items[0].complex,true);assert.equal(result.items[1].complex,false);assert.deepEqual(result.items[1].range,{start:2,end:4});
});
