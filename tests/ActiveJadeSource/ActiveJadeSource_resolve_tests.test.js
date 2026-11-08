'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveJadeSource}=require('../../extension/src/active-jade-source');
const uri=path=>({scheme:'file',fsPath:path,toString:()=> 'file:///'+path});
test('prioritizes the active custom editors real URI over a stale native editor from another project',async()=>{
 const target=uri('two/Fish.cls'),stale={uri:uri('one/Fish.cls')},opened=[];
 const vscode={window:{activeTextEditor:{document:stale},tabGroups:{activeTabGroup:{activeTab:{input:{viewType:'jade.classWorkspace',uri:target}}}}},workspace:{openTextDocument:async value=>{opened.push(value);return {uri:value};}}};
 const document=await resolveJadeSource(vscode);assert.strictEqual(document.uri,target);assert.deepEqual(opened,[target]);
});
test('flushes pending canvas edits before opening an explicit source document',async()=>{
 const target=uri('two/Partial.cls'),calls=[];let revision=1;
 const vscode={window:{},workspace:{openTextDocument:async value=>{calls.push('open');return {uri:value,version:revision};}}};
 const document=await resolveJadeSource(vscode,target,{prepare:async value=>{assert.strictEqual(value,target);await new Promise(resolve=>setTimeout(resolve,5));revision=2;calls.push('flush');}});
 assert.deepEqual(calls,['flush','open']);assert.equal(document.version,2);
});
test('preserves ordinary text-editor behavior and refuses unrelated webviews instead of selecting stale source',async()=>{
 const document={uri:uri('one/Fish.cls')},vscode={window:{activeTextEditor:{document}},workspace:{}};assert.strictEqual(await resolveJadeSource(vscode),document);
 vscode.window.tabGroups={activeTabGroup:{activeTab:{input:{viewType:'jadeDatabaseObjects'}}}};assert.equal(await resolveJadeSource(vscode),undefined);
});
test('a rejected pending edit prevents dispatch before any file is opened',async()=>{
 const target=uri('two/Fish.cls'),vscode={window:{},workspace:{openTextDocument:async()=>assert.fail('No source may be read before the pending edit resolves')}};
 await assert.rejects(resolveJadeSource(vscode,target,{prepare:async()=>{throw Error('Resolve draft first');}}),/Resolve draft/);
});
