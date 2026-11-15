'use strict';
// Local delivery proof. The packaged extension remains unmodified; a separate
// development extension opens Settings in an owned, disposable VS Code profile.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),expected=JSON.parse(fs.readFileSync(path.join(root,'extension/package.json'))),nativePin=JSON.parse(fs.readFileSync(path.join(root,'packages/jade-cli-pin.json')));
if(!process.env.JADE_TEST_CODE||!process.env.JADE_TEST_VSIX)throw Error('Set JADE_TEST_CODE and JADE_TEST_VSIX for an owned packaged Settings proof.');
const {HostTestArtifacts}=require(path.join(root,'scripts/HostTestArtifacts.cjs'));
const {connectPrivateDebugger}=require(path.join(root,'scripts/creation-ui-capture.cjs'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const artifacts=new HostTestArtifacts();
 await artifacts.run(async stage=>{
  const unpacked=path.join(stage,'package'),extensions=path.join(stage,'extensions'),harness=path.join(stage,'harness'),workspace=path.join(stage,'workspace');
  const unzip=spawnSync('pwsh',['-NoProfile','-Command','[IO.Compression.ZipFile]::ExtractToDirectory($env:JADE_SETTINGS_VSIX,$env:JADE_SETTINGS_PACKAGE)'],{env:{...process.env,JADE_SETTINGS_VSIX:path.resolve(process.env.JADE_TEST_VSIX),JADE_SETTINGS_PACKAGE:unpacked},windowsHide:true,encoding:'utf8'});
  if(unzip.status!==0)throw Error(unzip.stderr||'VSIX extraction failed');
  const packageRoot=path.join(unpacked,'extension'),manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'))),id=manifest.publisher+'.'+manifest.name;
  assert.equal(manifest.version,expected.version);assert.equal(manifest.jadeNative.minimumCliVersion,expected.jadeNative.minimumCliVersion);
  assert.equal(JSON.parse(fs.readFileSync(path.join(packageRoot,'vendor/jade-tools-cli/distribution.json'))).packageVersion,nativePin.version);
  fs.mkdirSync(extensions);fs.renameSync(packageRoot,path.join(extensions,id+'-'+manifest.version));fs.mkdirSync(harness);fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'working-settings-proof',publisher:'jade-delivery-proof',version:'1.0.0',engines:manifest.engines,main:'./main.cjs',activationEvents:['onStartupFinished']}));
  fs.writeFileSync(path.join(harness,'main.cjs'),[
   "const fs=require('node:fs'),vscode=require('vscode');",
   'exports.activate=async context=>{',
   "fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));",
   'const extension=vscode.extensions.getExtension('+JSON.stringify(id)+');if(!extension)throw Error("Packaged extension not discovered");await extension.activate();',
   "const folder=vscode.workspace.workspaceFolders[0];const config=vscode.workspace.getConfiguration('jadeNative',folder.uri);",
   "fs.writeFileSync(process.env.JADE_SETTINGS_REPORT,JSON.stringify({version:extension.packageJSON.version,minimumCli:extension.packageJSON.jadeNative.minimumCliVersion,default:config.get('workingDatabaseDirectory'),defaultOverridden:config.inspect('workingDatabaseDirectory').workspaceFolderValue!==undefined}));",
   "await vscode.commands.executeCommand('workbench.action.openSettings','@id:jadeNative.workingDatabaseDirectory');",
   "let updated=false;const timer=setInterval(async()=>{if(!updated&&fs.existsSync(process.env.JADE_SETTINGS_RELATIVE)){updated=true;await config.update('workingDatabaseDirectory','.jade/working',vscode.ConfigurationTarget.WorkspaceFolder);}if(fs.existsSync(process.env.JADE_SETTINGS_STOP)){clearInterval(timer);void vscode.commands.executeCommand('workbench.action.quit');}},100);context.subscriptions.push({dispose(){clearInterval(timer)}});};",
  ].join('\n'));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const stop=path.join(stage,'stop'),relative=path.join(stage,'relative'),report=path.join(stage,'settings-report.json');
  const env={...process.env,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_SETTINGS_REPORT:report,JADE_SETTINGS_RELATIVE:relative,JADE_SETTINGS_STOP:stop,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json')};delete env.ELECTRON_RUN_AS_NODE;delete env.JADE_INSTALL;
  const child=spawn(process.env.JADE_TEST_CODE,['--new-window','--remote-debugging-port='+port,'--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',extensions,'--extensionDevelopmentPath='+harness,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env,windowsHide:true,stdio:'ignore'});artifacts.track(child);
  let client;try{
   for(let i=0;i<150&&!client;i++){try{client=await connectPrivateDebugger(port);}catch{await pause(100);}}assert.ok(client,'Private VS Code did not start');let session;
   for(let i=0;i<200;i++){
    if(!session){const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(row=>row.type==='page'&&row.url.startsWith('vscode-file://'));if(page)session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;}
    if(session){const result=await client.request('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},session);if(result.result.value?.includes('new bases use .jade/working'))break;}
    if(i===199)throw Error('Packaged Working setting did not render');await pause(100);
   }
   const actual=JSON.parse(fs.readFileSync(report));assert.equal(actual.default,'');assert.equal(actual.defaultOverridden,false);assert.equal(fs.existsSync(path.join(workspace,'.vscode/settings.json')),false);
   const selected=await client.request('Runtime.evaluate',{expression:"(()=>{const tab=Array.from(document.querySelectorAll('[role=tab],a,button')).find(element=>element.textContent.trim()==='Workspace');if(!tab)return false;tab.click();return true;})()",returnByValue:true},session);assert.equal(selected.result.value,true,'Workspace Settings tab was not found');
   const output=path.join(root,'docs/screenshots/project-working');fs.mkdirSync(output,{recursive:true});
   const capture=async name=>{await pause(250);const {data}=await client.request('Page.captureScreenshot',{format:'png'},session);fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data,'base64'));};
   await capture('automatic-location');fs.writeFileSync(relative,'set');
   for(let i=0;i<100;i++){const settings=path.join(workspace,'.vscode/settings.json');if(fs.existsSync(settings)&&fs.readFileSync(settings,'utf8').includes('.jade/working'))break;if(i===99)throw Error('Explicit relative setting did not persist');await pause(100);}
   for(let i=0;i<100;i++){const result=await client.request('Runtime.evaluate',{expression:"Array.from(document.querySelectorAll('input')).some(input=>input.value==='.jade/working')",returnByValue:true},session);if(result.result.value)break;if(i===99)throw Error('Workspace Settings did not display the relative override');await pause(100);}
   await capture('relative-location');assert.equal(fs.existsSync(path.join(stage,'broker/owner.json')),false,'Settings proof must not start native database operations');
   console.log(JSON.stringify({passed:true,packagedVersion:actual.version,minimumCli:actual.minimumCli,automaticDefaultDelegated:true,relativeSettingSaved:true,nativeBrokerStarted:false,screenshots:['automatic-location.png','relative-location.png']}));
  }finally{client?.close();fs.writeFileSync(stop,'stop');await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>reject(Error('Private Settings host did not close')),10000);child.once('close',()=>{clearTimeout(timer);resolve();});});}
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
