'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function stableStringify(value){if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(name=>JSON.stringify(name)+':'+stableStringify(value[name])).join(',')+'}';return JSON.stringify(value);}
function within(root,file){const relative=path.relative(path.resolve(root),path.resolve(file));return !relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
class SystemTypeCache{
  constructor(){this.runtimes=new Map();this.files=new Map();}
  async get({installPath,storagePath,workspaceRoots=[]}){
    if(!installPath||!storagePath)return;
    if(workspaceRoots.some(root=>within(root,storagePath)))throw Error('System cache must remain outside the workspace');
    const names=['jlncomp.dll','jlnctab.dll','jlnintp.dll','jom.dll'],files=names.map(name=>path.join(installPath,'bin',name));
    const stats=await Promise.all(files.map(file=>fs.stat(file)));const stamp=stats.map(value=>value.size+':'+value.mtimeMs).join('|');let runtime=this.runtimes.get(installPath);
    if(!runtime||runtime.stamp!==stamp||Date.now()-runtime.time>60000){const bytes=await Promise.all(files.map(file=>fs.readFile(file)));const libraries=Object.fromEntries(names.map((name,index)=>[name,digest(bytes[index])]));runtime={stamp,time:Date.now(),fingerprint:digest(JSON.stringify(libraries))};this.runtimes.set(installPath,runtime);}
    const file=path.join(storagePath,'system-types',runtime.fingerprint,'definitions.json');let stat;try{stat=await fs.stat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}
    const etag=stat.size+':'+stat.mtimeMs,cached=this.files.get(file);if(cached?.etag===etag)return cached.value;
    const value=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));const checksum=value.checksum;const payload={...value};delete payload.checksum;
    if(value.formatVersion!==1||value.fingerprint!==runtime.fingerprint||value.schema?.name!=='RootSchema')throw Error('System cache runtime/schema mismatch');
    if(digest(stableStringify(payload))!==checksum)throw Error('System cache checksum mismatch');
    if(!Array.isArray(value.types)||value.types.some(type=>type.schema_name!=='RootSchema'))throw Error('System cache contains non-system definitions');
    this.files.set(file,{etag,value});return value;
  }
}
module.exports={SystemTypeCache,stableStringify};
