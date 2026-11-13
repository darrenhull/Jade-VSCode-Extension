'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{fileURLToPath}=require('node:url');
const SHARDS=32,MAX_BYTES=32*1024*1024,FORMAT=1;
const PARSER=crypto.createHash('sha256');for(const name of ['source_symbols.js','source-lex.js','source-context.js'])PARSER.update(require('node:fs').readFileSync(path.join(__dirname,name)));const PARSER_ID=PARSER.digest('hex');
const key=value=>process.platform==='win32'?value.toLowerCase():value;
const within=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
/** Disposable browsing metadata. Never a source/build/publish authority. */
class SourceIndexCache{
 constructor({roots,onError=()=>{}}){this.roots=roots;this.onError=onError;this.buckets=new Map();this.dirty=new Set();this.changed=new Set();this.writing=Promise.resolve();this.reported=new Set();}
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
 set(uri,record){const location=this.location(uri),entry={uri,model:record.model,stamp:record.stamp};if(!location||!this.valid(entry))return;const [id,bucket]=this.bucket(location.root,location.shard);bucket.entries.set(uri,entry);this.changed.add(uri);this.dirty.add(id);}
 delete(uri){const location=this.location(uri);if(!location)return;const [id,bucket]=this.bucket(location.root,location.shard);bucket.entries.delete(uri);this.changed.add(uri);this.dirty.add(id);}
 flush(){
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
 invalidate(){this.buckets.clear();this.dirty.clear();this.changed.clear();}
}
module.exports={SourceIndexCache};