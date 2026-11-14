'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{fileURLToPath}=require('node:url');
const SHARDS=32,MAX_BYTES=32*1024*1024,FORMAT=1;
const PARSER=crypto.createHash('sha256');for(const name of ['source_symbols.js','source-lex.js','source-context.js'])PARSER.update(require('node:fs').readFileSync(path.join(__dirname,name)));const PARSER_ID=PARSER.digest('hex');
const key=value=>process.platform==='win32'?value.toLowerCase():value;
const within=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
const SHARED_PACKET_BYTES=4*1024*1024,SHARED_MODEL_BYTES=2*1024*1024,SHARED_BATCH=128;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const relativePath=value=>typeof value==='string'&&value.length<=32768&&!/[\\\x00-\x1f\x7f:]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
function browserModel(model){
 if(!model||!Array.isArray(model.classes))throw Error('Invalid advisory browsing metadata.');
 const copy=(value,fields)=>Object.fromEntries(fields.filter(field=>value[field]!==undefined).map(field=>{
  const item=value[field];if(!['string','number','boolean'].includes(typeof item)||typeof item==='number'&&(!Number.isSafeInteger(item)||item<0))throw Error('Invalid advisory metadata scalar.');return [field,item];
 }));
 const positions=value=>{if(!Array.isArray(value)||value.some(item=>!Number.isSafeInteger(item)||item<0))throw Error('Invalid advisory source positions.');return [...value];};
 const result=copy(model,['schema','parentSchema']);if(model.lineStarts!==undefined)result.lineStarts=positions(model.lineStarts);
 result.classes=model.classes.map(cls=>{
  if(!cls||typeof cls.name!=='string'||!Array.isArray(cls.members)||!Array.isArray(cls.regions))throw Error('Invalid advisory class metadata.');
  const value=copy(cls,['name','parent','kind','partial','start','end','selection']);
  value.regions=cls.regions.map(region=>{const pair=positions(region);if(pair.length!==2)throw Error('Invalid advisory class region.');return pair;});
  value.members=cls.members.map(member=>{
   if(!member||typeof member.name!=='string'||typeof member.kind!=='string')throw Error('Invalid advisory member metadata.');
   const value=copy(member,['name','kind','type','length','precision','scale','access','subaccess','start','end','selection','declaration','bodyStart','signatureEnd','returnType','flags','typeMethod','updating']);
   if(member.parameters!==undefined){if(!Array.isArray(member.parameters))throw Error('Invalid advisory parameters.');value.parameters=member.parameters.map(parameter=>copy(parameter,['name','type','length','usage','selection']));}return value;
  });return value;
 });return result;
}
/** Disposable browsing metadata. Never a source/build/publish authority. */
class SourceIndexCache{
 constructor({roots,onError=()=>{},nativeVersion,request,parserId=PARSER_ID}){this.roots=roots;this.onError=onError;this.buckets=new Map();this.dirty=new Set();this.changed=new Set();this.writing=Promise.resolve();this.reported=new Set();this.nativeVersion=nativeVersion;this.request=request;this.parserId=parserId;this.sharedBindings=new Map();this.sharedProofs=new Map();this.sharedPending=new Map();this.sharedGeneration=0;}
 report(error){if(!this.reported.has(error.message)){this.reported.add(error.message);try{this.onError(error);}catch{}}}
 location(uri){
  try{
   if(typeof uri!=='string'||uri.length>32768)return;
   const file=fileURLToPath(uri),roots=this.roots().map(root=>path.resolve(root)).sort((a,b)=>b.length-a.length);
   const root=roots.find(value=>within(value,file));if(!root)return;
   const relative=path.relative(root,file),parts=relative.split(path.sep).map(key);
   if(parts.some(value=>['.jade','.git','node_modules'].includes(value))||!(/\.(cls|jade)$/i.test(file)||/^schemaDefinitions\.sec$/i.test(path.basename(file))))return;
   return {root,shard:crypto.createHash('sha256').update(uri).digest()[0]%SHARDS};
  }catch{return;}
 }
 bucket(root,shard){const id=JSON.stringify([root,shard]);if(!this.buckets.has(id))this.buckets.set(id,{root,shard,entries:new Map()});return [id,this.buckets.get(id)];}
 valid(entry){
  const optionalString=value=>value===undefined||typeof value==='string';
  return entry&&typeof entry.uri==='string'&&entry.stamp&&Number.isFinite(entry.stamp.mtime)&&Number.isFinite(entry.stamp.size)&&entry.stamp.size>=0&&entry.model&&entry.model.uri===entry.uri&&optionalString(entry.model.schema)&&optionalString(entry.model.parentSchema)&&Array.isArray(entry.model.classes)&&entry.model.classes.every(cls=>cls&&typeof cls.name==='string'&&optionalString(cls.parent)&&Array.isArray(cls.regions)&&cls.regions.every(region=>Array.isArray(region)&&region.length===2&&region.every(Number.isFinite))&&Array.isArray(cls.members)&&cls.members.every(member=>member&&typeof member.name==='string'&&typeof member.kind==='string'&&(member.parameters===undefined||Array.isArray(member.parameters))))&&(entry.model.lineStarts===undefined||Array.isArray(entry.model.lineStarts)&&entry.model.lineStarts.every(Number.isFinite));
 }
 async directory(root,create){
  let current=root;
  for(const part of ['.jade','source-index']){
   current=path.join(current,part);let stat;
   try{stat=await fs.lstat(current);}catch(error){if(error.code!=='ENOENT')throw error;if(!create)return;try{await fs.mkdir(current);}catch(error){if(error.code!=='EEXIST')throw error;}stat=await fs.lstat(current);}
   if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Workspace index directory must be an ordinary directory.');
   if(create)try{await fs.writeFile(path.join(current,'.gitignore'),'# Disposable Jade Tools cache\n*\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  }
  return current;
 }
 async load(){
  if(this.nativeVersion!==undefined)return this.loadShared();
  const result=[];
  for(const root of this.roots().map(value=>path.resolve(value))){
   let directory;try{directory=await this.directory(root,false);}catch(error){this.report(error);continue;}if(!directory)continue;
   let next=0;
   await Promise.all(Array.from({length:4},async()=>{while(next<SHARDS){const shard=next++,file=path.join(directory,'v'+FORMAT+'-'+shard+'.json');try{
    const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_BYTES)continue;
    const data=JSON.parse(await fs.readFile(file,'utf8'));if(data.format!==FORMAT||data.parser!==PARSER_ID||typeof data.root!=='string'||key(data.root)!==key(root)||!Array.isArray(data.entries)||data.entries.length>20000)continue;
    for(const entry of data.entries){const location=this.location(entry?.uri);if(this.changed.has(entry.uri)||!this.valid(entry)||!location||key(location.root)!==key(root)||location.shard!==shard)continue;
     const value={uri:entry.uri,stamp:entry.stamp,model:{...entry.model,text:'',code:'',excluded:[]}};this.bucket(root,shard)[1].entries.set(entry.uri,value);result.push(value);
    }
   }catch(error){if(error.code!=='ENOENT')this.report(error);}}}));
  }
  return result;
 }
 set(uri,record){if(this.nativeVersion!==undefined)return this.setShared(uri,record);const location=this.location(uri),entry={uri,model:record.model,stamp:record.stamp};if(!location||!this.valid(entry))return;const [id,bucket]=this.bucket(location.root,location.shard);bucket.entries.set(uri,entry);this.changed.add(uri);this.dirty.add(id);}
 delete(uri){if(this.nativeVersion!==undefined)return this.deleteShared(uri);const location=this.location(uri);if(!location)return;const [id,bucket]=this.bucket(location.root,location.shard);bucket.entries.delete(uri);this.changed.add(uri);this.dirty.add(id);}
 flush(){
  if(this.nativeVersion!==undefined)return this.flushShared();
  this.writing=this.writing.then(async()=>{
   while(this.dirty.size){const ids=[...this.dirty];this.dirty.clear();
    for(const id of ids){const bucket=this.buckets.get(id);if(!bucket)continue;let temporary;
     try{const directory=await this.directory(bucket.root,true),file=path.join(directory,'v'+FORMAT+'-'+bucket.shard+'.json');
      const body=JSON.stringify({format:FORMAT,parser:PARSER_ID,root:bucket.root,entries:[...bucket.entries.values()]});if(Buffer.byteLength(body)>MAX_BYTES)throw Error('Workspace index shard exceeds its disposable cache limit.');
      try{const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw Error('Workspace index target is not an ordinary file.');}catch(error){if(error.code!=='ENOENT')throw error;}
      temporary=path.join(directory,'.write-'+crypto.randomUUID()+'.tmp');await fs.writeFile(temporary,body,{flag:'wx'});await fs.rename(temporary,file);temporary=undefined;
     }catch(error){this.report(error);}finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
    }
   }
  }).catch(error=>this.report(error));return this.writing;
 }
 async loadShared(){
  if(this.sharedReading)return this.sharedReading;
  const generation=this.sharedGeneration;
  this.sharedReading=(async()=>{
   const result=[];
   for(const root of this.roots().map(value=>path.resolve(value))){
    const rows=[],proofs=new Map();let binding,invalid=false,found=false,next=0;
    try{
     const directory=await this.directory(root,false);if(!directory)throw Error('Shared source index is missing.');
     await Promise.all(Array.from({length:4},async()=>{while(next<SHARDS){const shard=next++,file=path.join(directory,'v2-'+shard+'.json');try{
      const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_BYTES)throw Error('Shared source index shard is invalid.');
      const data=JSON.parse(await fs.readFile(file,'utf8'));
      if(data.format!==2||typeof data.root!=='string'||!path.isAbsolute(data.root)||key(path.resolve(data.root))!==key(root)||typeof data.repository!=='string'||!path.isAbsolute(data.repository)||!(key(path.resolve(data.repository))===key(root)||within(path.resolve(data.repository),root))||!['sha1','sha256'].includes(data.objectFormat)||data.nativeVersion!==this.nativeVersion||!Array.isArray(data.entries)||data.entries.length>20000)throw Error('Shared source index binding/version is invalid.');
      const current={root,repository:path.resolve(data.repository),objectFormat:data.objectFormat};
      if(binding&&(key(binding.repository)!==key(current.repository)||binding.objectFormat!==current.objectFormat))throw Error('Shared source index shards disagree.');binding=current;found=true;
      for(const row of data.entries){
       if(!relativePath(row?.path)||crypto.createHash('sha256').update(row.path).digest()[0]%SHARDS!==shard||typeof row.blobId!=='string'||!(data.objectFormat==='sha1'?/^[a-f0-9]{40}$/i:/^[a-f0-9]{64}$/i).test(row.blobId))continue;
       const rawSha256=row.native===undefined&&/\.jade$/i.test(row.path)?row.rawSha256:row.native?.hash;if(!digest(rawSha256))continue;
       const file=path.resolve(current.repository,...row.path.split('/'));if(!within(root,file))continue;const uri=require('node:url').pathToFileURL(file).href,location=this.location(uri);if(!location||key(location.root)!==key(root))continue;
       proofs.set(uri,{root,rawSha256});
       if(this.changed.has(uri)||row.browser?.parser!==this.parserId||row.browser.rawSha256!==rawSha256)continue;
       try{const model=browserModel(row.browser.model);rows.push({uri,rawSha256,model:{...model,uri,text:'',code:'',excluded:[]}});}catch(error){this.report(Error('Invalid optional advisory metadata was ignored: '+error.message));}
      }
     }catch(error){if(error.code!=='ENOENT')invalid=true;}}}));
     if(invalid||!found||!binding)throw Error('Shared source index is missing, corrupt or incompatible.');
     if(generation!==this.sharedGeneration)return [];
     this.sharedBindings.set(key(root),binding);for(const [uri,proof]of proofs)this.sharedProofs.set(uri,proof);result.push(...rows);
    }catch(error){this.report(Error('Initialise or refresh the workspace source cache: '+error.message));}
   }return generation===this.sharedGeneration?result:[];
  })();return this.sharedReading;
 }
 setShared(uri,record){
  const location=this.location(uri);if(!location)return;
  if(!digest(record?.rawSha256)){this.report(Error('Saved browsing metadata requires the original raw byte digest proof.'));return;}
  if(!record.model||!Array.isArray(record.model.classes)){this.report(Error('Invalid advisory browsing metadata.'));return;}
  this.changed.add(uri);this.sharedPending.set(uri,{root:location.root,rawSha256:record.rawSha256,model:record.model});
 }
 deleteShared(uri){
  const location=this.location(uri);if(!location)return;this.changed.add(uri);
  const previous=this.sharedPending.get(uri)||this.sharedProofs.get(uri);if(!previous){this.sharedPending.delete(uri);return;}
  this.sharedPending.set(uri,{root:location.root,rawSha256:previous.rawSha256,model:null});
 }
 flushShared(){
  this.writing=this.writing.then(async()=>{
   if(!this.sharedPending.size)return;await this.loadShared();
   if(typeof this.request!=='function'){this.report(Error('Native browsing-cache writer is unavailable; no shared files were written.'));return;}
   while(this.sharedPending.size){
    let batch=[],root,batchShard,bytes=0;
    const send=async()=>{
     if(!batch.length)return;const sending=batch;batch=[];bytes=0;
     try{
      const result=await this.request('source.index.browser.update',{root,parser:this.parserId,updates:sending.map(item=>item.update)}).promise;
      const paths=new Set(sending.map(item=>item.update.path)),accepted=result?.accepted,stale=result?.stale;
      if(result?.passed!==true||result.code!==0||!Array.isArray(accepted)||!Array.isArray(stale)||accepted.length+stale.length!==paths.size||new Set([...accepted,...stale]).size!==paths.size||[...accepted,...stale].some(value=>!paths.has(value)))throw Error(result?.report?.error||'Invalid native browsing-cache acknowledgement.');
      if(stale.length)this.report(Error('Saved source changed; stale browsing metadata was not cached.'));
     }catch(error){this.report(error);}
     finally{for(const item of sending)if(this.sharedPending.get(item.uri)===item.pending)this.sharedPending.delete(item.uri);}
    };
    const groups=new Map();
    for(const [uri,pending]of this.sharedPending){const binding=this.sharedBindings.get(key(pending.root)),relative=path.relative(binding?.repository||pending.root,fileURLToPath(uri)).split(path.sep).join('/'),shard=crypto.createHash('sha256').update(relative).digest()[0]%SHARDS,id=JSON.stringify([key(pending.root),shard]);if(!groups.has(id))groups.set(id,[]);groups.get(id).push([uri,pending,shard]);}
    for(const [uri,pending,shard] of [...groups.values()].flat()){
     try{
      const binding=this.sharedBindings.get(key(pending.root));if(!binding)throw Error('Initialise or refresh the workspace source cache before saving browsing metadata.');
      const file=fileURLToPath(uri),relative=path.relative(binding.repository,file).split(path.sep).join('/');if(!relativePath(relative)||!within(binding.root,file))throw Error('Advisory source path escapes its owning workspace.');
      const model=pending.model===null?null:browserModel(pending.model);if(model!==null&&Buffer.byteLength(JSON.stringify(model))>SHARED_MODEL_BYTES)throw Error('Advisory browsing model exceeds its 2 MiB size limit; refresh guidance is required.');
      const update={path:relative,rawSha256:pending.rawSha256,model},size=Buffer.byteLength(JSON.stringify(update));
      const overhead=Buffer.byteLength(JSON.stringify({root:binding.root,parser:this.parserId,updates:[]}))+1024;
      if(batch.length&&(root!==binding.root||batchShard!==shard||batch.length>=SHARED_BATCH||bytes+size+batch.length+overhead>SHARED_PACKET_BYTES))await send();
      root=binding.root;batchShard=shard;bytes+=size;batch.push({uri,pending,update});
     }catch(error){this.report(error);if(this.sharedPending.get(uri)===pending)this.sharedPending.delete(uri);}
    }await send();
   }
  }).catch(error=>this.report(error));return this.writing;
 }
 invalidate(){this.buckets.clear();this.dirty.clear();this.changed.clear();this.sharedBindings.clear();this.sharedProofs.clear();this.sharedPending.clear();this.sharedReading=undefined;this.sharedGeneration++;}
}
module.exports={SourceIndexCache};
