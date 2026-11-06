'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../extension/package.json');
test('Jade declares gutter breakpoint support for its registered source language',()=>{
 assert.ok(manifest.contributes.breakpoints?.some(entry=>entry.language==='jade-nz'));
 assert.ok(manifest.contributes.debuggers.some(entry=>entry.type==='jade-native-experimental'&&entry.languages.includes('jade-nz')));
});
test('native application launch exposes stored application and startup parameter settings',()=>{
 const debuggerType=manifest.contributes.debuggers.find(entry=>entry.type==='jade-native-experimental'),properties=debuggerType.configurationAttributes.launch.properties;
 assert.deepEqual(properties.launchMode.enum,['method','application']);assert.equal(properties.application.type,'string');assert.equal(properties.applicationParameter.type,'string');assert.equal(properties.schema.type,'string');
 assert.ok(debuggerType.configurationSnippets.some(snippet=>snippet.body.launchMode==='application'));
});
