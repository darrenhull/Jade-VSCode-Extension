'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../extension/package.json');
const {registerNativeSourceCommands}=require('../extension/src/native-source-commands');
const {setup}=require('../tests/NativeSourceWorkspace/fixtures/vscode.cjs');
test('JOX contributes its debugger and breakpoint languages without overriding native runtime capabilities',()=>{
 assert.ok(manifest.contributes.languages.some(entry=>entry.id==='jade-nz'));
 assert.deepEqual(manifest.contributes.breakpoints.map(row=>row.language),['jade-nz','jade-jox']);
 assert.deepEqual(manifest.contributes.debuggers.map(row=>row.type),['jade-native-experimental']);
 assert.ok(manifest.contributes.keybindings.some(entry=>entry.command==='jadeNative.debugMethod'&&entry.key==='f5'));
});
test('legacy JOX commands do not register an unqualified debugger',()=>{
 const f=setup();
 registerNativeSourceCommands(f.vscode,f.context,{},{});
 assert.equal(f.commands.has('jadeNative.debugMethod'),false);
 assert.deepEqual(f.requests,[]);
});
