"use strict";
// Explicit owned-fixture qualification only. No default test opens Jade.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const packetFile=process.env.JADE_JOX_CONSUMER_PACKET,receiptFile=process.env.JADE_JOX_CONSUMER_RECEIPT;
function child(root,value){const result=path.resolve(value),relative=path.relative(root,result);assert.ok(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Target escapes the approved owned fixture');return result;}
test('actual extracted extension adapters initialize, save, upload and execute the changed native test',{
 skip:!packetFile||!receiptFile,timeout:900000
},async()=>{
 const bytes=fs.readFileSync(packetFile),packet=JSON.parse(bytes);assert.equal(packet.format,1);
 const freshRetry=packet.mode==='fresh-settled-syntax-retry',retry=freshRetry||packet.mode==='settled-syntax-retry',existingRetry=retry&&!freshRetry;assert.ok(packet.mode===undefined||retry,'Unknown owned qualification mode');if(retry)assert.ok(Number.isInteger(packet.expectedCompilerError)&&packet.expectedCompilerError>0);
 const owned=fs.realpathSync.native(packet.ownedRoot);assert.match(packet.fixtureId,/^[a-f0-9]{32}$/);
 assert.equal(fs.readFileSync(path.join(owned,'.jox-public-init-owned'),'utf8'),packet.fixtureId);
 const receiptPath=child(owned,receiptFile);assert.equal(fs.existsSync(receiptPath),false);
 const receipt={format:1,passed:false,packetSha256:sha(bytes),steps:[],fixturePreserved:true};
 let session,provider,opened,connection,primary;
 const extension=fs.realpathSync.native(packet.extensionRoot),vendor=retry&&packet.distributionRoot?fs.realpathSync.native(packet.distributionRoot):path.join(extension,'vendor','jade-tools-cli');
 const manifestBytes=fs.readFileSync(path.join(vendor,'distribution.json')),manifest=JSON.parse(manifestBytes);
 assert.equal(sha(manifestBytes),packet.manifestSha256);assert.equal(manifest.formatVersion,2);assert.equal(manifest.runtime,'native-cpp');
 assert.equal(manifest.platform,'win32');assert.equal(manifest.arch,'x64');assert.equal(manifest.executable,'jade-cli.exe');assert.equal(manifest.oidFormat,'jade-native');
 const jox=manifest.joxRuntime;assert.equal(jox.format,1);assert.equal(jox.characterSet,'unicode');assert.match(jox.engineCommit,/^[a-f0-9]{40}$/);
 for(const flag of ['initialization','managedUpload','nativeTests'])assert.equal(jox[flag],true,'Artifact has not qualified '+flag);
 for(const name of ['jade-inspect-helper.exe','jade-inspect-helper-ansi.exe','jade-inspect-helper-unicode.exe'])assert.ok(Object.hasOwn(manifest.runtimeFiles,'native/'+name));
 for(const name of ['jade-jox-test-helper-unicode.exe','jadegitscm.dll','jadegitdev.dll'])assert.ok(Object.hasOwn(manifest.runtimeFiles,'native/jox/'+name));
 for(const [relative,hash]of Object.entries({...manifest.runtimeFiles,'jade-cli.exe':manifest.executableSha256})){
  assert.ok(!path.isAbsolute(relative)&&!relative.includes('\\')&&relative.split('/').every(part=>part&&part!=='.'&&part!=='..'));
  const file=child(vendor,fs.realpathSync.native(child(vendor,path.join(vendor,relative))));assert.equal(sha(fs.readFileSync(file)),hash,'Packaged runtime differs: '+relative);
 }
 const extensionPackage=JSON.parse(fs.readFileSync(path.join(extension,'package.json'),'utf8'));assert.match(extensionPackage.version,/^0\.23\./);
 for(const relative of ['src/cli-client.js','src/NativeSourceProvider.js','src/working-jadegit-policy.js'])assert.equal(sha(fs.readFileSync(path.join(extension,relative))),packet.sourceSha256[relative],'Packaged adapter differs: '+relative);
 const project=child(owned,packet.projectRoot);assert.equal(path.dirname(project),owned);assert.equal(fs.existsSync(project),existingRetry);
 let cursorPath,cursorHash;
 if(existingRetry){
  const resume=packet.resume,priorBytes=fs.readFileSync(child(owned,resume.receipt)),prior=JSON.parse(priorBytes);
  assert.equal(sha(priorBytes),resume.receiptSha256);assert.equal(prior.passed,true);for(const flag of ['nativeHelperGracefulReleaseConfirmed','ownedBrokerNaturalExit','stdioActualExit'])assert.equal(prior[flag],true);
  const oldPacketBytes=fs.readFileSync(resume.packet),oldPacket=JSON.parse(oldPacketBytes);assert.equal(sha(oldPacketBytes),prior.packetSha256);assert.equal(oldPacket.projectRoot,project);for(const field of ['testIdentity','editIdentity','sourceDatabasePath','sourceIniPath','sourceIniSha256','declarationPrefix','expectedPlatformVersion'])assert.deepEqual(packet[field],oldPacket[field]);assert.equal(packet.before,oldPacket.after);assert.equal(sha(fs.readFileSync(path.join(project,'jade.json'))),resume.configurationSha256);
  const oldManifestBytes=fs.readFileSync(resume.manifest),oldManifest=JSON.parse(oldManifestBytes);assert.equal(sha(oldManifestBytes),oldPacket.manifestSha256);
  const transition=resume.transition,comparable=structuredClone(manifest);assert.equal(transition.priorManifestSha256,oldPacket.manifestSha256);assert.equal(transition.currentManifestSha256,packet.manifestSha256);
  assert.deepEqual(transition.executable,{before:oldManifest.executableSha256,after:manifest.executableSha256});comparable.executableSha256=oldManifest.executableSha256;
  for(const [name,change]of Object.entries(transition.runtimeFiles)){assert.deepEqual(change,{before:oldManifest.runtimeFiles[name],after:manifest.runtimeFiles[name]});assert.notEqual(change.before,change.after);comparable.runtimeFiles[name]=change.before;}
  assert.deepEqual(comparable,oldManifest,'Unreviewed package change beyond the exact runtime transition');assert.deepEqual(packet.sourceSha256,oldPacket.sourceSha256);
  const oldChanged=prior.steps.find(step=>step.phase==='changed-test');assert.equal(oldChanged.passed,false);assert.equal(oldChanged.code,1);assert.equal(oldChanged.report.tests_completed,true);assert.equal(oldChanged.report.cleanup_complete,true);assert.equal(oldChanged.report.sourcePublication.uploaded,true);
  assert.equal(oldChanged.report.results.length,1);assert.equal(oldChanged.report.results[0].sourceHash,resume.originSha256);assert.equal(oldChanged.report.sourcePublication.changedFiles.length,1);
  assert.equal(sha(fs.readFileSync(child(project,path.join(project,oldChanged.report.sourcePublication.changedFiles[0])))),resume.originSha256);
  const working=child(project,resume.workingRoot);assert.equal(working,path.join(project,'.jade','working'));const markerBytes=fs.readFileSync(path.join(working,'working-database.json'));assert.equal(sha(markerBytes),resume.workingMarkerSha256);assert.equal(JSON.parse(markerBytes).identity,resume.workingIdentity);
  cursorPath=child(path.join(project,'.jade','publications'),resume.cursor);cursorHash=sha(fs.readFileSync(cursorPath));assert.equal(cursorHash,resume.cursorSha256);assert.equal(fs.existsSync(path.join(path.dirname(cursorPath),'pending.json')),false);
  receipt.resumedReceiptSha256=resume.receiptSha256;receipt.originalOriginSha256=resume.originSha256;receipt.acceptedCursorBefore=cursorHash;
 }
 const database=child(owned,fs.realpathSync.native(child(owned,packet.sourceDatabasePath))),ini=child(owned,fs.realpathSync.native(child(owned,packet.sourceIniPath)));
 const seedMarker=child(owned,packet.seedMarker);assert.equal(sha(fs.readFileSync(seedMarker)),packet.seedMarkerSha256);
 assert.equal(JSON.parse(fs.readFileSync(seedMarker,'utf8')).identity,packet.seedIdentity);
 assert.equal(path.dirname(database),path.dirname(seedMarker));assert.equal(path.basename(database),'system');assert.ok(fs.statSync(path.join(database,'_control.dat')).isFile());const iniHash=sha(fs.readFileSync(ini));assert.equal(iniHash,packet.sourceIniSha256);
 const state=child(owned,packet.brokerState);assert.equal(path.dirname(state),owned);assert.equal(fs.existsSync(state),false);
 const cli=path.join(vendor,'jade-cli.exe'),env={...process.env,JADE_TOOLS_STATE_DIRECTORY:state,JADE_TOOLS_CONNECTIONS_FILE:path.join(state,'connections.json')};delete env.ELECTRON_RUN_AS_NODE;
 const {CliWorkingSession}=require(path.join(extension,'src','cli-client.js')),{NativeSourceProvider}=require(path.join(extension,'src','NativeSourceProvider.js'));
 const step=async(name,operation)=>{console.log('[portable-consumer] '+name);const began=Date.now();const result=await operation();receipt.steps.push({phase:name,milliseconds:Date.now()-began,code:result?.code,passed:result?.passed,report:result?.report});return result;};
 const select=async identity=>{const page=await provider.query({kind:'test',qualifiedName:{schema:identity.schema,type:identity.class},search:identity.method,offset:0,limit:100});const rows=page.items.filter(item=>item.name===identity.method);assert.equal(rows.length,1);assert.deepEqual(rows[0].testIdentity,identity);return rows[0];};
 const tested=(result,entity,passed)=>{assert.equal(result.passed,passed);assert.equal(result.report.tests_completed,true);assert.equal(result.report.cleanup_complete,true);assert.equal(result.report.executed,true);assert.equal(result.report.results.length,1);assert.equal(result.report.results[0].entityId,entity.id);assert.equal(result.report.results[0].status,passed?'passed':'failed');};
 const retire=async()=>{const channel=session.client;if(!channel)return;const result=await session.request('broker.retire',{},undefined,undefined,channel).promise;assert.equal(result.passed,true);assert.equal(result.retired,true);assert.equal(result.brokerExited,true);assert.equal((await channel.closePromise).code,0);receipt.nativeHelperGracefulReleaseConfirmed=true;receipt.ownedBrokerNaturalExit=true;};
 try{
  if(!existingRetry){fs.mkdirSync(project);fs.writeFileSync(path.join(project,'jade.json'),JSON.stringify({sourceFormat:'jox',installPath:packet.installPath,databasePath:database,iniPath:ini,server:'singleUser',characterSet:'unicode',workingJadeGitPolicy:'inherit',workingDatabaseDirectory:path.join(project,'.jade','working'),storagePath:path.join(owned,'consumer-backups'),timeoutMilliseconds:120000},null,2)+'\n',{flag:'wx'});}
  session=new CliWorkingSession({entry:cli,spawn:(exe,args,options)=>spawn(exe,args,{...options,cwd:project,env:{...options.env,...env}})});
  provider=new NativeSourceProvider({client:session,config:{sourceFormat:'jox'},projectRoot:project});
  const capability=await provider.capability();connection=session.client;
  for(const flag of ['initialization','nativeTests','projectionRead','projectionEdit','documentReopen','deploymentFromSavedSnapshot'])assert.equal(capability[flag],true,'Public service has not qualified '+flag);
  if(existingRetry){await step('prepare-existing',()=>provider.prepare());}else{
  const preview=await step('preview',()=>provider.request('working.location',{cwd:project,config:{sourceFormat:'jox'},initialization:true}));
  assert.equal(path.resolve(preview.initialization.destination),path.join(project,'sources'));assert.equal(path.resolve(preview.working.root),path.join(project,'.jade','working'));
  const initialized=await step('initialize',()=>provider.initialize({destination:preview.initialization.destination,schemas:packet.schemas,expectedWorkingIdentity:preview.working.identity}));
  assert.equal(initialized.report.nativeClosed,true);assert.equal(initialized.report.publicationEstablished,true);assert.ok(initialized.extractedFiles>0);
  if(freshRetry){
   const publications=path.join(project,'.jade','publications');let directories=[publications];
   for(let depth=0;depth<3;depth++){directories=directories.flatMap(directory=>fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink()).map(entry=>child(directory,path.join(directory,entry.name))));assert.ok(directories.length>0&&directories.length<=16);}
   const cursors=directories.map(directory=>path.join(directory,'cursor.json')).filter(file=>fs.existsSync(file));assert.equal(cursors.length,1);cursorPath=child(publications,cursors[0]);cursorHash=sha(fs.readFileSync(cursorPath));assert.equal(fs.existsSync(path.join(path.dirname(cursorPath),'pending.json')),false);receipt.acceptedCursorBefore=cursorHash;
  }}
  const selected=await select(packet.testIdentity);
  const run=phase=>step(phase,()=>provider.execute('test',{entityIds:[selected.id]},{settings:{schema:packet.testIdentity.schema,methods:[packet.testIdentity.method]}}));
  if(!retry){const initial=await run('unchanged-test');tested(initial,selected,true);assert.equal(initial.report.sourcePublication.uploaded,false);}
  const edit=await select(packet.editIdentity);opened=await step('open-editor',()=>provider.read(edit.id,undefined,undefined,{editor:true}));
  const original=opened.projection.text;assert.ok(original.startsWith(packet.declarationPrefix));const at=original.indexOf(packet.before);assert.ok(at>=packet.declarationPrefix.length&&at===original.lastIndexOf(packet.before));assert.notEqual(packet.before,packet.after);
  const replacement=original.slice(0,at)+packet.after+original.slice(at+packet.before.length);assert.ok(replacement.startsWith(packet.declarationPrefix));
  const saved=await step(retry?'save-typo':'save-editor',()=>provider.applyEdit(opened,replacement,'projectionText'));assert.equal(saved.documentBinding.key,opened.documentBinding.key);opened=saved;
  if(retry){
   const failed=await run('syntax-failure');assert.equal(failed.passed,false);assert.ok([8510,8511].includes(failed.code));assert.equal(failed.report.executed,false);assert.equal(failed.report.uploaded,false);assert.equal(failed.report.compiled,false);assert.equal(failed.report.deployment.ownershipUncertain,false);assert.equal(failed.report.deployment.cancelled,false);assert.equal(failed.report.deployment.code,failed.code);assert.match([failed.report.deployment.output,failed.report.deployment.compilerOutput].join('\n'),new RegExp('\\b'+packet.expectedCompilerError+'\\b'));
   assert.equal(sha(fs.readFileSync(cursorPath)),cursorHash,'Failed native compile advanced accepted publication');assert.equal(fs.existsSync(path.join(path.dirname(cursorPath),'pending.json')),false);receipt.failedCursorUnchanged=true;
   const status=await session.request('status',{},undefined,undefined,connection).promise;assert.equal(status.passed,true);assert.ok(status.nativePIDs.length>0);receipt.failedBrokerStatus=status;
   assert.equal(session.client,connection);assert.equal(connection.closed,false);
   assert.equal(typeof packet.corrected,'string');assert.notEqual(packet.corrected,packet.before);assert.notEqual(packet.corrected,packet.after);
   const correctedText=original.slice(0,at)+packet.corrected+original.slice(at+packet.before.length);assert.ok(correctedText.startsWith(packet.declarationPrefix));
   opened=await step('save-correction',()=>provider.applyEdit(opened,correctedText,'projectionText'));
   const corrected=await run('corrected-test');tested(corrected,selected,true);const publication=corrected.report.sourcePublication;
   assert.equal(publication.uploaded,true);assert.equal(publication.compiled,true);assert.equal(publication.changedFiles.length,1);assert.equal(publication.nativePlatformVersion,packet.expectedPlatformVersion);assert.equal(corrected.report.results[0].sourceHash,opened.revision.originByteHash);
   const previous=failed.report.deployment,current=publication.deployment;assert.ok(Number.isInteger(previous.connection)&&previous.connection>0);assert.match(previous.connectionEpoch,/^[a-f0-9]{32}$/);assert.equal(current.connection,previous.connection);assert.equal(current.connectionEpoch,previous.connectionEpoch);assert.equal(current.openMilliseconds,0);receipt.sameNativeSession=true;
   const afterStatus=await session.request('status',{},undefined,undefined,connection).promise;assert.equal(afterStatus.brokerPID,status.brokerPID);assert.equal(afterStatus.brokerInstance,status.brokerInstance);assert.deepEqual(afterStatus.nativePIDs,status.nativePIDs);receipt.correctedBrokerStatus=afterStatus;
   const warm=await run('repeat-corrected-test');tested(warm,selected,true);assert.equal(warm.report.sourcePublication.uploaded,false);assert.equal(warm.report.sourcePublication.compiled,false);assert.deepEqual(warm.report.sourcePublication.changedFiles,[]);assert.equal(session.client,connection);receipt.acceptedCursorAfter=sha(fs.readFileSync(cursorPath));assert.notEqual(receipt.acceptedCursorAfter,cursorHash);
  }else{
   const changed=await run('changed-test');tested(changed,selected,false);assert.equal(changed.report.sourcePublication.uploaded,true);assert.equal(changed.report.sourcePublication.compiled,true);assert.equal(changed.report.sourcePublication.changedFiles.length,1);assert.equal(changed.report.sourcePublication.nativePlatformVersion,packet.expectedPlatformVersion);assert.equal(changed.report.results[0].sourceHash,saved.revision.originByteHash);
  }
  await provider.close(opened);opened=undefined;await provider.closeProject();await retire();await session.dispose();assert.equal(connection.closed,true);assert.equal((await connection.closePromise).code,0);
  receipt.stdioActualExit=true;receipt.manifestUnchanged=sha(fs.readFileSync(path.join(vendor,'distribution.json')))===packet.manifestSha256;assert.equal(receipt.manifestUnchanged,true);receipt.passed=true;
 }catch(error){primary=error;receipt.error=error.message;throw error;}
 finally{
  let cleanup;
  try{
   if(session){try{if(opened)await provider.close(opened);if(provider?.snapshot)await provider.closeProject();await retire();}finally{await session.dispose();}}
  }catch(error){cleanup=error;receipt.cleanupError=error.message;receipt.passed=false;}
  receipt.sourceIniUnchanged=sha(fs.readFileSync(ini))===iniHash;if(!receipt.sourceIniUnchanged){receipt.passed=false;cleanup||=Error('Owned Source INI changed');}
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(cleanup&&!primary)throw cleanup;
 }
});
