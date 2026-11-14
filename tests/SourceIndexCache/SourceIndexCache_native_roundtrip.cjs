'use strict';
// Developer-only scenario. The caller supplies the real, reviewed native refresh
// endpoint once available; no mock refresh and no product activation live here.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {OwnedCliFixture}=require('../../test/OwnedCliFixture');
const {SourceIndexCache}=require('../../extension/src/SourceIndexCache');
const {parseSource}=require('../../extension/src/source_symbols');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function diskRows(directory){
 const files=(await fs.readdir(directory)).filter(name=>/^v2-\d+\.json$/.test(name)),rows=[];let nativeVersion;
 assert.ok(files.length,'Native refresh must create the shared v2 index');
 for(const name of files){const data=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));assert.equal(data.format,2);nativeVersion??=data.nativeVersion;assert.equal(data.nativeVersion,nativeVersion);rows.push(...data.entries);}
 assert.equal(typeof nativeVersion,'string');assert.ok(nativeVersion.length);return{rows,nativeVersion};
}
async function runNativeBrowserRoundtrip({entry,refresh}){
 assert.ok(path.isAbsolute(entry)&&/\.exe$/i.test(entry),'An explicit candidate native CLI is required');assert.equal(typeof refresh,'function','Supply the reviewed real refresh endpoint');
 return new OwnedCliFixture({entry}).run(async({root:temporary,session})=>{
  const repository=path.join(temporary,'repository'),root=path.join(repository,'project');await fs.mkdir(root,{recursive:true});
  const git=spawnSync('git',['init','--quiet',repository],{windowsHide:true,encoding:'utf8'});assert.equal(git.status,0,git.stderr);
  const source=await fs.readFile(path.join(__dirname,'fixtures/BrowserMetadata.cls'),'utf8'),bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(source,'utf16le')]);
  const file=path.join(root,'BrowserMetadata.cls'),uri=pathToFileURL(file).href,relative='project/BrowserMetadata.cls',rawSha256=hash(bytes);await fs.writeFile(file,bytes);
  await refresh(session,root);
  const directory=path.join(root,'.jade/source-index'),before=await diskRows(directory),nativeBefore=before.rows.map(({browser,...row})=>row);
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
  await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('\r\n','utf16le')]));cache.set(uri,{model:parsed,rawSha256});await cache.flush();assert.ok(errors.some(error=>/stale/i.test(error.message)),'Native writer must reject the old raw-byte proof');
  return{passed:true,unbornRepository:true,workspaceSubdirectory:true,rawEncoding:'utf16le-bom',nativeVersion:before.nativeVersion,roundtripMetadata:true,nativeRowsUnchanged:true,staleProofRejected:true,sourceBodiesPersisted:false};
 });
}
module.exports={runNativeBrowserRoundtrip};
