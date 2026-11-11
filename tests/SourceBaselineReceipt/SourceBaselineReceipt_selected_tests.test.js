"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {readSelectedBaselineReceipt}=require("../../extension/src/source-baseline-receipt");
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),"jade-remote-receipt-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const destination=path.join(root,"workspace"),storageDirectory=path.join(root,"global");fs.mkdirSync(destination);fs.mkdirSync(path.join(storageDirectory,"source-baselines"),{recursive:true});const sourceDatabasePath=path.join(root,"source");const receipt=path.join(storageDirectory,"source-baselines",crypto.createHash("sha256").update(path.resolve(destination).toLowerCase()+"::"+path.resolve(sourceDatabasePath).toLowerCase()).digest("hex")+".json");return{root,destination,storageDirectory,sourceDatabasePath,receipt,selection:[{path:"schemas/Pets/types/Fish.cls"}]};}
const manifest=(f,files)=>({format:1,exitCode:0,mode:"Every; sections; ddxFormat; utf8Encoding",database:f.sourceDatabasePath,extractor:"jadclient.exe",files});
test("imports only selected saved remote hashes and never hashes current source",t=>{
 const f=fixture(t),remote="a".repeat(64);fs.mkdirSync(path.join(f.destination,"schemas/Pets/types"),{recursive:true});fs.writeFileSync(path.join(f.destination,f.selection[0].path),"local changes must not become baseline");
 fs.writeFileSync(f.receipt,JSON.stringify(manifest(f,[{path:f.selection[0].path,sha256:remote,nativePath:"Pets/Types/Fish.cls"},{path:"schemas/Pets/types/Cow.cls",sha256:"b".repeat(64)}])));
 const result=readSelectedBaselineReceipt(f);assert.equal(result.files.length,1);assert.equal(result.files[0].sha256,remote);assert.equal(result.sourceDatabasePath,f.sourceDatabasePath);assert.equal(result.destination,f.destination);
});
test("legacy in-folder receipt remains bound to the selected source database",t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.destination,"extract-manifest.json"),JSON.stringify(manifest(f,[{path:f.selection[0].path,sha256:"a".repeat(64)}])));assert.equal(readSelectedBaselineReceipt(f).files.length,1);
 fs.writeFileSync(path.join(f.destination,"extract-manifest.json"),JSON.stringify({...manifest(f,[]),database:path.join(f.root,"other-db")}));assert.throws(()=>readSelectedBaselineReceipt(f),/database|binding/i);
});
test("no receipt or no selected entry produces no fabricated baseline",t=>{
 const f=fixture(t);assert.equal(readSelectedBaselineReceipt(f),undefined);fs.writeFileSync(f.receipt,JSON.stringify(manifest(f,[{path:"Other.cls",sha256:"a".repeat(64)}])));assert.equal(readSelectedBaselineReceipt(f),undefined);
});
test("malformed selected hashes and unsafe receipt paths are rejected",t=>{
 const f=fixture(t);for(const entry of [{path:f.selection[0].path,sha256:"bad"},{path:f.selection[0].path,sha256:"a".repeat(64),nativePath:"../outside.cls"}]){fs.writeFileSync(f.receipt,JSON.stringify(manifest(f,[entry])));assert.throws(()=>readSelectedBaselineReceipt(f),/receipt|hash|path/i);}
});

test("a legacy latest/unknown-version receipt is not imported into current extraction",t=>{
 const f=fixture(t);fs.writeFileSync(f.receipt,JSON.stringify({...manifest(f,[{path:f.selection[0].path,sha256:"a".repeat(64)}]),mode:"EveryLast; sections"}));assert.equal(readSelectedBaselineReceipt(f),undefined);
});
