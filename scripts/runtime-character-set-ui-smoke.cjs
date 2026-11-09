'use strict';
// Opt-in Settings UI proof: a fresh private profile, no native operation.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {HostTestArtifacts}=require('./HostTestArtifacts.cjs');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 if(!process.env.JADE_TEST_CODE)throw Error('Set JADE_TEST_CODE to the local VS Code executable.');
 const root=path.resolve(__dirname,'..'),artifacts=new HostTestArtifacts();
 await artifacts.run(async stage=>{
  const extension=path.join(stage,'extension'),workspace=path.join(stage,'workspace');fs.cpSync(path.join(root,'extension'),extension,{recursive:true});fs.mkdirSync(workspace);
  const manifestFile=path.join(extension,'package.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.main='./test/settings-ui.cjs';manifest.activationEvents=[...(manifest.activationEvents||[]),'onStartupFinished'];fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.mkdirSync(path.join(extension,'test'),{recursive:true});
  fs.writeFileSync(path.join(extension,'test/settings-ui.cjs'),[
   "const fs=require('node:fs'),vscode=require('vscode'),original=require('../src/extension');",
   "exports.activate=async context=>{fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));await original.activate(context);await vscode.commands.executeCommand('workbench.action.openSettings','@id:jadeNative.characterSet');const timer=setInterval(()=>{if(fs.existsSync(process.env.JADE_CHARACTER_SET_STOP)){clearInterval(timer);void vscode.commands.executeCommand('workbench.action.quit');}},50);context.subscriptions.push({dispose(){clearInterval(timer)}});};exports.deactivate=()=>original.deactivate?.();",
  ].join('\n'));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const stop=path.join(stage,'stop'),env={...process.env,JADE_CHARACTER_SET_STOP:stop,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json')};delete env.ELECTRON_RUN_AS_NODE;delete env.JADE_INSTALL;
  const child=spawn(process.env.JADE_TEST_CODE,['--new-window','--remote-debugging-port='+port,'--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',path.join(stage,'extensions'),'--extensionDevelopmentPath='+extension,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env,windowsHide:true,stdio:'ignore'});artifacts.track(child);
  let client;try{
   for(let i=0;i<100&&!client;i++){try{client=await connectPrivateDebugger(port);}catch{await pause(100);}}assert.ok(client,'Private Settings host did not start');let session;
   for(let i=0;i<150;i++){
    if(!session){const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(row=>row.type==='page'&&row.url.startsWith('vscode-file://'));if(page)session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;}
    if(session){const body=await client.request('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},session);if(body.result.value?.includes('Native runtime character set. Auto detects your Jade installation.'))break;}
    if(i===149)throw Error('The character-set setting did not render');await pause(100);
   }
   await pause(250);const {data}=await client.request('Page.captureScreenshot',{format:'png'},session),destination=path.join(root,'docs/screenshots/runtime-character-set/setting.png');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,Buffer.from(data,'base64'));
   assert.equal(fs.existsSync(path.join(workspace,'.vscode/settings.json')),false,'Default selection must not write workspace settings');assert.equal(fs.existsSync(path.join(stage,'broker/owner.json')),false,'Settings proof must not start a native broker');console.log('PASS actual character-set Settings UI; default auto; no project settings write or native operation.');
  }finally{client?.close();fs.writeFileSync(stop,'stop');await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>reject(Error('Private Settings host did not close')),10000);child.once('close',()=>{clearTimeout(timer);resolve();});});}
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
