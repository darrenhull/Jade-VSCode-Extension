'use strict';
// Developer-only gate: owner supplies an already prepared synthetic root/session.
// Does not discover inputs, prepare a database or modify source files.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {SourceIndexCache,browserModel}=require('../../extension/src/SourceIndexCache'),{parseSource}=require('../../extension/src/source_symbols'),{decodeSourceBytes}=require('../../extension/src/source-file-text');
async function populateRepresentativeBrowser({root,files,session,nativeVersion}){
 if(!path.isAbsolute(root)||typeof nativeVersion!=='string'||!nativeVersion||typeof session?.request!=='function')throw Error('Provide an owned absolute root, real CLI session and verified native cache version.');
 if(!Array.isArray(files)||files.length>128)throw Error('Provide at most 128 explicit representative source paths.');
 const records=[],packets=[],errors=[],started=performance.now();
 const cache=new SourceIndexCache({roots:()=>[root],nativeVersion,onError:error=>errors.push(error.message),request(command,body){const packet={command,updates:body.updates.length,utf8Bytes:Buffer.byteLength(JSON.stringify(body))};packets.push(packet);const request=session.request(command,body);return{...request,promise:request.promise.then(result=>{packet.accepted=result.accepted?.length||0;packet.stale=result.stale?.length||0;return result;})};}});
 await cache.load();
 for(const selected of files){const file=path.resolve(root,selected),relative=path.relative(root,file);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Representative source escapes its owned root.');
  const begin=performance.now(),bytes=await fs.readFile(file),rawSha256=crypto.createHash('sha256').update(bytes).digest('hex'),uri=pathToFileURL(file).href,model=parseSource(decodeSourceBytes(bytes),uri),parsed=performance.now(),metadataBytes=Buffer.byteLength(JSON.stringify(browserModel(model)));
  records.push({path:relative.split(path.sep).join('/'),rawBytes:bytes.length,rawSha256,metadataBytes,over2MiBModelLimit:metadataBytes>2*1024*1024,readHashDecodeParseMs:parsed-begin,classes:model.classes.length,members:model.classes.reduce((sum,value)=>sum+value.members.length,0)});cache.set(uri,{model,rawSha256});
 }
 await cache.flush();return{requested:files.length,accepted:packets.reduce((sum,row)=>sum+row.accepted,0),records,packets,errors,elapsedMilliseconds:performance.now()-started,peakRssBytes:process.resourceUsage().maxRSS*1024,sourceWrites:false,cacheWriter:'native source.index.browser.update',nativePreparationRequests:0};
}
module.exports={populateRepresentativeBrowser};
