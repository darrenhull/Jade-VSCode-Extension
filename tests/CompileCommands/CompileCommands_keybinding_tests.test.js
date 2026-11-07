'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../../extension/package.json');
test('F5 builds changed workspace inputs while current-file compilation remains an explicit command',()=>{
 const bindings=manifest.contributes.keybindings;
 const build=bindings.find(binding=>binding.key==='f5'&&binding.when.includes('resourceExtname == .cls'));
 assert.equal(build.command,'jadeNative.buildWorkspace');
 assert.match(build.when,/!inDebugMode/);
 assert.match(build.when,/!jadeNative.publishing/);
 assert.doesNotMatch(build.when,/resourceExtname == \.jade\b|notebookType/);
 assert.ok(manifest.contributes.commands.some(command=>command.command==='jadeNative.compileClass'));
 assert.ok(manifest.contributes.commands.some(command=>command.command==='jadeNative.buildWorkspace'));
});
