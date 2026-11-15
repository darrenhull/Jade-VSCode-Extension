'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {isNestedSnapshot}=require('../../extension/src/source-snapshots');
test('one large discovery checks each ancestor marker once and a new scan sees changes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-snapshot-scan-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,'schemas','Pets','types');fs.mkdirSync(folder,{recursive:true});
 const workspace={getWorkspaceFolder:()=>({uri:{fsPath:root}})},cache=new Map(),original=fs.existsSync;let checks=0;
 fs.existsSync=file=>{checks++;return original(file);};t.after(()=>{fs.existsSync=original;});
 for(let i=0;i<30000;i++)assert.equal(isNestedSnapshot({fsPath:path.join(folder,'C'+i+'.cls')},workspace,cache),false);
 assert.equal(checks,3,'Repeated synchronous filesystem checks still scale with class count');
 fs.writeFileSync(path.join(root,'schemas','.jade-extraction'),'owned snapshot');
 assert.equal(isNestedSnapshot({fsPath:path.join(folder,'C0.cls')},workspace,new Map()),true,'A later scan ignored a new marker');
 assert.equal(isNestedSnapshot({fsPath:path.join(root,'C0.cls')},workspace,new Map()),false,'Opening a snapshot as its own workspace stopped working');
});