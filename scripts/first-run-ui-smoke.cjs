'use strict';
// Opt-in UI proof. Only a newly owned private VS Code profile is controlled.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {HostTestArtifacts}=require('./HostTestArtifacts.cjs');
const {connectPrivateDebugger}=require('./creation-ui-capture.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(mode){
 const artifacts=new HostTestArtifacts();
 await artifacts.run(async stage=>{
  const extension=path.join(stage,'extension'),workspace=path.join(stage,'workspace');
  fs.cpSync(path.resolve(__dirname,'../extension'),extension,{recursive:true});fs.mkdirSync(workspace);
  const manifestPath=path.join(extension,'package.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
  manifest.main='./test/first-run.cjs';manifest.activationEvents=[...(manifest.activationEvents||[]),'onStartupFinished'];fs.writeFileSync(manifestPath,JSON.stringify(manifest));fs.mkdirSync(path.join(extension,'test'),{recursive:true});
  fs.writeFileSync(path.join(extension,'test/first-run.cjs'),`const fs=require('node:fs'),vscode=require('vscode'),original=require('../src/extension');exports.activate=async context=>{fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));await original.activate(context);setTimeout(()=>vscode.commands.executeCommand(process.env.JADE_FIRST_RUN_COMMAND),500);const timer=setInterval(()=>{if(fs.existsSync(process.env.JADE_FIRST_RUN_STOP)){clearInterval(timer);void vscode.commands.executeCommand('workbench.action.quit');}},100);context.subscriptions.push({dispose(){clearInterval(timer)}});};exports.deactivate=()=>original.deactivate?.();`);
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const stop=path.join(stage,'stop'),env={...process.env,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_FIRST_RUN_STOP:stop,JADE_FIRST_RUN_COMMAND:mode==='installation'?'jadeNative.discover':'jadeNative.connectObjects',JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json')};delete env.ELECTRON_RUN_AS_NODE;delete env.JADE_INSTALL;
  const child=spawn(process.env.JADE_TEST_CODE,['--new-window','--remote-debugging-port='+port,'--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',path.join(stage,'extensions'),'--extensionDevelopmentPath='+extension,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',...(mode!=='empty'?[workspace]:[])],{env,windowsHide:true,stdio:'ignore'});artifacts.track(child);
  let client;try{
   for(let i=0;i<100&&!client;i++){try{client=await connectPrivateDebugger(port);}catch{await pause(100);}}
   assert.ok(client,'Private VS Code debugger did not start');let session;
   const expected=mode==='installation'?'Choose Jade installation folder':mode==='empty'?'Create a new folder or open an existing folder for your Jade source.':'Browse to your Jade installation folder to set up this source workspace.';
   for(let i=0;i<150;i++){
    if(!session){const {targetInfos}=await client.request('Target.getTargets');const page=targetInfos.find(row=>row.type==='page'&&row.url.startsWith('vscode-file://'));if(page)session=(await client.request('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;}
    if(session){const result=await client.request('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},session);if(result.result.value?.includes(expected))break;}
    if(i===149)throw Error('Expected first-run guidance was not shown');await pause(100);
   }
   await pause(300);const {data}=await client.request('Page.captureScreenshot',{format:'png'},session);
   const destination=path.resolve(__dirname,'../docs/screenshots/first-run',mode+'.png');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,Buffer.from(data,'base64'));
   console.log('PASS private '+mode+' first-run guidance: '+destination);
  }finally{client?.close();fs.writeFileSync(stop,'stop');await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>reject(Error('Private host did not close')),10000);child.once('close',()=>{clearTimeout(timer);resolve();});});}
 });
}
if(!process.env.JADE_TEST_CODE)throw Error('Set JADE_TEST_CODE to the local VS Code executable.');
(async()=>{await run('empty');await run('unconfigured');await run('installation');})().catch(error=>{console.error(error);process.exitCode=1;});
