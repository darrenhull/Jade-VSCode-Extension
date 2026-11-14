'use strict';
// Actual unmodified VSIX + private companion host. Only native configuration runs;
// the configured runtime/Source do not exist and all profiles/broker state are owned.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const {HostTestArtifacts}=require('./HostTestArtifacts.cjs');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(!process.env.JADE_TEST_CODE||!process.env.JADE_TEST_VSIX)throw Error('Set JADE_TEST_CODE and JADE_TEST_VSIX for the packaged initialization UI proof.');
async function main(){
 const expected=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'))),pin=JSON.parse(fs.readFileSync(path.join(root,'packages/jade-cli-pin.json')));
 const artifacts=new HostTestArtifacts({evidencePath:path.join(root,'docs/test-evidence/workspace-initialization-ui.json')});
 await artifacts.run(async stage=>{
  const unpacked=path.join(stage,'package'),extensions=path.join(stage,'extensions'),harness=path.join(stage,'harness'),workspace=path.join(stage,'workspace');
  const unzip=spawnSync('pwsh',['-NoProfile','-Command','[IO.Compression.ZipFile]::ExtractToDirectory($env:JADE_INIT_VSIX,$env:JADE_INIT_PACKAGE)'],{env:{...process.env,JADE_INIT_VSIX:path.resolve(process.env.JADE_TEST_VSIX),JADE_INIT_PACKAGE:unpacked},windowsHide:true,encoding:'utf8'});
  if(unzip.status!==0)throw Error(unzip.stderr||'VSIX extraction failed');
  const packaged=path.join(unpacked,'extension'),manifest=JSON.parse(fs.readFileSync(path.join(packaged,'package.json'))),id=manifest.publisher+'.'+manifest.name,native=JSON.parse(fs.readFileSync(path.join(packaged,'vendor/jade-tools-cli/distribution.json')));
  assert.equal(manifest.version,expected.version);assert.equal(native.packageVersion,pin.version);
  artifacts.nativeSha256=native.executableSha256;
  const cleanupExe=path.join(stage,'extension/vendor/jade-tools-cli/jade-cli.exe');fs.mkdirSync(path.dirname(cleanupExe),{recursive:true});fs.copyFileSync(path.join(packaged,'vendor/jade-tools-cli/jade-cli.exe'),cleanupExe);
  fs.mkdirSync(extensions);fs.renameSync(packaged,path.join(extensions,id+'-'+manifest.version));fs.mkdirSync(harness);fs.mkdirSync(workspace);
  const project=path.join(workspace,'jade.json'),original='{\n  "connection": "cloned-ui-project"\n}\n';fs.writeFileSync(project,original);
  const config={installPath:path.join(stage,'NoInstalledJade'),databasePath:path.join(stage,'NoSource','system'),iniPath:path.join(stage,'NoSource','jade.ini'),server:'singleUser'};
  fs.writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'workspace-init-proof',publisher:'jade-delivery-proof',version:'1.0.0',engines:manifest.engines,main:'./main.cjs',activationEvents:['onStartupFinished']}));
  fs.writeFileSync(path.join(harness,'main.cjs'),[
   "const fs=require('node:fs'),vscode=require('vscode');exports.activate=async context=>{",
   "fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));",
   "const timer=setInterval(()=>{if(fs.existsSync(process.env.JADE_INIT_STOP)){clearInterval(timer);void vscode.commands.executeCommand('workbench.action.quit');}},100);context.subscriptions.push({dispose(){clearInterval(timer)}});",
   'try{const extension=vscode.extensions.getExtension('+JSON.stringify(id)+');await extension.activate();const folder=vscode.workspace.workspaceFolders[0];',
   "const config=vscode.workspace.getConfiguration('jadeNative',folder.uri);for(const [name,value]of Object.entries("+JSON.stringify(config)+"))await config.update(name,value,vscode.ConfigurationTarget.WorkspaceFolder);",
   "const result=await vscode.commands.executeCommand('jadeNative.initializeWorkspace',folder.uri);fs.writeFileSync(process.env.JADE_INIT_REPORT,JSON.stringify({result,version:extension.packageJSON.version}));",
   "}catch(error){fs.writeFileSync(process.env.JADE_INIT_REPORT,JSON.stringify({error:error.message}));}};",
  ].join('\n'));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const user=path.join(stage,'vscode-data','User');fs.mkdirSync(user,{recursive:true});fs.writeFileSync(path.join(user,'settings.json'),JSON.stringify({'window.dialogStyle':'custom','workbench.startupEditor':'none','chat.disableAIFeatures':true}));
  const stop=path.join(stage,'stop'),report=path.join(stage,'initialization-result.json'),env={...process.env,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_INIT_REPORT:report,JADE_INIT_STOP:stop,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json'),JADE_INSTALL:'',JADE_HOME:''};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(process.env.JADE_TEST_CODE,['--new-window','--remote-debugging-port='+port,'--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',extensions,'--extensionDevelopmentPath='+harness,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env,windowsHide:true,stdio:'ignore'});artifacts.track(child);
  let client,session;
  try{
   for(let i=0;i<200&&!session;i++){
    if(!client)try{client=await connectPrivateDebugger(port);}catch{}
    if(client){const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(row=>row.type==='page'&&row.url.startsWith('vscode-file://'));if(page)session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;}
    if(!session)await pause(100);
   }
   assert.ok(session,'Private VS Code renderer did not appear');
   const evaluate=async expression=>(await client.request('Runtime.evaluate',{expression,returnByValue:true},session)).result.value;
   const until=async(text)=>{for(let i=0;i<200;i++){if(String(await evaluate('document.body.innerText')).includes(text))return;if(fs.existsSync(report)){const value=JSON.parse(fs.readFileSync(report));if(value.error||value.result?.passed===false)throw Error(JSON.stringify(value));}await pause(100);}throw Error('UI did not show '+text);};
   const click=async label=>assert.equal(await evaluate("(()=>{const element=Array.from(document.querySelectorAll('button,a')).find(row=>row.textContent.trim()==="+JSON.stringify(label)+");if(!element)return false;element.click();return true;})()"),true,'Missing action '+label);
   const output=path.join(root,'docs/screenshots/workspace-initialization');fs.mkdirSync(output,{recursive:true});
   const capture=async name=>{await pause(200);const {data}=await client.request('Page.captureScreenshot',{format:'png'},session);fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data,'base64'));};
   await until('Configure This Machine');await capture('missing-profile');await click('Configure This Machine');
   await until('Create Machine Profile');await capture('review-machine-profile');await click('Create Machine Profile');
   for(let i=0;!fs.existsSync(report)&&i<200;i++)await pause(100);
   assert.ok(fs.existsSync(report),'Initialization did not settle');const result=JSON.parse(fs.readFileSync(report));assert.equal(result.result?.passed,true,JSON.stringify(result));
   await until('Jade workspace configuration is ready');await capture('configuration-complete');
   assert.equal(fs.readFileSync(project,'utf8'),original);assert.equal(fs.existsSync(config.databasePath),false);assert.equal(fs.existsSync(path.join(workspace,'.jade/working')),false);
   const profiles=JSON.parse(fs.readFileSync(path.join(stage,'connections.json')));assert.deepEqual(profiles.profiles['cloned-ui-project'],config);
   const receipt={passed:true,packagedVersion:manifest.version,nativeVersion:native.packageVersion,actualPackagedUi:true,dialogStyle:'custom in owned private profile',configurationOnly:true,missingProfileAction:true,reviewedCreation:true,existingProjectPreserved:true,databaseOpened:false,screenshots:['missing-profile.png','review-machine-profile.png','configuration-complete.png']};
   fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
  }finally{
   client?.close();fs.writeFileSync(stop,'stop');
   await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>reject(Error('Owned initialization host did not close')),10000);child.once('close',()=>{clearTimeout(timer);resolve();});});
  }
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
