'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../extension/package.json');
const {registerNativeSourceCommands}=require('../extension/src/native-source-commands');
const {setup}=require('../tests/NativeSourceWorkspace/fixtures/vscode.cjs');
test('JOX keeps its source language without advertising an unqualified debugger or breakpoints',()=>{
 assert.ok(manifest.contributes.languages.some(entry=>entry.id==='jade-nz'));
 assert.deepEqual(manifest.contributes.breakpoints??[],[]);
 assert.deepEqual(manifest.contributes.debuggers??[],[]);
 assert.ok(!manifest.contributes.keybindings.some(entry=>['jadeNative.debugMethod','jadeNative.debugApplication'].includes(entry.command)));
});
test('legacy JOX commands do not register an unqualified debugger',()=>{
 const f=setup();
 registerNativeSourceCommands(f.vscode,f.context,{},{});
 assert.equal(f.commands.has('jadeNative.debugMethod'),false);
 assert.deepEqual(f.requests,[]);
});
