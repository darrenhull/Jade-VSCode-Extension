'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ClassWorkspaceEditorProvider}=require('../../extension/src/class-workspace-editor-provider');
test('rejects late undo/redo after another document becomes active instead of modifying that document',async()=>{
 const calls=[],panel={active:false},document={isClosed:false};
 const provider=new ClassWorkspaceEditorProvider({commands:{executeCommand:async name=>calls.push(name)}},()=>{}),services=provider.services(document,{},panel);
 assert.throws(()=>services.undo(),/Select this class workspace/);assert.throws(()=>services.redo(),/Select this class workspace/);assert.deepEqual(calls,[]);
 panel.active=true;await services.undo();await services.redo();assert.deepEqual(calls,['undo','redo']);document.isClosed=true;assert.throws(()=>services.undo(),/Select this class workspace/);assert.equal(calls.length,2);
});
