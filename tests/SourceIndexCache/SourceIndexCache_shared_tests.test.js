'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {SourceIndexCache}=require('../../extension/src/SourceIndexCache');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const version='native-build-proof',parser='browser-parser-proof';
async function fixture(t){
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'jade-shared-source-cache-'));
 t.after(async()=>{assert.equal(path.dirname(temporary),await fs.realpath(os.tmpdir()));assert.match(path.basename(temporary),/^jade-shared-source-cache-/);assert.equal((await fs.lstat(temporary)).isSymbolicLink(),false);await fs.rm(temporary,{recursive:true,force:true});});
 const repository=path.join(temporary,'repository'),root=path.join(repository,'project'),directory=path.join(root,'.jade/source-index');await fs.mkdir(directory,{recursive:true});
 const relative='project/Fish.cls',uri=pathToFileURL(path.join(repository,relative)).href,rawSha256=hash(Buffer.from('saved bytes with\r\nformatting'));
 const model={schema:'Pets',parentSchema:'RootSchema',lineStarts:[0,7],classes:[{name:'Fish',kind:'class',start:0,end:12,selection:0,regions:[[0,12]],members:[]}]};
 const row={path:relative,blobId:'1'.repeat(40),native:{hash:rawSha256,shape:'native-shape',extension:'.cls',schema:'Pets',unknownNative:{mustSurvive:true}},browser:{parser,rawSha256,model}};
 const shard=crypto.createHash('sha256').update(relative).digest()[0]%32,file=path.join(directory,'v2-'+shard+'.json');
 const header={format:2,root,repository,objectFormat:'sha1',nativeVersion:version,entries:[row]};await fs.writeFile(file,JSON.stringify(header));
 return {temporary,repository,root,directory,relative,uri,rawSha256,model,row,file,header};
}
function cache(f,extra={}){return new SourceIndexCache({roots:()=>[f.root],nativeVersion:version,parserId:parser,...extra});}
const shardOf=relative=>crypto.createHash('sha256').update(relative).digest()[0]%32;
function sameShardPaths(prefix,count){const result=[];for(let i=0;result.length<count;i++){const value=prefix+i+'.cls';if(shardOf(value)===0)result.push(value);}return result;}

test('v2 reader uses digest-bound advisory model from the owning repository subdirectory without source bodies',async t=>{
 const f=await fixture(t);f.row.browser.model={...f.model,text:'DO_NOT_PERSIST',code:'DO_NOT_PERSIST',classes:[{...f.model.classes[0],members:[{name:'run',kind:'method',selection:1,start:1,end:4,body:'DO_NOT_PERSIST',parameters:[{name:'arg',type:'String',sourceText:'DO_NOT_PERSIST'}]}]}]};await fs.writeFile(f.file,JSON.stringify(f.header));
 const rows=await cache(f).load();assert.equal(rows.length,1);assert.equal(rows[0].uri,f.uri);assert.equal(rows[0].rawSha256,f.rawSha256);assert.equal(rows[0].model.classes[0].name,'Fish');
 assert.ok(!JSON.stringify(rows[0].model).includes('DO_NOT_PERSIST'));assert.equal(rows[0].model.uri,f.uri);
 assert.equal((await fs.readdir(f.directory)).filter(name=>name.startsWith('v1-')).length,0);
});

test('advisory flush sends a bounded native delta and never replaces shared shard/native resource data',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.file),packets=[];
 const current=cache(f,{request:(command,body)=>{packets.push({command,body});return {id:1,promise:Promise.resolve({code:0,passed:true,accepted:[f.relative],stale:[]})};}});
 await current.load();current.set(f.uri,{model:{...f.model,uri:f.uri,text:'SECRET BODY'},stamp:{mtime:1,size:1},rawSha256:f.rawSha256});await current.flush();
 assert.equal(packets.length,1);assert.equal(packets[0].command,'source.index.browser.update');assert.equal(packets[0].body.root,f.root);assert.equal(packets[0].body.parser,parser);
 assert.deepEqual(Object.keys(packets[0].body.updates[0]).sort(),['model','path','rawSha256']);assert.equal(packets[0].body.updates[0].path,f.relative);assert.ok(!JSON.stringify(packets).includes('SECRET BODY'));
 assert.deepEqual(await fs.readFile(f.file),before,'JavaScript must never rewrite shared native/resource rows');assert.deepEqual(await fs.readdir(f.directory),[path.basename(f.file)]);
 await current.flush();assert.equal(packets.length,1,'Clean flush must issue no native requests');
});

test('native stale advisory acknowledgement is reported without retry/full refresh or disk writes',async t=>{
 const f=await fixture(t),errors=[],packets=[],before=await fs.readFile(f.file);
 const current=cache(f,{onError:error=>errors.push(error),request:(command,body)=>{packets.push({command,body});return {id:1,promise:Promise.resolve({code:0,passed:true,accepted:[],stale:[f.relative]})};}});
 await current.load();current.set(f.uri,{model:{...f.model,uri:f.uri},rawSha256:f.rawSha256});await current.flush();await current.flush();
 assert.equal(packets.length,1);assert.ok(errors.some(error=>/stale|changed/i.test(error.message)));assert.deepEqual(await fs.readFile(f.file),before);
});
for(const mismatch of ['browser digest','browser parser','native absent'])test('v2 browser load ignores '+mismatch+' without granting cached source authority',async t=>{
 const f=await fixture(t);if(mismatch==='browser digest')f.row.browser.rawSha256='0'.repeat(64);else if(mismatch==='browser parser')f.row.browser.parser='old-browser';else delete f.row.native;await fs.writeFile(f.file,JSON.stringify(f.header));
 assert.deepEqual(await cache(f).load(),[]);
});

test('incompatible native caches require explicit repair without creating or rewriting cache files',async t=>{
 const f=await fixture(t),errors=[];f.header.nativeVersion='old-native-build';await fs.writeFile(f.file,JSON.stringify(f.header));const before=await fs.readFile(f.file);
 assert.deepEqual(await cache(f,{onError:error=>errors.push(error)}).load(),[]);assert.ok(errors.some(error=>/initiali[sz]e|refresh/i.test(error.message)));assert.deepEqual(await fs.readFile(f.file),before);
});

test('browser delete is a conditional advisory clear, not a native inventory deletion',async t=>{
 const f=await fixture(t),packets=[],before=await fs.readFile(f.file),current=cache(f,{request:(command,body)=>{packets.push({command,body});return {id:1,promise:Promise.resolve({code:0,passed:true,accepted:[f.relative],stale:[]})};}});
 await current.load();current.delete(f.uri);await current.flush();assert.equal(packets.length,1);assert.deepEqual(packets[0].body.updates,[{path:f.relative,rawSha256:f.rawSha256,model:null}]);assert.deepEqual(await fs.readFile(f.file),before);
});

test('a newer saved advisory update survives an older in-flight acknowledgement',async t=>{
 const f=await fixture(t),packets=[];let acknowledge;
 const current=cache(f,{request:(command,body)=>{packets.push(body);if(packets.length===1)return {id:1,promise:new Promise(resolve=>acknowledge=resolve)};return {id:2,promise:Promise.resolve({code:0,passed:true,accepted:[f.relative],stale:[]})};}});
 await current.load();current.set(f.uri,{model:{...f.model,uri:f.uri},rawSha256:f.rawSha256});const flushing=current.flush();
 const deadline=Date.now()+1000;while(!acknowledge&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));assert.ok(acknowledge,'Native request must reach the controlled gate');
 current.set(f.uri,{model:{...f.model,uri:f.uri,classes:[{...f.model.classes[0],name:'NewerFish'}]},rawSha256:'2'.repeat(64)});
 acknowledge({code:0,passed:true,accepted:[f.relative],stale:[]});await flushing;await current.flush();assert.equal(packets.length,2);assert.equal(packets[1].updates[0].model.classes[0].name,'NewerFish');assert.equal(packets[1].updates[0].rawSha256,'2'.repeat(64));
});

test('saved advisory deltas are batched below the count/payload limits and never include source bodies',async t=>{
 const f=await fixture(t),packets=[],current=cache(f,{request:(command,body)=>{packets.push(body);return {id:packets.length,promise:Promise.resolve({code:0,passed:true,accepted:body.updates.map(value=>value.path),stale:[]})};}});
 await current.load();for(const relative of sameShardPaths('project/Fish',129)){const uri=pathToFileURL(path.join(f.repository,relative)).href;current.set(uri,{model:{...f.model,uri},rawSha256:f.rawSha256});}await current.flush();
 assert.equal(packets.length,2);assert.deepEqual(packets.map(packet=>packet.updates.length),[128,1]);assert.ok(packets.every(packet=>Buffer.byteLength(JSON.stringify(packet))<=4*1024*1024));
});

test('missing raw byte proof and oversized metadata are explicit failures, never truncated or written with a guessed digest',async t=>{
 const f=await fixture(t),packets=[],errors=[],current=cache(f,{onError:error=>errors.push(error),request:(command,body)=>{packets.push(body);return {id:1,promise:Promise.resolve({code:0,passed:true,accepted:[],stale:[]})};}});
 await current.load();current.set(f.uri,{model:{...f.model,uri:f.uri},stamp:{mtime:1,size:1}});await current.flush();assert.equal(packets.length,0);assert.ok(errors.some(error=>/digest|raw|proof/i.test(error.message)));
 current.set(f.uri,{model:{...f.model,uri:f.uri,classes:[{...f.model.classes[0],members:[{name:'huge',kind:'method',flags:'x'.repeat(2*1024*1024)}]}]},rawSha256:f.rawSha256});await current.flush();assert.equal(packets.length,0);assert.ok(errors.some(error=>/limit|large|size/i.test(error.message)));
});
test('malformed optional browser row is isolated from valid native and other advisory records',async t=>{
 const f=await fixture(t),target=crypto.createHash('sha256').update(f.relative).digest()[0]%32;let bad;
 for(let i=0;!bad;i++){const candidate='project/Broken'+i+'.cls';if(crypto.createHash('sha256').update(candidate).digest()[0]%32===target)bad=candidate;}
 f.header.entries.push({path:bad,blobId:'3'.repeat(40),native:{hash:'3'.repeat(64),shape:'valid-native',extension:'.cls'},browser:{parser,rawSha256:'3'.repeat(64),model:{schema:'Pets',classes:[{name:'Broken',regions:[],members:'invalid-advisory-only'}]}}});
 await fs.writeFile(f.file,JSON.stringify(f.header));const before=await fs.readFile(f.file),errors=[];
 const rows=await cache(f,{onError:error=>errors.push(error)}).load();assert.equal(rows.length,1);assert.equal(rows[0].model.classes[0].name,'Fish');assert.ok(errors.some(error=>/advisory/i.test(error.message)));assert.ok(errors.every(error=>!/initiali[sz]e|refresh/i.test(error.message)));assert.deepEqual(await fs.readFile(f.file),before);
});
test('large COM-style advisory models near 2 MiB remain complete and split before the 4 MiB packet bound',async t=>{
 const f=await fixture(t),packets=[],errors=[],members=Array.from({length:5200},(_,i)=>({name:'automationMethod'+i,kind:'method',start:i*180,selection:i*180+5,bodyStart:i*180+20,signatureEnd:i*180+50,end:i*180+150,returnType:'String',flags:'protected updating',access:2,subaccess:0,updating:true,typeMethod:false,declaration:false,parameters:[{name:'value',type:'String',usage:'constant',length:64},{name:'result',type:'String',usage:'output'}]}));
 const model={schema:'AutomationSchema',parentSchema:'RootSchema',lineStarts:[0,100,200],classes:[{name:'AutomationComponent',kind:'class',start:0,end:5200*180,selection:0,regions:[[0,5200*180]],members}]};
 const expectedBytes=Buffer.byteLength(JSON.stringify(model));assert.ok(expectedBytes>1.9*1024*1024&&expectedBytes<2*1024*1024,'Fixture must stay near the real per-model protocol boundary');
 const current=cache(f,{onError:error=>errors.push(error),request:(command,body)=>{packets.push(body);return {id:packets.length,promise:Promise.resolve({code:0,passed:true,accepted:body.updates.map(value=>value.path),stale:[]})};}});await current.load();
 for(const relative of sameShardPaths('project/Automation',3)){const uri=pathToFileURL(path.join(f.repository,relative)).href;current.set(uri,{rawSha256:f.rawSha256,model:{...model,uri,text:'SOURCE_BODY_MUST_NOT_TRAVEL'.repeat(300000),code:'SOURCE_BODY_MUST_NOT_TRAVEL'}});}
 await current.flush();assert.deepEqual(errors,[]);assert.deepEqual(packets.map(packet=>packet.updates.length),[2,1]);
 for(const packet of packets){const text=JSON.stringify(packet);assert.ok(Buffer.byteLength(text)<=4*1024*1024);assert.ok(!text.includes('SOURCE_BODY_MUST_NOT_TRAVEL'));for(const update of packet.updates){assert.equal(update.model.classes[0].members.length,5200);assert.deepEqual(update.model.classes[0].members.at(-1),members.at(-1));}}
});

test('mixed shared shards expose only advisory rows and retain native resources byte for byte',async t=>{
 const f=await fixture(t),byShard=new Map(),put=row=>{const shard=crypto.createHash('sha256').update(row.path).digest()[0]%32;if(!byShard.has(shard))byShard.set(shard,[]);byShard.get(shard).push(row);};put(f.row);
 for(let i=0;i<96;i++){
  const resource=i%3===0,relative='project/'+(resource?'Resource'+i+'.ddx':'Class'+i+'.cls'),raw=hash('saved '+relative);
  const row={path:relative,blobId:'4'.repeat(40),native:{hash:raw,shape:'native-'+i,extension:resource?'.ddx':'.cls',resourceOwnership:resource?{schema:'Pets',category:'forms'}:undefined}};
  if(!resource)row.browser={parser,rawSha256:raw,model:{...f.model,classes:[{...f.model.classes[0],name:'Class'+i}]}};
  put(row);
 }
 const before=new Map();for(const [shard,entries]of byShard){const file=path.join(f.directory,'v2-'+shard+'.json'),bytes=JSON.stringify({...f.header,entries});await fs.writeFile(file,bytes);before.set(file,Buffer.from(bytes));}
 let calls=0;const current=cache(f,{request:()=>{calls++;throw Error('A read/clean flush cannot submit a writer request');}}),rows=await current.load();assert.equal(rows.length,65);await current.flush();assert.equal(calls,0);
 for(const [file,bytes]of before)assert.deepEqual(await fs.readFile(file),bytes);assert.equal(rows.some(row=>row.uri.endsWith('.ddx')),false);
});
test('native-v2 mode refuses a v1-only cache and never falls back to the legacy disk writer',async t=>{
 const f=await fixture(t);await fs.unlink(f.file);const legacy=path.join(f.directory,'v1-0.json');await fs.writeFile(legacy,JSON.stringify({format:1,root:f.root,parser:'legacy-parser',entries:[]}));const before=await fs.readFile(legacy),errors=[];let calls=0;
 const current=cache(f,{onError:error=>errors.push(error),request:()=>{calls++;throw Error('Missing v2 must not submit an advisory update');}});
 assert.deepEqual(await current.load(),[]);current.set(f.uri,{model:f.model,rawSha256:f.rawSha256});await current.flush();assert.equal(calls,0);assert.ok(errors.some(error=>/initiali[sz]e|refresh/i.test(error.message)));assert.deepEqual(await fs.readdir(f.directory),['v1-0.json']);assert.deepEqual(await fs.readFile(legacy),before);
});
test('advisory-only Jade source reloads from its independent raw proof without becoming native metadata',async t=>{
 const f=await fixture(t);await fs.unlink(f.file);const relative='project/Notes.jade',uri=pathToFileURL(path.join(f.repository,relative)).href,shard=crypto.createHash('sha256').update(relative).digest()[0]%32;
 const row={path:relative,blobId:'5'.repeat(40),rawSha256:f.rawSha256,browser:{parser,rawSha256:f.rawSha256,model:{lineStarts:[0,6],classes:[]}}},file=path.join(f.directory,'v2-'+shard+'.json');await fs.writeFile(file,JSON.stringify({...f.header,entries:[row]}));
 const packets=[],current=cache(f,{request:(command,body)=>{packets.push(body);return {id:1,promise:Promise.resolve({code:0,passed:true,accepted:[relative],stale:[]})};}}),rows=await current.load();
 assert.equal(rows.length,1);assert.equal(rows[0].uri,uri);assert.equal(rows[0].rawSha256,f.rawSha256);assert.equal(rows[0].native,undefined);
 current.delete(uri);await current.flush();assert.deepEqual(packets[0].updates,[{path:relative,rawSha256:f.rawSha256,model:null}]);assert.equal(JSON.parse(await fs.readFile(file)).entries[0].native,undefined);
});

test('a rejected root publishes neither native byte proofs nor writer bindings from otherwise valid shards',async t=>{
 const f=await fixture(t),goodShard=Number(path.basename(f.file).match(/v2-(\d+)/)[1]),badShard=(goodShard+1)%32;
 await fs.writeFile(path.join(f.directory,'v2-'+badShard+'.json'),JSON.stringify({...f.header,nativeVersion:'incompatible-build',entries:[]}));
 const current=cache(f);assert.deepEqual(await current.load(),[]);assert.equal(current.sharedBindings.size,0);assert.equal(current.sharedProofs.size,0,'A failed root must not leak proof state from a shard read before validation completed');
});

test('explicit native refresh invalidation reloads repaired v2 data without inventing stat freshness',async t=>{
 const f=await fixture(t);f.header.nativeVersion='old-build';await fs.writeFile(f.file,JSON.stringify(f.header));const current=cache(f);assert.deepEqual(await current.load(),[]);
 f.header.nativeVersion=version;f.row.browser.model={...f.model,classes:[{...f.model.classes[0],name:'RepairedFish'}]};await fs.writeFile(f.file,JSON.stringify(f.header));assert.deepEqual(await current.load(),[],'Failed cache reads remain explicit repair state until the successful refresh invalidates them');
 current.invalidate();const rows=await current.load();assert.equal(rows[0].model.classes[0].name,'RepairedFish');assert.equal(rows[0].stamp,undefined,'Native raw identity must not be disguised as a valid mtime/size stamp');
});

test('real parser navigation/type metadata roundtrips while raw UTF16 proof and scratch bodies stay separate',async t=>{
 const {parseSource}=require('../../extension/src/source_symbols'),f=await fixture(t);
 const source=await fs.readFile(path.join(__dirname,'fixtures/BrowserMetadata.cls'),'utf8');
 const parsed=parseSource(source,f.uri),raw=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(source,'utf16le')]),rawSha256=hash(raw);f.row.native.hash=rawSha256;f.row.browser.rawSha256=rawSha256;await fs.writeFile(f.file,JSON.stringify(f.header));let packet;
 const current=cache(f,{request:(command,body)=>{packet=body;return {id:1,promise:Promise.resolve({code:0,passed:true,accepted:[f.relative],stale:[]})};}});await current.load();current.set(f.uri,{model:parsed,rawSha256});await current.flush();
 const update=packet.updates[0],expected=JSON.parse(JSON.stringify({...parsed,text:'',code:'',excluded:[]}));assert.equal(update.rawSha256,hash(raw));assert.notEqual(update.rawSha256,hash(source));assert.deepEqual({...update.model,uri:f.uri,text:'',code:'',excluded:[]},expected);assert.ok(!JSON.stringify(packet).includes('BODY_MUST_NOT_COPY'));
});
test('shared headers require an absolute owning-root identity rather than a cwd-relative alias',async t=>{
 const f=await fixture(t),errors=[];f.header.root=path.relative(process.cwd(),f.root);await fs.writeFile(f.file,JSON.stringify(f.header));assert.deepEqual(await cache(f,{onError:error=>errors.push(error)}).load(),[]);assert.ok(errors.some(error=>/initiali[sz]e|refresh/i.test(error.message)));
});
test('advisory packets group by owning root and existing shard while retaining every saved record',async t=>{
 const f=await fixture(t),other=path.join(f.repository,'other'),directory=path.join(other,'.jade/source-index');await fs.mkdir(directory,{recursive:true});
 const relative='other/Fish.cls',row={...f.row,path:relative};await fs.writeFile(path.join(directory,'v2-'+shardOf(relative)+'.json'),JSON.stringify({...f.header,root:other,entries:[row]}));
 const original=await fs.readFile(f.file),packets=[],expected=[];
 const current=cache(f,{roots:()=>[f.root,other],request:(command,body)=>{packets.push(body);return{id:packets.length,promise:Promise.resolve({code:0,passed:true,accepted:body.updates.map(row=>row.path),stale:[]})};}});await current.load();
 for(let i=0;i<96;i++){const relative=(i%2?'project':'other')+'/Class'+i+'.cls',uri=pathToFileURL(path.join(f.repository,relative)).href;expected.push(relative);current.set(uri,{model:f.model,rawSha256:f.rawSha256});}
 await current.flush();assert.deepEqual(packets.flatMap(packet=>packet.updates.map(row=>row.path)).sort(),expected.sort());
 for(const packet of packets){assert.equal(new Set(packet.updates.map(row=>shardOf(row.path))).size,1,'Each batch must touch only its existing native shard');assert.ok(packet.updates.every(row=>row.path.startsWith(packet.root===other?'other/':'project/')));}
 assert.equal(packets.length,new Set(expected.map(relative=>(relative.startsWith('other/')?other:f.root)+':'+shardOf(relative))).size);assert.deepEqual(await fs.readFile(f.file),original);
});
test('a new saved raw digest is submitted for native target validation without an old-hash gate',async t=>{
 const f=await fixture(t),packets=[],current=cache(f,{request:(command,body)=>{packets.push(body);return{id:1,promise:Promise.resolve({code:0,passed:true,accepted:[f.relative],stale:[]})};}});await current.load();
 const changed=hash('new saved file bytes');current.set(f.uri,{model:{...f.model,classes:[{...f.model.classes[0],name:'ChangedFish'}]},rawSha256:changed});await current.flush();assert.equal(packets.length,1);assert.equal(packets[0].updates[0].rawSha256,changed);assert.equal(packets[0].updates[0].model.classes[0].name,'ChangedFish');
});
test('Windows URI aliases use one canonical Git path and the latest accepted saved proof', {skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t),packets=[],variant=pathToFileURL(path.join(f.root,'FISH.CLS')).href,newHash=hash('new saved bytes'),current=cache(f,{request:(command,body)=>{packets.push(body);return{id:packets.length,promise:Promise.resolve({code:0,passed:true,accepted:body.updates.map(row=>row.path),stale:[]})};}});await current.load();
 current.set(variant,{model:f.model,rawSha256:f.rawSha256});current.set(f.uri,{model:f.model,rawSha256:newHash});await current.flush();
 assert.equal(packets.length,1);assert.equal(packets[0].updates.length,1,'URI case aliases must coalesce into one saved update');assert.equal(packets[0].updates[0].path,f.relative);assert.equal(packets[0].updates[0].rawSha256,newHash);
 current.delete(variant);await current.flush();assert.deepEqual(packets[1].updates,[{path:f.relative,rawSha256:newHash,model:null}]);
});
test('an old alias acknowledgement cannot publish its raw proof over a newer pending generation',{skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t),packets=[],gates=[],variant=pathToFileURL(path.join(f.root,'FISH.CLS')).href,newest=hash('newest saved bytes');
 const current=cache(f,{request:(command,body)=>{packets.push(body);if(packets.length>2)return{id:packets.length,promise:Promise.resolve({code:0,passed:true,accepted:body.updates.map(row=>row.path),stale:[]})};return{id:packets.length,promise:new Promise(resolve=>gates.push(resolve))};}});await current.load();
 const waitFor=async count=>{const deadline=Date.now()+1000;while(gates.length<count&&Date.now()<deadline)await new Promise(setImmediate);assert.equal(gates.length,count);};
 current.set(variant,{model:f.model,rawSha256:hash('older saved bytes')});const running=current.flush();
 try{await waitFor(1);current.set(f.uri,{model:f.model,rawSha256:newest});gates[0]({code:0,passed:true,accepted:[f.relative],stale:[]});await waitFor(2);assert.equal(current.sharedProofs.get(f.uri.toLowerCase()).rawSha256,f.rawSha256,'Old acknowledgement must not replace the proof for the newer queued save');gates[1]({code:0,passed:true,accepted:[f.relative],stale:[]});await running;current.delete(variant);await current.flush();assert.equal(packets[2].updates[0].rawSha256,newest);assert.equal(packets[2].updates[0].path,f.relative);}
 finally{for(const done of gates)done({code:0,passed:true,accepted:[f.relative],stale:[]});await running;}
});
test('an alias save queued before lazy cache loading still uses the later validated canonical Git path',{skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t),packets=[],variant=pathToFileURL(path.join(f.root,'FISH.CLS')).href,current=cache(f,{request:(command,body)=>{packets.push(body);return{id:1,promise:Promise.resolve({code:0,passed:true,accepted:body.updates.map(row=>row.path),stale:[]})};}});
 current.set(variant,{model:f.model,rawSha256:hash('new saved bytes')});await current.flush();assert.equal(packets[0].updates[0].path,f.relative);
});
