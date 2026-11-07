'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),manifest=require('../../extension/package.json');
test('F5 in a Scratch Pad cannot fall through to debugging or silently execute code',()=>{
 const binding=manifest.contributes.keybindings.find(binding=>binding.key==='f5'&&binding.command==='jadeNative.scratchpadCompileInfo');
 assert.ok(binding);assert.match(binding.when,/jade-workspace/);assert.match(binding.when,/\.jade/);
 assert.ok(!manifest.contributes.keybindings.some(binding=>binding.key==='f5'&&['jadeNative.runWorkspace','jadeNative.runWorkspaceSelection'].includes(binding.command)));
});
