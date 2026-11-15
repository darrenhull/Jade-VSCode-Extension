'use strict';
// Read-only developer measurement; no native processes, cache or source writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {parseSource}=require('../../extension/src/source_symbols'),{decodeSourceBytes}=require('../../extension/src/source-file-text'),{browserModel}=require('../../extension/src/SourceIndexCache');
for(const file of process.argv.slice(2)){
 const started=performance.now(),bytes=fs.readFileSync(file),rawSha256=crypto.createHash('sha256').update(bytes).digest('hex'),read=performance.now(),text=decodeSourceBytes(bytes),decoded=performance.now(),model=parseSource(text,pathToFileURL(file).href),parsed=performance.now(),advisory=browserModel(model),serialized=JSON.stringify(advisory),ended=performance.now();
 console.log(JSON.stringify({file:path.basename(file),rawBytes:bytes.length,rawSha256,encoding:bytes[0]===255&&bytes[1]===254?'utf16le-bom':bytes[0]===254&&bytes[1]===255?'utf16be-bom':'utf8',readHashMs:read-started,decodeMs:decoded-read,parseMs:parsed-decoded,serializeMs:ended-parsed,metadataBytes:Buffer.byteLength(serialized),over2MiBModelLimit:Buffer.byteLength(serialized)>2*1024*1024,classes:model.classes.length,members:model.classes.reduce((sum,row)=>sum+row.members.length,0),lineStarts:advisory.lineStarts?.length||0,peakRssBytes:process.resourceUsage().maxRSS*1024,heapUsedBytes:process.memoryUsage().heapUsed,sourceWrites:false,cacheWrites:false}));
}
