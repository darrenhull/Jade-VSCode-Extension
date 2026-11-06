'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {isolatedIni,prepareWorkingDatabase,nativeProcess,decodeNativeText}=require('../extension/src/working-database');
test('isolated INI preserves licensing and redirects native writable directories',()=>{
 const directories=Object.fromEntries(['logs','journals','transient','scratch','environment'].map(name=>[name,'C:/isolated/'+name]));
 const ini=isolatedIni('[Jade]\nServer=MultiUser\nLicense=keep-this\n[JadeLog]\nLogDirectory=C:/target/logs\n[PersistentDb]\nJournalRootDirectory=C:/target/journals',directories);
 assert.match(ini,/License=keep-this/);assert.doesNotMatch(ini,/C:\/target/);assert.match(ini,/Server=SingleUser/);assert.match(ini,/JournalRootDirectory=C:\/isolated\/journals/);
});
test('working database rejects locations overlapping workspace or configured target before starting a tool',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-location-'));
 for(const location of [root,path.join(root,'source'),path.join(root,'source/subdir'),path.join(root,'target'),path.join(root,'target/subdir')]){
  await assert.rejects(prepareWorkingDatabase({installPath:root,databasePath:path.join(root,'target'),workspaceRoots:[path.join(root,'source')],storagePath:root,workingDatabaseDirectory:location}),/must be separate/);
 }
});
test('native UTF16 logs decode without corrupting assertion output',()=>assert.equal(decodeNativeText(Buffer.concat([Buffer.from([255,254]),Buffer.from('expected 19 but actual=18','utf16le')])),'expected 19 but actual=18'));
test('junctions cannot bypass working database isolation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-junction-')),source=path.join(root,'source'),alias=path.join(root,'alias');fs.mkdirSync(source);fs.symlinkSync(source,alias,process.platform==='win32'?'junction':'dir');
 await assert.rejects(prepareWorkingDatabase({installPath:root,databasePath:path.join(root,'target'),workspaceRoots:[source],storagePath:root,workingDatabaseDirectory:path.join(alias,'generated')}),/must be separate/);
});
test('native process timeout and cancellation never report success',{timeout:10000},async()=>{
 const timed=await nativeProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMilliseconds:50});assert.equal(timed.timedOut,true);assert.equal(timed.success,false);
 const abort=new AbortController();const pending=nativeProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:abort.signal});abort.abort();const cancelled=await pending;assert.equal(cancelled.cancelled,true);assert.equal(cancelled.success,false);
});
