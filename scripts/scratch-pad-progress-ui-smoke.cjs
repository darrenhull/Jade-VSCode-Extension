'use strict';
// Actual unmodified packaged navigation/provider UI with a checksum-validated
// synthetic runtime/cache fixture. No JADE DLL or native process is executed.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const {HostTestArtifacts}=require('./HostTestArtifacts.cjs'),{connectPrivateDebugger}=require('./creation-ui-capture.cjs'),{stableStringify}=require('../extension/src/system-type-cache');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function classSource(schema,name,parent,fields,methods){return 'schemaDefinition\n'+schema+' subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+name+' subclassOf '+parent+' transient;\ntypeDefinitions\n'+name+' completeDefinition\n(\nreferenceDefinitions\n'+fields+'\njadeMethodDefinitions\n'+Object.keys(methods).map(name=>name+'();').join('\n')+'\n)\ntypeSources\n'+name+' (\njadeMethodSources\n'+Object.entries(methods).map(([name,body])=>name+'\n{\n'+body+'\n}').join('\n')+'\n)';}
async function main(){
 if(!process.env.JADE_TEST_CODE||!process.env.JADE_TEST_VSIX)throw Error('Set JADE_TEST_CODE and JADE_TEST_VSIX for the owned navigation UI proof.');
 const artifacts=new HostTestArtifacts({evidencePath:path.join(root,'docs/test-evidence/scratch-pad-progress-ui-0.22.10.json')});
 await artifacts.run(async stage=>{
  const unpacked=path.join(stage,'package'),extensions=path.join(stage,'extensions'),harness=path.join(stage,'harness'),workspace=path.join(stage,'workspace'),install=path.join(stage,'synthetic-runtime-never-loaded'),cache=path.join(stage,'synthetic-cache');
  const unzip=spawnSync('pwsh',['-NoProfile','-Command','[IO.Compression.ZipFile]::ExtractToDirectory($env:JADE_NAV_VSIX,$env:JADE_NAV_PACKAGE)'],{env:{...process.env,JADE_NAV_VSIX:path.resolve(process.env.JADE_TEST_VSIX),JADE_NAV_PACKAGE:unpacked},windowsHide:true,encoding:'utf8'});
  if(unzip.status!==0)throw Error(unzip.stderr||'Owned VSIX extraction failed.');
  const packaged=path.join(unpacked,'extension'),manifest=JSON.parse(fs.readFileSync(path.join(packaged,'package.json'))),id=manifest.publisher+'.'+manifest.name;
  assert.equal(manifest.version,'0.22.10');fs.mkdirSync(extensions);fs.renameSync(packaged,path.join(extensions,id+'-'+manifest.version));fs.mkdirSync(harness);fs.mkdirSync(path.join(workspace,'.vscode'),{recursive:true});fs.mkdirSync(path.join(install,'bin'),{recursive:true});
  const libraries={};for(const name of ['jlncomp.dll','jlnctab.dll','jlnintp.dll','jom.dll']){const bytes=Buffer.from('Non-executable owned cache identity fixture '+name);fs.writeFileSync(path.join(install,'bin',name),bytes);libraries[name]=sha(bytes);}
  const fingerprint=sha(JSON.stringify(libraries)),payload={formatVersion:1,fingerprint,schema:{name:'RootSchema'},types:[
   {oid:'object',name:'Object',schema_name:'RootSchema'},
   {oid:'log',name:'JadeLog',schema_name:'RootSchema',superclass_oid:'object',properties:[{name:'fileName',type_oid:'string',length:100}],methods:[{name:'log',parameters:[{name:'message',type_oid:'string',usage:1}]}]},
   {oid:'string',name:'String',schema_name:'RootSchema',primitive:true}
  ]};fs.mkdirSync(path.join(cache,'system-types',fingerprint),{recursive:true});fs.writeFileSync(path.join(cache,'system-types',fingerprint,'definitions.json'),JSON.stringify({...payload,checksum:sha(stableStringify(payload))}));
  fs.writeFileSync(path.join(workspace,'.vscode/settings.json'),JSON.stringify({'jadeNative.installPath':install,'jadeNative.cacheDirectory':cache,'jadeNative.databasePath':path.join(stage,'database-never-opened')}));
  const worker=classSource('Demo','Worker','Object','',{run:'run(parameterLog: JadeLog);\nvars\n localLog: JadeLog;\nbegin\n localLog.fileName := null;\n localLog.log("fixture");\n ownCall();\nend;',ownCall:'ownCall();\nbegin\nend;'});
  fs.writeFileSync(path.join(workspace,'Worker.cls'),worker);
  fs.writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'packaged-navigation-proof',publisher:'jade-delivery-proof',version:'1.0.0',engines:manifest.engines,main:'./main.cjs',activationEvents:['onStartupFinished']}));
  fs.copyFileSync(path.join(root,'test/ScratchPadProgressUiCompanion.cjs'),path.join(harness,'main.cjs'));
  fs.writeFileSync(path.join(workspace,'Progress.jadeworkspace'),JSON.stringify({version:1,schema:'Pets',cells:[{kind:'code',source:['begin\n write 42;\nend;']}]}));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const env={...process.env,JADE_SCRATCH_STAGE:stage,JADE_SCRATCH_EXTENSION_ID:id,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json'),JADE_INSTALL:'',JADE_HOME:''};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(process.env.JADE_TEST_CODE,['--new-window','--remote-debugging-port='+port,'--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',extensions,'--extensionDevelopmentPath='+harness,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env,windowsHide:true,stdio:'ignore'});artifacts.track(child);let client,session;
  try{
   for(let i=0;i<200&&!session;i++){if(!client)try{client=await connectPrivateDebugger(port);}catch{}if(client){const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(t=>t.type==='page'&&t.url.startsWith('vscode-file://'));if(page)session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;}if(!session)await pause(100);}assert.ok(session,'Owned VS Code page unavailable.');
   async function until(name){for(let i=0;i<400;i++){if(fs.existsSync(path.join(stage,'host-error.txt')))throw Error(fs.readFileSync(path.join(stage,'host-error.txt'),'utf8'));if(fs.existsSync(path.join(stage,name)))return;await pause(100);}throw Error('Scratch Pad UI timeout: '+name);}
   for(const name of ['preparation','busy-test','completed']){await until(name);await pause(250);const {data}=await client.request('Page.captureScreenshot',{format:'png'},session),file=path.join(root,'docs/screenshots/scratch-pad-progress',name+'.png');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(data,'base64'));fs.writeFileSync(path.join(stage,'next-'+name),'next');}
   await until('host-report.json');assert.equal(fs.existsSync(path.join(stage,'database-never-opened')),false);assert.equal(fs.existsSync(path.join(stage,'broker')),false);console.log('PASS actual packaged Scratch Pad progress/completion and busy-test UI; controlled native response, no database execution.');
  }finally{
   client?.close();fs.writeFileSync(path.join(stage,'stop'),'stop');await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>reject(Error('Owned Scratch Pad host did not exit.')),10000);child.once('close',()=>{clearTimeout(timer);resolve();});});if(fs.existsSync(path.join(stage,'host-process.json'))){const owner=JSON.parse(fs.readFileSync(path.join(stage,'host-process.json')));assert.equal(owner.nonce,artifacts.nonce);await artifacts.waitClosed([owner.pid]);}
  }
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
