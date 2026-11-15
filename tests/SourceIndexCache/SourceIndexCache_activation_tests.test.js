'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{pathToFileURL,fileURLToPath}=require('node:url');
const {registerLanguageTools}=require('../../extension/src/language-tools'),{parseSource}=require('../../extension/src/source_symbols');
const text=name=>'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+name+' subclassOf Object;\ntypeDefinitions\n'+name+' completeDefinition ()\ntypeSources\n';
const {fixture}=require('./SourceIndexCache_activation_harness.cjs');

test('language activation uses one database-free capability query and same-cache candidates without frontend discovery',async t=>{
 const f=await fixture(t);await f.language.index.ready();assert.equal(f.language.index.records.size,1);assert.equal(f.calls.filter(row=>row.command==='doctor').length,1);assert.deepEqual(f.calls[0].config,{});assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,1);assert.ok((await fs.readdir(f.directory)).every(name=>!name.startsWith('v1-')));
});
test('explicit source refresh invokes the chosen native root once and retains unsaved editor models',async t=>{
 const f=await fixture(t);await f.language.index.ready();f.language.index.document({uri:f.resource,version:1,isDirty:true,getText:()=>text('UnsavedFish')});await f.language.refreshSourceIndex(f.folder);
 const refresh=f.calls.filter(row=>row.command==='source.index.refresh');assert.equal(refresh.length,1);assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,1,'Refresh must use its own immediate receipt, without another prepare');assert.deepEqual(refresh[0].body.config.workspaceRoots,[f.root]);assert.equal(f.language.index.records.get(f.resource.toString()).model.classes[0].name,'UnsavedFish');
});
test('unsupported bundled capabilities remain actionable without legacy writes or hidden scans',async t=>{
 const f=await fixture(t,{unsupported:true});await f.language.index.ready();assert.equal(f.language.index.records.size,0);assert.ok(f.logs.some(line=>/Update.*CLI|capability/i.test(line)));assert.ok((await fs.readdir(f.directory)).every(name=>!name.startsWith('v1-')));
});

test('startup shares one Git-status preparation across cached rows and performs no unchanged source read',async t=>{const f=await fixture(t);await f.language.index.ready();assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,1);assert.equal(f.reads(),0);f.language.index.schedule(f.resource.toString());await f.language.index.flush();assert.equal(f.reads(),1,'Live saved-file notifications must validate actual bytes');assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,1);});
test('old build receipt cannot replace fresh Git status after external source and HEAD changes',async t=>{
 const f=await fixture(t);await f.language.index.ready();const oldReceipt=(await f.client.request('build',{}).promise).report.sourceIndex;let staleReceiptRequested=false;f.client.takeSourceIndexReceipt=()=>{staleReceiptRequested=true;return oldReceipt;};
 await fs.writeFile(f.resource.fsPath,text('Bird'));const original=f.client.request.bind(f.client),nextState={policy:'git-status',generation:'after-external-head-change',head:'b'.repeat(40),ready:true};
 f.client.request=(command,body,...args)=>{const result=original(command,body,...args);if(command==='source.index.prepare')result.promise=result.promise.then(async result=>{for(const name of await fs.readdir(f.directory)){const file=path.join(f.directory,name),data=JSON.parse(await fs.readFile(file,'utf8'));if(name==='v2-0.json')data.gitState=nextState;for(const row of data.entries)if(row.path==='Fish.cls'){row.native.hash=crypto.createHash('sha256').update(text('Bird')).digest('hex');delete row.browser;}await fs.writeFile(file,JSON.stringify(data));}return{...result,cache:{...result.cache,gitState:nextState,roots:result.cache.roots.map(root=>({...root,gitState:nextState}))}};});return result;};
 f.language.index.invalidate();await f.language.index.ready();assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,2);assert.equal(f.reads(),1);assert.equal(staleReceiptRequested,false);assert.equal(f.language.index.records.get(f.resource.toString()).model.classes[0].name,'Bird');
});

for(const invalid of ['missing','old-version'])test('initial '+invalid+' native cache repairs once for execution and populates browser classes',async t=>{
 const f=await fixture(t),original=f.client.request.bind(f.client);let repaired=false;
 f.client.request=(command,body,...args)=>{if(command==='source.index.prepare'&&!repaired){f.calls.push({command,body});return{id:80,promise:Promise.resolve({passed:false,code:2,report:{error:'Refresh Workspace source cache using jade-cli source refresh or Initialise Workspace before preparing source inputs: cache is missing or incompatible.'}})};}if(command==='source.index.refresh')repaired=true;return original(command,body,...args);};
 await f.language.index.ready();
 assert.equal(f.language.index.records.size,1,'Missing or old native cache must not silently publish an empty class catalogue');
 assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,1);assert.equal(f.calls.filter(row=>row.command==='source.index.refresh').length,1);
 assert.equal(f.language.index.records.size,1);assert.equal(f.language.index.project.groups.get('Pets::Fish')?.length,1);
 assert.ok(f.logs.some(line=>/Initialising.*source index/i.test(line)));
 await f.language.ensureSourceIndex({workspaceRoots:[f.root]});assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,1,'Warm execution must not prepare again');
});

test('Git or transport preparation errors never trigger cache repair or claim execution readiness',async t=>{
 const f=await fixture(t),original=f.client.request.bind(f.client);f.client.request=(command,body,...args)=>command==='source.index.prepare'?{id:99,promise:Promise.resolve({passed:false,code:2,report:{error:'Git status failed: access denied'}})}:original(command,body,...args);
 await f.language.index.ready();assert.equal(f.language.index.records.size,0);assert.ok(f.logs.some(line=>/Git status failed/.test(line)));await assert.rejects(f.language.ensureSourceIndex({workspaceRoots:[f.root]}),/Git status failed/);assert.equal(f.calls.filter(row=>row.command==='source.index.refresh').length,0);
});

test('startup and manual refresh pass the configured bounded source-index deadline',async t=>{const f=await fixture(t);f.settings.sourceIndexTimeoutSeconds=321;await f.language.index.ready();await f.language.refreshSourceIndex(f.folder);assert.ok(f.calls.filter(row=>['source.index.prepare','source.index.refresh'].includes(row.command)).every(row=>row.body.config.timeoutMilliseconds<=321000&&row.body.config.timeoutMilliseconds>320000));});

test('manual cache refresh opens one cancellable bottom-right progress notification',async t=>{const f=await fixture(t);await f.language.refreshSourceIndex(f.folder);assert.equal(f.notifications.length,1);assert.equal(f.notifications[0].options.location,15);assert.equal(f.notifications[0].options.cancellable,true);assert.match(f.notifications[0].messages.join(' '),/elapsed/);});

test('failed explicit refresh preserves rows and invalidates the execution gate',async t=>{const f=await fixture(t);await f.language.index.ready();const original=f.client.request.bind(f.client);f.client.request=(command,body,...args)=>command==='source.index.refresh'?{id:88,promise:Promise.resolve({passed:false,code:2,timedOut:true,report:{error:'Git workspace source preparation timed out'}})}:original(command,body,...args);await assert.rejects(f.language.refreshSourceIndex(f.folder),/timed out/);assert.equal(f.language.index.records.size,1);const before=f.calls.filter(row=>row.command==='source.index.prepare').length;await f.language.ensureSourceIndex({workspaceRoots:[f.root]});assert.equal(f.calls.filter(row=>row.command==='source.index.prepare').length,before+1);assert.ok(f.logs.some(line=>/incomplete.*retained/.test(line)));});
