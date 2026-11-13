'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {SourceIndex}=require('../../extension/src/workspace-index');
const {SourceIndexCache}=require('../../extension/src/SourceIndexCache');
const source=name=>'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+name+' subclassOf Object;\ntypeDefinitions\n'+name+' completeDefinition\n(\nattributeDefinitions\n name: String;\n)\ntypeSources\n';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'jade-project-index-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'Fish.cls'),uri=pathToFileURL(file).href;await fs.writeFile(file,source('Fish'));return {root,file,uri};}
function build(f,extras={}){let reads=0;const cache=new SourceIndexCache({roots:()=>[f.root]});const index=new SourceIndex({list:async()=>[f.uri],read:async uri=>{reads++;return fs.readFile(new URL(uri),'utf8');},stat:async uri=>{const value=await fs.stat(new URL(uri));return {mtime:value.mtimeMs,size:value.size};},cache,...extras});return {index,cache,reads:()=>reads};}
test('disposable .jade index survives restart and unchanged files are not read again',async t=>{
 const f=await fixture(t),first=build(f);await first.index.ready();await first.index.persist();assert.equal(first.reads(),1);first.index.dispose();
 const next=build(f);await next.index.ready();assert.equal(next.reads(),0);assert.equal(next.index.project.groups.get('Pets::Fish')[0].cls.name,'Fish');
 assert.match(await fs.readFile(path.join(f.root,'.jade','.gitignore'),'utf8'),/\*/);next.index.dispose();
});
test('cached rows are available while validation is blocked; later changed/deleted files refresh',async t=>{
 const f=await fixture(t),first=build(f);await first.index.ready();await first.index.persist();first.index.dispose();
 let release;const gate=new Promise(resolve=>{release=resolve;}),next=build(f,{list:async()=>{await gate;return [];}});
 await next.index.browserReady();assert.ok(next.index.project.groups.has('Pets::Fish'));release();await next.index.ready();assert.equal(next.index.records.size,0);await next.index.persist();next.index.dispose();
 const changed=build(f);await fs.writeFile(f.file,source('BiggerFish'));await changed.index.ready();assert.ok(changed.index.project.groups.has('Pets::BiggerFish'));assert.equal(changed.reads(),1);await changed.index.persist();changed.index.dispose();
});
test('dirty buffers override cached records and are never saved as disk metadata',async t=>{
 const f=await fixture(t),first=build(f);await first.index.ready();await first.index.persist();first.index.dispose();
 const current=build(f);current.index.document({uri:{toString:()=>f.uri},version:1,getText:()=>source('UnsavedFish')});await current.index.ready();await current.index.persist();assert.ok(current.index.project.groups.has('Pets::UnsavedFish'));assert.equal(current.reads(),0);current.index.dispose();
 const reopened=build(f);await reopened.index.ready();assert.ok(reopened.index.project.groups.has('Pets::Fish'));assert.equal(reopened.index.project.groups.has('Pets::UnsavedFish'),false);reopened.index.dispose();
});
test('lost or corrupt cache rebuilds and external file URIs are never trusted',async t=>{
 const f=await fixture(t),first=build(f);await first.index.ready();await first.index.persist();first.index.dispose();
 const directory=path.join(f.root,'.jade','source-index');const files=(await fs.readdir(directory)).filter(file=>file.endsWith('.json'));assert.ok(files.length);
 for(const file of files)await fs.writeFile(path.join(directory,file),'broken');const next=build(f);await next.index.ready();assert.equal(next.reads(),1);await next.index.persist();next.index.dispose();
 const other=pathToFileURL(path.join(path.dirname(f.root),'outside.cls')).href;next.cache.set(other,{stamp:{mtime:1,size:1},model:{uri:other,schema:'Foreign',classes:[]}});await next.cache.flush();const loaded=await new SourceIndexCache({roots:()=>[f.root]}).load();assert.equal(loaded.some(row=>row.uri===other),false);
 await fs.rm(directory,{recursive:true,force:true});const rebuilt=build(f);await rebuilt.index.ready();assert.equal(rebuilt.reads(),1);await rebuilt.index.persist();rebuilt.index.dispose();
});
test('a cache directory link is refused without touching its target',async t=>{
 const f=await fixture(t),outside=await fs.mkdtemp(path.join(os.tmpdir(),'jade-index-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));await fs.mkdir(path.join(f.root,'.jade'));await fs.symlink(outside,path.join(f.root,'.jade','source-index'),process.platform==='win32'?'junction':'dir');
 const current=build(f);await current.index.ready();await current.index.persist();assert.equal(current.reads(),1);assert.deepEqual(await fs.readdir(outside),[]);current.index.dispose();
});
test('cache files are ignored by Git without editing the project gitignore',async t=>{
 const {spawnSync}=require('node:child_process'),f=await fixture(t);const git=spawnSync('git',['init','--quiet',f.root]);assert.equal(git.status,0);const current=build(f);await current.index.ready();await current.index.persist();current.index.dispose();
 const status=spawnSync('git',['-c','safe.directory='+f.root,'-C',f.root,'status','--porcelain','--untracked-files=all'],{encoding:'utf8'});assert.equal(status.status,0);assert.match(status.stdout,/Fish\.cls/);assert.doesNotMatch(status.stdout,/\.jade/);await assert.rejects(fs.stat(path.join(f.root,'.gitignore')),{code:'ENOENT'});
});
test('saved watcher events force rereads and observer/cache failures cannot break source indexing',async t=>{
 const f=await fixture(t),current=build(f);await current.index.ready();await current.index.persist();current.index.onDidChange(()=>{throw Error('closed view');});await fs.writeFile(f.file,source('NewFish'));current.index.schedule(f.uri);await current.index.flush();await current.index.persist();assert.equal(current.reads(),2);assert.ok(current.index.project.groups.has('Pets::NewFish'));current.index.dispose();
 const broken=new SourceIndex({list:async()=>[f.uri],read:async()=>source('FreshFish'),cache:{load:async()=>{throw Error('cache unavailable');},set(){},flush:async()=>{},delete(){}},onError:()=>{throw Error('closed output');}});await broken.ready();assert.ok(broken.project.groups.has('Pets::FreshFish'));broken.dispose();
});
test('adds, deletes and moves update persisted paths incrementally across restart',async t=>{
 const f=await fixture(t),list=async()=> (await fs.readdir(f.root)).filter(name=>name.endsWith('.cls')).map(name=>pathToFileURL(path.join(f.root,name)).href),current=build(f,{list});await current.index.ready();await current.index.persist();
 const added=path.join(f.root,'Bird.cls'),addedUri=pathToFileURL(added).href;await fs.writeFile(added,source('Bird'));current.index.schedule(addedUri);await current.index.flush();
 await fs.unlink(f.file);current.index.removeSaved(f.uri);
 const moved=path.join(f.root,'MovedBird.cls'),movedUri=pathToFileURL(moved).href;await fs.rename(added,moved);current.index.rename(addedUri,movedUri);await current.index.flush();await current.index.persist();
 assert.equal(current.index.records.has(f.uri),false);assert.equal(current.index.records.has(addedUri),false);assert.ok(current.index.records.has(movedUri));current.index.dispose();
 const next=build(f,{list});await next.index.ready();assert.equal(next.reads(),0);assert.deepEqual([...next.index.records.keys()],[movedUri]);assert.equal(next.index.project.groups.get('Pets::Bird')[0].model.uri,movedUri);next.index.dispose();
});
test('a deleted disk file is removed from cache while its dirty editor remains live',async t=>{
 const f=await fixture(t),current=build(f);await current.index.ready();await current.index.persist();current.index.document({uri:{toString:()=>f.uri},version:1,isDirty:true,getText:()=>source('UnsavedFish')});await fs.unlink(f.file);current.index.removeSaved(f.uri);await current.index.persist();
 assert.ok(current.index.project.groups.has('Pets::UnsavedFish'));assert.equal(current.index.records.get(f.uri).open,true);assert.equal((await new SourceIndexCache({roots:()=>[f.root]}).load()).length,0);current.index.dispose();
});
test('a newly saved open file is cached from disk while later unsaved edits stay private',async t=>{
 const f=await fixture(t),current=build(f);await current.index.ready();await current.index.persist();
 const file=path.join(f.root,'SavedBird.cls'),uri=pathToFileURL(file).href;await fs.writeFile(file,source('SavedBird'));
 const document={uri:{toString:()=>uri},version:1,isDirty:false,getText:()=>source('SavedBird')};current.index.document(document);current.index.schedule(uri);await current.index.flush();await current.index.persist();
 let rows=await new SourceIndexCache({roots:()=>[f.root]}).load();assert.equal(rows.find(row=>row.uri===uri)?.model.classes[0].name,'SavedBird','A saved open file was missing from the persistent index');
 document.version++;document.isDirty=true;document.getText=()=>source('UnsavedBird');current.index.document(document);current.index.schedule(uri);await current.index.flush();await current.index.persist();
 rows=await new SourceIndexCache({roots:()=>[f.root]}).load();assert.equal(rows.find(row=>row.uri===uri).model.classes[0].name,'SavedBird');assert.ok(current.index.project.groups.has('Pets::UnsavedBird'));current.index.dispose();
});