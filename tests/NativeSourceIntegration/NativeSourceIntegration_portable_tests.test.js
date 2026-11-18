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
 const owned=fs.realpathSync.native(packet.ownedRoot);assert.match(packet.fixtureId,/^[a-f0-9]{32}$/);
 assert.equal(fs.readFileSync(path.join(owned,'.jox-public-init-owned'),'utf8'),packet.fixtureId);
 const receiptPath=child(owned,receiptFile);assert.equal(fs.existsSync(receiptPath),false);
 const receipt={format:1,passed:false,packetSha256:sha(bytes),steps:[],fixturePreserved:true};
 let session,provider,opened,connection,primary;
 const extension=fs.realpathSync.native(packet.extensionRoot),vendor=path.join(extension,'vendor','jade-tools-cli');
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
 const project=child(owned,packet.projectRoot);assert.equal(path.dirname(project),owned);assert.equal(fs.existsSync(project),false);
 const database=child(owned,fs.realpathSync.native(child(owned,packet.sourceDatabasePath))),ini=child(owned,fs.realpathSync.native(child(owned,packet.sourceIniPath)));
 const seedMarker=child(owned,packet.seedMarker);assert.equal(sha(fs.readFileSync(seedMarker)),packet.seedMarkerSha256);
 assert.equal(JSON.parse(fs.readFileSync(seedMarker,'utf8')).identity,packet.seedIdentity);
 assert.ok(fs.statSync(path.join(database,'_control.dat')).isFile());const iniHash=sha(fs.readFileSync(ini));
 const state=child(owned,packet.brokerState);assert.equal(path.dirname(state),owned);assert.equal(fs.existsSync(state),false);
 const cli=path.join(vendor,'jade-cli.exe'),env={...process.env,JADE_TOOLS_STATE_DIRECTORY:state,JADE_TOOLS_CONNECTIONS_FILE:path.join(state,'connections.json')};delete env.ELECTRON_RUN_AS_NODE;
 const {CliWorkingSession}=require(path.join(extension,'src','cli-client.js')),{NativeSourceProvider}=require(path.join(extension,'src','NativeSourceProvider.js'));
 const step=async(name,operation)=>{console.log('[portable-consumer] '+name);const began=Date.now();const result=await operation();receipt.steps.push({phase:name,milliseconds:Date.now()-began,code:result?.code,passed:result?.passed,report:result?.report});return result;};
 const select=async identity=>{const page=await provider.query({kind:'test',qualifiedName:{schema:identity.schema,type:identity.class},search:identity.method,offset:0,limit:100});const rows=page.items.filter(item=>item.name===identity.method);assert.equal(rows.length,1);assert.deepEqual(rows[0].testIdentity,identity);return rows[0];};
 const tested=(result,entity,passed)=>{assert.equal(result.passed,passed);assert.equal(result.report.tests_completed,true);assert.equal(result.report.cleanup_complete,true);assert.equal(result.report.executed,true);assert.equal(result.report.results.length,1);assert.equal(result.report.results[0].entityId,entity.id);assert.equal(result.report.results[0].status,passed?'passed':'failed');};
 const retire=async()=>{const channel=session.client;if(!channel)return;const result=await session.request('broker.retire',{},undefined,undefined,channel).promise;assert.equal(result.passed,true);assert.equal(result.retired,true);assert.equal(result.brokerExited,true);assert.equal((await channel.closePromise).code,0);receipt.nativeHelperGracefulReleaseConfirmed=true;receipt.ownedBrokerNaturalExit=true;};
 try{
  fs.mkdirSync(project);fs.writeFileSync(path.join(project,'jade.json'),JSON.stringify({sourceFormat:'jox',installPath:packet.installPath,databasePath:database,iniPath:ini,server:'singleUser',characterSet:'unicode',workingJadeGitPolicy:'inherit',workingDatabaseDirectory:path.join(project,'.jade','working'),storagePath:path.join(owned,'consumer-backups'),timeoutMilliseconds:120000},null,2)+'\n',{flag:'wx'});
  session=new CliWorkingSession({entry:cli,spawn:(exe,args,options)=>spawn(exe,args,{...options,cwd:project,env:{...options.env,...env}})});
  provider=new NativeSourceProvider({client:session,config:{sourceFormat:'jox'},projectRoot:project});
  const capability=await provider.capability();connection=session.client;
  for(const flag of ['initialization','nativeTests','projectionRead','projectionEdit','documentReopen','deploymentFromSavedSnapshot'])assert.equal(capability[flag],true,'Public service has not qualified '+flag);
  const preview=await step('preview',()=>provider.request('working.location',{cwd:project,config:{sourceFormat:'jox'},initialization:true}));
  assert.equal(path.resolve(preview.initialization.destination),path.join(project,'sources'));assert.equal(path.resolve(preview.working.root),path.join(project,'.jade','working'));
  const initialized=await step('initialize',()=>provider.initialize({destination:preview.initialization.destination,schemas:packet.schemas,expectedWorkingIdentity:preview.working.identity}));
  assert.equal(initialized.report.nativeClosed,true);assert.equal(initialized.report.publicationEstablished,true);assert.ok(initialized.extractedFiles>0);
  const selected=await select(packet.testIdentity);
  const run=phase=>step(phase,()=>provider.execute('test',{entityIds:[selected.id]},{settings:{schema:packet.testIdentity.schema,methods:[packet.testIdentity.method]}}));
  const initial=await run('unchanged-test');tested(initial,selected,true);assert.equal(initial.report.sourcePublication.uploaded,false);
  const edit=await select(packet.editIdentity);opened=await step('open-editor',()=>provider.read(edit.id,undefined,undefined,{editor:true}));
  const original=opened.projection.text;assert.ok(original.startsWith(packet.declarationPrefix));const at=original.indexOf(packet.before);assert.ok(at>=packet.declarationPrefix.length&&at===original.lastIndexOf(packet.before));assert.notEqual(packet.before,packet.after);
  const replacement=original.slice(0,at)+packet.after+original.slice(at+packet.before.length);assert.ok(replacement.startsWith(packet.declarationPrefix));
  const saved=await step('save-editor',()=>provider.applyEdit(opened,replacement,'projectionText'));assert.equal(saved.documentBinding.key,opened.documentBinding.key);opened=saved;
  const changed=await run('changed-test');tested(changed,selected,false);assert.equal(changed.report.sourcePublication.uploaded,true);assert.equal(changed.report.sourcePublication.compiled,true);assert.equal(changed.report.sourcePublication.changedFiles.length,1);assert.equal(changed.report.nativePlatformVersion,packet.expectedPlatformVersion);assert.equal(changed.report.results[0].sourceHash,saved.revision.originByteHash);
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
