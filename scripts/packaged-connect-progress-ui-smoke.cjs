'use strict';
// Real unmodified VSIX, separate companion, gated fake preparation only.
// Exercises progress/cancellation presentation without opening a Jade database.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const {HostTestArtifacts}=require('./HostTestArtifacts.cjs'),{connectPrivateDebugger}=require('./creation-ui-capture.cjs');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(!process.env.JADE_TEST_CODE||!process.env.JADE_TEST_VSIX)throw Error('Set JADE_TEST_CODE and JADE_TEST_VSIX for the packaged progress proof.');
function hasHeartbeat(directory){
 let remaining=300;
 function visit(current){
  if(!fs.existsSync(current))return false;
  for(const entry of fs.readdirSync(current,{withFileTypes:true})){
   if(--remaining<0)throw Error('Owned log scan exceeded its bounded file limit.');
   const file=path.join(current,entry.name);
   if(entry.isDirectory()){if(visit(file))return true;}
   else if(entry.isFile()&&/\.(log|txt)$/.test(entry.name)&&fs.statSync(file).size<=2*1024*1024&&fs.readFileSync(file,'utf8').includes('s (still waiting; completion is not confirmed).'))return true;
  }
  return false;
 }
 return visit(directory);
}
async function main(){
 const expected=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'))),pin=JSON.parse(fs.readFileSync(path.join(root,'packages/jade-cli-pin.json')));
 const artifacts=new HostTestArtifacts({evidencePath:path.join(root,'docs/test-evidence/packaged-connect-progress-ui.json')});
 await artifacts.run(async stage=>{
  const unpacked=path.join(stage,'package'),extensions=path.join(stage,'extensions'),harness=path.join(stage,'harness'),workspace=path.join(stage,'workspace');
  const unzip=spawnSync('pwsh',['-NoProfile','-Command','[IO.Compression.ZipFile]::ExtractToDirectory($env:JADE_PROGRESS_VSIX,$env:JADE_PROGRESS_PACKAGE)'],{env:{...process.env,JADE_PROGRESS_VSIX:path.resolve(process.env.JADE_TEST_VSIX),JADE_PROGRESS_PACKAGE:unpacked},windowsHide:true,encoding:'utf8'});
  if(unzip.status!==0)throw Error(unzip.stderr||'VSIX extraction failed');
  const packaged=path.join(unpacked,'extension'),manifest=JSON.parse(fs.readFileSync(path.join(packaged,'package.json'))),id=manifest.publisher+'.'+manifest.name,native=JSON.parse(fs.readFileSync(path.join(packaged,'vendor/jade-tools-cli/distribution.json')));
  assert.equal(manifest.version,expected.version);assert.equal(native.packageVersion,pin.version);assert.equal(manifest.jadeNative.minimumCliVersion,expected.jadeNative.minimumCliVersion);
  artifacts.nativeSha256=native.executableSha256;
  const cleanupExe=path.join(stage,'extension/vendor/jade-tools-cli/jade-cli.exe');fs.mkdirSync(path.dirname(cleanupExe),{recursive:true});fs.copyFileSync(path.join(packaged,'vendor/jade-tools-cli/jade-cli.exe'),cleanupExe);
  fs.mkdirSync(extensions);const installed=path.join(extensions,id+'-'+manifest.version);fs.renameSync(packaged,installed);
  fs.mkdirSync(harness);fs.mkdirSync(path.join(workspace,'.vscode'),{recursive:true});
  const settings={'jadeNative.installPath':path.join(stage,'fixture-install-never-opened'),'jadeNative.databasePath':path.join(stage,'database-never-opened')};
  fs.writeFileSync(path.join(workspace,'.vscode/settings.json'),JSON.stringify(settings));
  fs.writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'packaged-progress-proof',publisher:'jade-delivery-proof',version:'1.0.0',engines:manifest.engines,main:'./main.cjs',activationEvents:['onStartupFinished']}));
  fs.writeFileSync(path.join(harness,'main.cjs'),[
   "const fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');exports.activate=async context=>{",
   "fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));const stage=process.env.JADE_PROGRESS_STAGE,marker=name=>path.join(stage,name);let calls=0,configuredTimeout;const wait=async name=>{while(!fs.existsSync(marker(name)))await new Promise(resolve=>setTimeout(resolve,25));};",
   'const extension=vscode.extensions.getExtension('+JSON.stringify(id)+');if(!extension)throw Error("Packaged extension not discovered");',
   "const api=await extension.activate();api.nativeTests.inspectionTarget=async function(config,target,output){calls++;configuredTimeout=config.workingDatabaseTimeoutSeconds;if(target!=='working')throw Error('Fixture requires Working target');config.signal.addEventListener('abort',()=>fs.writeFileSync(marker('cancel-requested'),'yes'),{once:true});output('Creating a consistent native backup for the working database ...\\n');await wait('restore');if(config.signal.aborted)throw Error('Cancelled at native safe boundary.');output('Restoring the working database ...\\n');await wait('finish');if(config.signal.aborted)throw Error('Cancelled at native safe boundary.');throw Error('Fake preparation must never open a native connection.');};",
   "await vscode.commands.executeCommand('workbench.view.extension.jadeNative');await vscode.commands.executeCommand('jadeNative.objects.focus');",
   "setTimeout(()=>{Promise.all(Array.from({length:3},()=>vscode.commands.executeCommand('jadeNative.connectObjects'))).then(results=>fs.writeFileSync(marker('result.json'),JSON.stringify({passed:calls===1&&results.every(row=>row?.cancelled),nativePreparations:calls,configuredTimeout,results}))).catch(error=>fs.writeFileSync(marker('result.json'),JSON.stringify({error:error.message})));},250);",
   "let cancelled=false;const timer=setInterval(()=>{if(!cancelled&&fs.existsSync(marker('cancel'))){cancelled=true;void vscode.commands.executeCommand('jadeNative.cancelObjectInspection');}if(fs.existsSync(marker('stop'))){clearInterval(timer);void vscode.commands.executeCommand('workbench.action.quit');}},25);context.subscriptions.push({dispose(){clearInterval(timer)}});};",
  ].join('\n'));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const data=path.join(stage,'vscode-data'),env={...process.env,JADE_PROGRESS_STAGE:stage,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json'),JADE_INSTALL:'',JADE_HOME:''};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(process.env.JADE_TEST_CODE,['--new-window','--remote-debugging-port='+port,'--user-data-dir',data,'--extensions-dir',extensions,'--extensionDevelopmentPath='+harness,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env,windowsHide:true,stdio:'ignore'});artifacts.track(child);
  let client,session,anonymousAnswered=false;
  try{
   for(let i=0;i<200&&!session;i++){
    if(!client)try{client=await connectPrivateDebugger(port);}catch{}
    if(client){const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(row=>row.type==='page'&&row.url.startsWith('vscode-file://'));if(page)session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;}
    if(!session)await pause(100);
   }
   assert.ok(session,'Private packaged progress host did not appear');
   const text=async()=>(await client.request('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},session)).result.value;
   async function until(expected){
    for(let i=0;i<250;i++){
     const body=String(await text());
     if(!anonymousAnswered&&body.includes('Jade inspection sign-on')){
      anonymousAnswered=true;
      await client.request('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},session);
      await client.request('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},session);
     }
     if(body.includes(expected))return;
     if(fs.existsSync(path.join(stage,'result.json'))){const result=JSON.parse(fs.readFileSync(path.join(stage,'result.json')));if(result.error||result.passed===false)throw Error(JSON.stringify(result));}
     await pause(100);
    }
    throw Error('Packaged progress did not show '+expected);
   }
   const output=path.join(root,'docs/screenshots/connect-progress');fs.mkdirSync(output,{recursive:true});
   const capture=async name=>{await pause(200);const {data}=await client.request('Page.captureScreenshot',{format:'png'},session);fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data,'base64'));};
   await until('Creating a consistent native backup');await until('elapsed');
   await pause(16000);assert.equal(hasHeartbeat(path.join(data,'logs')),true,'Quiet native preparation did not persist its elapsed heartbeat in the owned output log');
   await capture('packaged-backup');fs.writeFileSync(path.join(stage,'restore'),'restore');await until('Restoring the working database');await capture('packaged-restore');
   fs.writeFileSync(path.join(stage,'cancel'),'cancel');await until('Waiting for the current native step to finish safely');await capture('packaged-cancelling');
   assert.equal(fs.existsSync(path.join(stage,'result.json')),false,'Cancellation must wait for the original native boundary');assert.equal(fs.existsSync(path.join(stage,'cancel-requested')),true);
   fs.writeFileSync(path.join(stage,'finish'),'finish');
   for(let i=0;!fs.existsSync(path.join(stage,'result.json'))&&i<200;i++)await pause(50);
   const result=JSON.parse(fs.readFileSync(path.join(stage,'result.json')));assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.configuredTimeout,7200);
   assert.equal(fs.existsSync(settings['jadeNative.databasePath']),false);assert.equal(fs.existsSync(path.join(stage,'broker')),false);
   const receipt={passed:true,artifact:'unmodified packaged VSIX with separate gated-native companion',extensionVersion:manifest.version,nativeDistributionVersion:native.packageVersion,nativeRuntimeExecuted:false,fakeNativePreparation:true,noDatabaseConnection:true,joinedConnectClicks:3,nativePreparations:result.nativePreparations,workingDatabaseTimeoutSeconds:result.configuredTimeout,quietElapsedProgressVisible:true,quietHeartbeatPersistedToOwnedLog:true,safeBoundaryCancellationWaited:true,screenshots:['packaged-backup.png','packaged-restore.png','packaged-cancelling.png']};
   fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
  }finally{
   client?.close();for(const name of ['restore','finish','stop'])fs.writeFileSync(path.join(stage,name),name);
   await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>reject(Error('Owned packaged progress host did not close')),10000);child.once('close',()=>{clearTimeout(timer);resolve();});});
  }
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
