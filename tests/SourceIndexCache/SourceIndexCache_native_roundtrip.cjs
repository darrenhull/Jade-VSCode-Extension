'use strict';
// Developer-only scenario. The caller supplies the real, reviewed native refresh
// endpoint once available; no mock refresh and no product activation live here.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {OwnedCliFixture}=require('../../test/OwnedCliFixture');
const {SourceIndexCache}=require('../../extension/src/SourceIndexCache');
const {parseSource}=require('../../extension/src/source_symbols');
const {registerLanguageTools}=require('../../extension/src/language-tools');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function diskRows(directory){
 const files=(await fs.readdir(directory)).filter(name=>/^v2-\d+\.json$/.test(name)),rows=[];let nativeVersion;
 assert.ok(files.length,'Native refresh must create the shared v2 index');
 for(const name of files){const data=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));assert.equal(data.format,2);nativeVersion??=data.nativeVersion;assert.equal(data.nativeVersion,nativeVersion);rows.push(...data.entries);}
 assert.equal(typeof nativeVersion,'string');assert.ok(nativeVersion.length);return{rows,nativeVersion};
}
async function runNativeBrowserRoundtrip({entry,refresh}){
 assert.ok(path.isAbsolute(entry)&&/\.exe$/i.test(entry),'An explicit candidate native CLI is required');assert.equal(typeof refresh,'function','Supply the reviewed real refresh endpoint');
 const fixture=new OwnedCliFixture({entry});let stage,brokerPID;
 const receipt=await fixture.run(async({root:temporary,stateDirectory,session})=>{
  stage=temporary;
  const repository=path.join(temporary,'repository'),root=path.join(repository,'project');await fs.mkdir(root,{recursive:true});
  const git=spawnSync('git',['init','--quiet',repository],{windowsHide:true,encoding:'utf8'});assert.equal(git.status,0,git.stderr);
  const source=await fs.readFile(path.join(__dirname,'fixtures/BrowserMetadata.cls'),'utf8'),bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(source,'utf16le')]);
  const file=path.join(root,'BrowserMetadata.cls'),uri=pathToFileURL(file).href,relative='project/BrowserMetadata.cls',rawSha256=hash(bytes);await fs.writeFile(file,bytes);
  await refresh(session,root);
  const capability=await session.request('doctor',{config:{workspaceRoots:[root]}}).promise;
  assert.equal(capability.capabilities?.sourceIndex?.format,2,JSON.stringify(capability));assert.equal(capability.capabilities.sourceIndex.databaseRequired,false);
  const beforeStatus=await session.request('status').promise;brokerPID=beforeStatus.brokerPID;assert.ok(Number.isSafeInteger(brokerPID)&&brokerPID>0);
  const alias=spawnSync(entry,['source','refresh','--workspace',root,'--json'],{windowsHide:true,encoding:'utf8',timeout:30000,env:{...process.env,JADE_TOOLS_STATE_DIRECTORY:stateDirectory,JADE_TOOLS_CONNECTIONS_FILE:path.join(temporary,'connections.json')}});
  assert.ifError(alias.error);assert.equal(alias.status,0,alias.stderr||alias.stdout);const aliasResult=JSON.parse(alias.stdout);assert.equal(aliasResult.passed,true,alias.stdout);assert.equal(aliasResult.cache?.format,2);
  assert.equal((await session.request('status').promise).brokerPID,brokerPID,'Terminal alias must use the same isolated broker');
  const directory=path.join(root,'.jade/source-index'),before=await diskRows(directory),nativeBefore=before.rows.map(({browser,...row})=>row);
  assert.equal(before.nativeVersion,capability.capabilities.sourceIndex.nativeVersion);
  assert.equal(before.rows.find(row=>row.path===relative)?.native?.hash,rawSha256);
  const errors=[],packets=[],request=(command,body)=>{const pending=session.request(command,body);packets.push({command,body});return pending;};
  const cache=new SourceIndexCache({roots:()=>[root],nativeVersion:before.nativeVersion,request,onError:error=>errors.push(error)});
  await cache.load();const parsed=parseSource(source,uri);cache.set(uri,{model:parsed,rawSha256});await cache.flush();assert.deepEqual(errors,[]);
  assert.equal(packets.length,1);assert.equal(packets[0].command,'source.index.browser.update');assert.ok(!JSON.stringify(packets[0]).includes('BODY_MUST_NOT_COPY'));
  const after=await diskRows(directory);assert.deepEqual(after.rows.map(({browser,...row})=>row),nativeBefore,'Advisory writer modified native inventory');
  const reloaded=await new SourceIndexCache({roots:()=>[root],nativeVersion:before.nativeVersion}).load(),row=reloaded.find(row=>row.uri===uri);
  assert.ok(row);assert.equal(row.rawSha256,rawSha256);assert.deepEqual(row.model,JSON.parse(JSON.stringify({...parsed,text:'',code:'',excluded:[]})));
  const nativeBrowser=after.rows.find(row=>row.path===relative).browser;assert.ok(!JSON.stringify(nativeBrowser).includes('BODY_MUST_NOT_COPY'));
  assert.equal(row.model.classes[0].members.find(member=>member.name==='run').typeMethod,true);assert.equal(row.model.classes[0].members.find(member=>member.name==='run').updating,true);
  const changedBytes=Buffer.concat([bytes,Buffer.from('\r\n','utf16le')]),changedText=source+'\r\n';await fs.writeFile(file,changedBytes);cache.set(uri,{model:parsed,rawSha256});await cache.flush();assert.ok(errors.some(error=>/stale/i.test(error.message)),'Native writer must reject the old raw-byte proof');
  const previousErrors=errors.length,newHash=hash(changedBytes),changedModel=parseSource(changedText,uri);cache.set(uri,{model:changedModel,rawSha256:newHash});await cache.flush();assert.equal(errors.length,previousErrors,'Matching new saved bytes must refresh only the target row and persist the browser update');
  const changedDisk=await diskRows(directory);assert.equal(changedDisk.rows.find(row=>row.path===relative)?.native?.hash,newHash);
  const direct=await session.request('source.index.browser.update',{root,parser:packets[0].body.parser,updates:[{...packets.at(-1).body.updates[0],path:'project/BROWSERMETADATA.CLS'}]}).promise;
  assert.equal(direct.passed,true,JSON.stringify(direct));assert.equal(direct.stale.length,0);assert.equal((await diskRows(directory)).rows.length,changedDisk.rows.length,'Direct native case-alias packet must not create a duplicate row');
  const variant=pathToFileURL(path.join(root,'BROWSERMETADATA.CLS')).href;cache.set(variant,{model:changedModel,rawSha256:newHash});await cache.flush();assert.equal(errors.length,previousErrors,'Windows URI case variants must not be rejected as stale');
  const variantDisk=await diskRows(directory);assert.equal(variantDisk.rows.length,changedDisk.rows.length,'Windows URI case must not create a duplicate cache row');assert.equal(variantDisk.rows.filter(row=>row.path.toLowerCase()===relative.toLowerCase()).length,1);
  const newText=source.replace(/\bFish\b/g,'NewFish'),newBytes=Buffer.from(newText),newRelative='project/NewFish.cls',newUri=pathToFileURL(path.join(root,'NEWFISH.CLS')).href;
  await fs.writeFile(path.join(root,'NewFish.cls'),newBytes);cache.set(newUri,{model:parseSource(newText,newUri),rawSha256:hash(newBytes)});await cache.flush();assert.equal(errors.length,previousErrors);assert.equal(cache.sharedProofs.get(newUri.toLowerCase()).path,newRelative,'New alias must retain native canonical spelling from its accepted ACK');
  const newDisk=await diskRows(directory);assert.equal(newDisk.rows.length,variantDisk.rows.length+1);assert.ok(newDisk.rows.find(row=>row.path===newRelative)?.browser);
  cache.delete(newUri);await cache.flush();assert.equal(errors.length,previousErrors);assert.equal(packets.at(-1).body.updates[0].path,newRelative);assert.equal(packets.at(-1).body.updates[0].model,null);
  const cleared=await diskRows(directory),clearedRow=cleared.rows.find(row=>row.path===newRelative);assert.ok(clearedRow?.native);assert.equal(clearedRow.browser,undefined,'Unknown-alias save/delete must not strand advisory metadata');assert.equal(cleared.rows.length,newDisk.rows.length);
  const commands=[],originalRequest=session.request.bind(session);session.request=(...args)=>{commands.push(args[0]);return originalRequest(...args);};
  const noop=()=>({dispose(){}}),resource=value=>({scheme:'file',fsPath:value,toString:()=>pathToFileURL(value).href}),folder={uri:resource(root)},messages=[];
  const vscode={CompletionItemKind:{Class:1,Property:2,Method:3,Variable:4,Keyword:5},languages:new Proxy({},{get:()=>noop}),window:{createOutputChannel:()=>({appendLine:line=>messages.push(line),dispose(){}})},Uri:{file:resource,parse:value=>resource(require('node:url').fileURLToPath(value))},workspace:{workspaceFolders:[folder],textDocuments:[],getWorkspaceFolder:()=>folder,findFiles:async()=>assert.fail('Activated shared mode must not rediscover sources through VS Code'),fs:{readFile:uri=>fs.readFile(uri.fsPath)},createFileSystemWatcher:()=>({dispose(){},onDidCreate:noop,onDidChange:noop,onDidDelete:noop}),onDidOpenTextDocument:noop,onDidChangeTextDocument:noop,onDidCloseTextDocument:noop,onDidChangeWorkspaceFolders:noop,onDidChangeConfiguration:noop}};
  const language=registerLanguageTools(vscode,{subscriptions:[]},{client:session});
  try{await language.index.ready();await language.index.persist();assert.equal(commands.filter(value=>value==='doctor').length,1);assert.equal(language.index.records.size,2);language.index.document({uri:resource(file),version:2,isDirty:true,getText:()=>source.replace(/\bFish\b/g,'UnsavedFish')});await language.refreshSourceIndex(folder);assert.equal(language.index.records.get(uri).model.classes[0].name,'UnsavedFish');assert.equal(hash(await fs.readFile(file)),newHash);assert.equal(commands.filter(value=>value==='source.index.refresh').length,1);assert.equal(commands.includes('source.index.prepare'),false);assert.ok((await fs.readdir(directory)).every(name=>!name.startsWith('v1-')));assert.ok(messages.some(line=>/Shared source index refreshed/.test(line)));}
  finally{await language.index.persist();language.index.dispose();}
  return{passed:true,unbornRepository:true,workspaceSubdirectory:true,rawEncoding:'utf16le-bom',nativeVersion:before.nativeVersion,roundtripMetadata:true,nativeRowsUnchanged:true,staleProofRejected:true,matchingSavedEditAccepted:true,windowsUriCaseStable:true,newAliasConditionalClear:true,sourceBodiesPersisted:false,terminalAlias:true,sameIsolatedBroker:true,realLanguageActivation:true,lazyCapabilityWithoutLegacyWrites:true,noFrontendDiscovery:true,noSeparateNativePrepare:true,explicitRefreshOnce:true,dirtyEditorRetained:true};
 });
 assert.equal(await fs.stat(stage).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}),false,'Owned fixture directory remains after shutdown');
 assert.throws(()=>process.kill(brokerPID,0),error=>error.code==='ESRCH','Owned broker must actually exit before cleanup');
 return{...receipt,ownedBrokerExited:true,ownedArtifactsRemoved:true};
}
module.exports={runNativeBrowserRoundtrip};
