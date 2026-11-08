'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ProjectSkillInstaller}=require('../../extension/src/ProjectSkillInstaller');
const root=path.resolve(__dirname,'../..'),bundle=path.join(root,'extension/skills/jade-language');
function guide(file){return fs.readFileSync(path.join(bundle,file),'utf8').replaceAll('\r\n','\n');}
function example(text,id){const start=text.indexOf('<!-- lifecycle:'+id+' -->');assert.ok(start>=0,'Missing shipped '+id+' example');const match=/```jade\n([\s\S]*?)```/.exec(text.slice(start));assert.ok(match,'Missing Jade fence for '+id);return match[1];}
test('shipped lifecycle examples exactly match native fixture source and are available in the existing guide attachment',()=>{
 const text=guide('references/language-reference.md');
 for(const id of ['create-before-use','parameterized-constructor','input-parameter-update','persistent-update'])assert.equal(example(text,id),fs.readFileSync(path.join(root,'test/fixtures/lifecycle',id+'.jade'),'utf8'));
 assert.match(text,/create\(\).*updating/);assert.match(text,/::super/);assert.match(text,/not.*new|instead of.*new/i);
 const skill=guide('SKILL.md');assert.match(skill,/creation|initiali[sz]/i);assert.match(skill,/language-reference\.md/);
});
test('guidance separates updating receiver permission from caller transactions and parameter usage',()=>{
 const text=guide('references/syntax-reference.md');
 assert.match(text,/updating[^\n]*self|self[^\n]*updating/i);assert.match(text,/does not (?:start|begin)[^\n]*transaction/i);
 for(const word of ['constant','input','io','output'])assert.ok(text.includes('`'+word+'`'));
 assert.match(text,/create_instruction\.htm/);assert.match(text,/updating_option\.htm/);assert.match(text,/using_constructors_and_destructors\.htm/);
});
test('actual project skill installation delivers the create-before-use and updating guidance',async t=>{
 const project=fs.mkdtempSync(path.join(os.tmpdir(),'jade-lifecycle-skill-'));t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const storage=new Map(),state={get:key=>storage.get(key),update:async(key,value)=>storage.set(key,value)};
 const installer=new ProjectSkillInstaller({bundle,state,isTrusted:()=>true});
 await installer.install({uri:{scheme:'file',fsPath:project,toString:()=> 'file:///'+project.replaceAll('\\','/')}},{knownJade:true});
 const installed=fs.readFileSync(path.join(project,'.github/skills/jade-language/references/language-reference.md'),'utf8').replaceAll('\r\n','\n');
 assert.equal(example(installed,'create-before-use'),fs.readFileSync(path.join(root,'test/fixtures/lifecycle/create-before-use.jade'),'utf8'));
 assert.match(installed,/setName\(pName[^\n]*updating/);
});
