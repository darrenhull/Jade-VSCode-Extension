'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
test('Working opt-out is a resource checkbox, off by default, with the requested short Source-unchanged label',()=>{
 const setting=require('../../extension/package.json').contributes.configuration.properties['jadeNative.disableJadeGitForWorking'];assert.ok(setting,'Missing Working opt-out checkbox');assert.equal(setting.type,'boolean');assert.equal(setting.default,false);assert.equal(setting.scope,'resource');assert.equal(setting.description,'Disable JadeGit for the Working database. Source is unchanged.');
});
test('actual common settings map the resource checkbox to native policy for both configuration factories',()=>{
 const source=fs.readFileSync(path.join(root,'extension/src/extension.js'),'utf8'),start=source.indexOf('const keys = '),end=source.indexOf('\nfunction expand(',start);assert.ok(start>=0&&end>start);
 for(const checked of [false,true]){const resource={project:'selected'},calls=[],scope={vscode:{workspace:{getConfiguration:(name,actual)=>(calls.push([name,actual]),{get:key=>key==='disableJadeGitForWorking'?checked:undefined,inspect:()=>undefined})}}};vm.runInNewContext(source.slice(start,end)+'\nthis.readSettings=defaults;',scope);const settings=scope.readSettings(resource);assert.equal(settings.workingJadeGitPolicy,checked?'disabled':'inherit');assert.equal(Object.hasOwn(settings,'disableJadeGitForWorking'),false);assert.equal(calls[0][1],resource);}
});
