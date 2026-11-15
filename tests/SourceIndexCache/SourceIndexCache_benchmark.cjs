'use strict';
if(!process.argv.includes('--execute')){console.log('SKIP: pass --execute to create an owned 30000-file filesystem fixture.');process.exit(0);}
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const rootRepo=path.resolve(__dirname,'../..'),{SourceIndex}=require(path.join(rootRepo,'extension/src/workspace-index')),{SourceIndexCache}=require(path.join(rootRepo,'extension/src/SourceIndexCache'));
const {SourceIndex:Baseline}=require(process.env.JADE_INDEX_BASELINE_MODULE||path.join(rootRepo,'extension/src/workspace-index'));
const count=30000;require('node:fs').mkdirSync(path.join(rootRepo,'build/object-explorer'),{recursive:true});
const source=i=>`jadeVersionNumber "25.0.02";\nschemaDefinition\nS${i%100} subschemaOf RootSchema partialDefinition;\ntypeHeaders\nC${i} subclassOf Object transient;\ntypeDefinitions\nC${i} completeDefinition\n(\nattributeDefinitions\n value: String[100];\njadeMethodDefinitions\n`+Array.from({length:8},(_,j)=>' method'+j+'() : String;\n').join('')+`)\ntypeSources\nC${i} (\njadeMethodSources\n`+Array.from({length:8},(_,j)=>`method${j}\n{\nmethod${j}() : String;\nbegin\n return "native-style example";\nend;\n}\n`).join('')+')\n';
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'jade-object-index-bench-'));let current;
 try{
  for(let i=0;i<100;i++)await fs.mkdir(path.join(root,'schemas','S'+i,'types'),{recursive:true});
  const files=Array.from({length:count},(_,i)=>path.join(root,'schemas','S'+(i%100),'types','C'+i+'.cls')),uris=files.map(file=>pathToFileURL(file).href);let next=0;
  await Promise.all(Array.from({length:16},async()=>{while(next<count){const i=next++;await fs.writeFile(files[i],source(i));}}));
  const list=async()=> (await fs.readdir(root,{recursive:true})).filter(name=>name.endsWith('.cls')).map(name=>pathToFileURL(path.join(root,name)).href);
  const runOld=async()=>{let reads=0;const index=new Baseline({list,read:async uri=>{reads++;return fs.readFile(new URL(uri),'utf8');}});const start=performance.now();await index.ready();const ms=performance.now()-start;assert.equal(index.records.size,count);index.dispose();return {ms,reads};};
  const first=await runOld();global.gc?.();const repeat=await runOld();global.gc?.();
  let reads=0;const cache=new SourceIndexCache({roots:()=>[root]});current=new SourceIndex({list,read:async uri=>{reads++;return fs.readFile(new URL(uri),'utf8');},stat:async uri=>{const s=await fs.stat(new URL(uri));return {mtime:s.mtimeMs,size:s.size};},cache});
  let start=performance.now();await current.ready();const buildMs=performance.now()-start;start=performance.now();await current.persist();const saveMs=performance.now()-start;assert.equal(reads,count);current.dispose();current=null;global.gc?.();
  const directory=path.join(root,'.jade','source-index'),cacheFiles=(await fs.readdir(directory)).filter(name=>name.endsWith('.json'));let cacheBytes=0;for(const file of cacheFiles)cacheBytes+=(await fs.stat(path.join(directory,file))).size;
  reads=0;current=new SourceIndex({list,read:async uri=>{reads++;return fs.readFile(new URL(uri),'utf8');},stat:async uri=>{const s=await fs.stat(new URL(uri));return {mtime:s.mtimeMs,size:s.size};},cache:new SourceIndexCache({roots:()=>[root]})});
  start=performance.now();await current.browserReady();const browseMs=performance.now()-start;assert.equal(current.records.size,count);const availableBeforeValidation=current.status.phase!=='ready';start=performance.now();await current.ready();const validationMs=performance.now()-start;assert.equal(reads,0);await current.persist();
  const receipt={platform:process.platform,node:process.version,files:count,methodsPerFile:8,sourceBytes:files.length*Buffer.byteLength(source(15000)),baselineFirstFullRebuild:first,baselineRepeatFullRebuild:repeat,initialCacheBuildMs:buildMs,cacheSaveMs:saveMs,cachedBrowseMs:browseMs,remainingValidationMs:validationMs,warmSourceReads:reads,cachedRowsBeforeValidation:availableBeforeValidation,cacheShards:cacheFiles.length,cacheBytes,rssMiB:process.memoryUsage().rss/1048576,limitations:'Generated native-style CLS files on local Windows filesystem; Node benchmark excludes VS Code IPC/UI, enterprise security policy and customer file sizes. Baseline repeat and cached runs use warm OS filesystem caches; no native JADE database/extraction performance claim.'};
  await fs.writeFile(path.join(rootRepo,'build/object-explorer/filesystem-benchmark.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
 }finally{
  if(current){await current.persist();current.dispose();}
  const resolved=await fs.realpath(root);if(path.dirname(resolved)!==await fs.realpath(os.tmpdir())||!path.basename(resolved).startsWith('jade-object-index-bench-'))throw Error('Fixture cleanup ownership mismatch');await fs.rm(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});