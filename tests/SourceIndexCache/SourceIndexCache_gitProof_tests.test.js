'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {SourceIndexCache}=require('../../extension/src/SourceIndexCache');
const {SourceIndex}=require('../../extension/src/workspace-index');
const {parseSource}=require('../../extension/src/source_symbols');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jade-git-proof-')),directory=path.join(root,'.jade/source-index');t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(directory,{recursive:true});
 const nativeVersion='test/source-index/2',gitState={policy:'git-status',generation:'generation-one',head:null,ready:true},binding={format:2,root,repository:root,objectFormat:'sha1',nativeVersion},cacheDescriptor={format:2,nativeVersion,repository:root,objectFormat:'sha1',roots:[{root,directory,gitState}],gitState};
 const parser='test-browser-parser',source='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object;\ntypeDefinitions\nFish completeDefinition ()\ntypeSources\n',rawSha256=crypto.createHash('sha256').update(source).digest('hex');
 const row=name=>({path:name,blobId:'1'.repeat(40),...(name.endsWith('.jade')?{rawSha256}:{native:{hash:rawSha256}}),browser:{parser,rawSha256,model:parseSource(source,pathToFileURL(path.join(root,name)).href)}});
 const write=async(rows=[row('Fish.cls'),row('scratch.jade')],state=gitState)=>{for(const file of await fs.readdir(directory))if(/^v2-\d+\.json$/.test(file))await fs.unlink(path.join(directory,file));const shards=new Map([[0,[]]]);for(const value of rows){const id=crypto.createHash('sha256').update(value.path).digest()[0]%32;if(!shards.has(id))shards.set(id,[]);shards.get(id).push(value);}for(const [id,entries]of shards)await fs.writeFile(path.join(directory,'v2-'+id+'.json'),JSON.stringify({...binding,...(id===0?{gitState:state}:{}),entries}));};await write();
 let preparations=0;const errors=[],cache=new SourceIndexCache({roots:()=>[root],nativeVersion,parserId:parser,prepare:async()=>{preparations++;return cacheDescriptor;},onError:error=>errors.push(error.message)});return{root,directory,gitState,cacheDescriptor,cache,errors,preparations:()=>preparations,write,row,rawSha256};
}
test('one fresh Git-status proof skips raw reads for native and advisory-only cached rows',async t=>{
 const f=await fixture(t);let reads=0;const index=new SourceIndex({list:()=>f.cache.savedUris(),read:async()=>{reads++;assert.fail('unchanged saved contents must not be read');},proof:uri=>f.cache.proof(uri),cache:f.cache});t.after(()=>index.dispose());
 await index.ready();assert.equal(f.preparations(),1);assert.equal(reads,0);assert.equal(index.records.size,2);assert.equal((await f.cache.proof(pathToFileURL(path.join(f.root,'scratch.jade')).href)).rawSha256,f.rawSha256);
});
test('Git-state response and native header disagreement publishes no rows or usable proof',async t=>{
 const f=await fixture(t);await f.write(undefined,{...f.gitState,generation:'other-generation'});assert.deepEqual(await f.cache.load(),[]);assert.equal(await f.cache.proof(pathToFileURL(path.join(f.root,'Fish.cls')).href),undefined);assert.ok(f.errors.some(value=>/generation|Git|binding/i.test(value)));
});
test('native preparation failure remains actionable and never trusts a prior raw hash',async t=>{
 const f=await fixture(t);f.cache.prepare=async()=>{throw Error('Git status could not be read');};assert.deepEqual(await f.cache.load(),[]);assert.equal(await f.cache.proof(pathToFileURL(path.join(f.root,'Fish.cls')).href),undefined);assert.ok(f.errors.some(value=>value.includes('Git status could not be read')));
});
test('explicit invalidation obtains a new Git generation rather than reusing startup proof',async t=>{
 const f=await fixture(t);await f.cache.load();f.cache.invalidate();Object.assign(f.gitState,{generation:'generation-two',head:'a'.repeat(40)});await f.write();await f.cache.load();assert.equal(f.preparations(),2);assert.equal((await f.cache.proof(pathToFileURL(path.join(f.root,'Fish.cls')).href)).rawSha256,f.rawSha256);
});

test('a Git generation change while shards are loaded cannot publish an apparently fresh proof',async t=>{
 const f=await fixture(t),original=fs.readFile;let headerReads=0;fs.readFile=async function(file,...args){if(String(file)===path.join(f.directory,'v2-0.json')&&++headerReads===3){const header=JSON.parse(await original(file,'utf8'));header.gitState={...header.gitState,generation:'concurrent-native-operation'};await fs.writeFile(file,JSON.stringify(header));}return original.call(this,file,...args);};
 try{assert.deepEqual(await f.cache.load(),[]);assert.equal(await f.cache.proof(pathToFileURL(path.join(f.root,'Fish.cls')).href),undefined);assert.ok(f.errors.some(value=>/generation/i.test(value)));}finally{fs.readFile=original;}
});
test('only changed saved source is read when native preparation clears its stale browser row',async t=>{
 const f=await fixture(t),changedText='schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nBird subclassOf Object;\ntypeDefinitions\nBird completeDefinition ()\ntypeSources\n',changedHash=crypto.createHash('sha256').update(changedText).digest('hex');let reads=0;
 f.cache.prepare=async()=>{const changed=f.row('Fish.cls');changed.native.hash=changedHash;delete changed.browser;await f.write([changed,f.row('scratch.jade')]);return f.cacheDescriptor;};
 const index=new SourceIndex({list:()=>f.cache.savedUris(),proof:uri=>f.cache.proof(uri),read:async uri=>{reads++;assert.ok(uri.endsWith('/Fish.cls'));return Buffer.from(changedText);},cache:f.cache});t.after(()=>index.dispose());await index.ready();assert.equal(reads,1);assert.equal(index.records.get(pathToFileURL(path.join(f.root,'Fish.cls')).href).model.classes[0].name,'Bird');
});
test('deleted saved rows disappear while their unsaved open editor is retained',async t=>{
 const f=await fixture(t),uri=pathToFileURL(path.join(f.root,'Fish.cls')).href;f.cache.prepare=async()=>{await f.write([f.row('scratch.jade')]);return f.cacheDescriptor;};const index=new SourceIndex({list:()=>f.cache.savedUris(),proof:uri=>f.cache.proof(uri),read:async()=>assert.fail('unchanged or dirty source must not be read'),cache:f.cache});t.after(()=>index.dispose());index.document({uri:{toString:()=>uri},version:2,isDirty:true,getText:()=> 'schemaDefinition\nUnsaved subschemaOf RootSchema partialDefinition;\ntypeHeaders\nDirtyFish subclassOf Object;'});await index.ready();assert.equal(index.records.size,2);assert.equal(index.records.get(uri).model.classes[0].name,'DirtyFish');assert.equal(await f.cache.proof(uri),undefined);
});
