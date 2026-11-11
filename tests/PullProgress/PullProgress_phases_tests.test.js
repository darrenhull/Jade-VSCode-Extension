"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), os=require("node:os"), path=require("node:path"), {EventEmitter}=require("node:events");
const {createPullProgress}=require("../../extension/src/pull-progress");
test("non-native phases stop scans and never present observed classes as hash progress", async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"jade-progress-phase-")); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,"Fish.cls"),"native"); const reports=[], logs=[]; let time=0, closed=0;
 const watcher=new EventEmitter(); watcher.close=()=>closed++;
 const progress=createPullProgress({report:value=>reports.push(value)}, {directory:root, now:()=>time, watch:()=>watcher, intervalMs:100000, log:line=>logs.push(line)}); t.after(()=>progress.dispose());
 await progress.refresh(); time=2000; progress.phase({phase:"Hashing extracted files",completed:0,total:3,bytes:0});
 assert.equal(closed,1); assert.match(reports.at(-1).message,/0\/3 files hashed/); assert.doesNotMatch(reports.at(-1).message,/class files observed|Native extraction/);
 fs.rmSync(root,{recursive:true}); await progress.refresh(); time=3500; progress.phase({phase:"Hashing extracted files",completed:3,total:3,bytes:42});
 assert.match(reports.at(-1).message,/3\/3 files hashed/); time=4000; progress.phase("Organizing native source files"); progress.dispose();
 assert.match(logs.join("\n"),/Native extraction: 0:02 stage/); assert.ok(logs.some(line=>line.includes("Hashing extracted files")));
 assert.ok(reports.every(value=>value.increment===undefined));
});
test("a late native scan cannot revert the displayed phase", async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"jade-progress-late-")); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const reports=[]; const progress=createPullProgress({report:value=>reports.push(value)}, {directory:root,watch:()=>{throw Error("no recursive watcher")},intervalMs:100000}); t.after(()=>progress.dispose());
 progress.phase("Comparing extracted source with workspace files"); await progress.refresh();
 assert.match(reports.at(-1).message,/Comparing/); assert.doesNotMatch(reports.at(-1).message,/class files observed/);
});

test("30k progress updates are throttled and do not create one report per file",t=>{
 const reports=[];const progress=createPullProgress({report:value=>reports.push(value)}, {initialPhase:"Hashing extracted files",now:()=>1000,intervalMs:100000});t.after(()=>progress.dispose());
 for(let completed=0;completed<=30000;completed++)progress.phase({phase:"Hashing extracted files",completed,total:30000});
 assert.ok(reports.length<=3);assert.match(reports.at(-1).message,/30,000\/30,000 files hashed/);
});
