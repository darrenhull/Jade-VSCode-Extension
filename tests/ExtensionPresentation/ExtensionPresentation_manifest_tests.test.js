'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
test('installed extension presents Jade Tools without changing its update identity',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'),'utf8'));
 assert.equal(manifest.displayName,'Jade Tools');assert.equal(manifest.publisher+'.'+manifest.name,'jade-local-tools.jade-native-runner-cpp-preview');
 assert.match(manifest.description,/browse.*edit.*JOX.*local.*Jade tests/i);assert.doesNotMatch(manifest.description,/build|debug|C\+\+|broker|ABI|preview/i);
 const language=manifest.contributes.languages.find(value=>value.id==='jade-nz');assert.deepEqual(language.aliases,['Jade']);
 const grammar=JSON.parse(fs.readFileSync(path.join(root,'extension/syntaxes/jade.tmLanguage.json'),'utf8'));assert.equal(grammar.name,'Jade');
});
test('installed Details describes supported user workflows and setup without raw implementation diagrams',()=>{
 const readme=fs.readFileSync(path.join(root,'extension/README.md'),'utf8');
 assert.match(readme,/^# Jade Tools\r?\n/);assert.match(readme,/Windows[\s\S]*compatible.*Unicode Jade runtime/i);assert.match(readme,/Jade IDE.*not required/i);
 for(const feature of ['Run Local Test','Ctrl+F5','Testing','Object Explorer','Class Workspace','Database Objects','Jade: Set Up Project','Create Working copy and extract sources'])assert.ok(readme.includes(feature),feature);
 assert.match(readme,/Source remains separate and is not published by setup or local testing/);assert.match(readme,/Standalone builds[\s\S]*structural editing and Source publication are not qualified/);assert.match(readme,/independent[\s\S]*Jade Software/i);
 assert.doesNotMatch(readme,/```mermaid|^## Architecture|native ABI|shared local broker|SDK\/native development/mi);
});
