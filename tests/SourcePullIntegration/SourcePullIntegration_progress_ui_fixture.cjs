'use strict';
// UI-only protocol simulation: exercises real Code and SourcePullController, never Jade.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.activate=async context=>{
 const vscode=require('vscode'),stage=process.env.JADE_UI_STAGE,base=process.env.JADE_UI_REPOSITORY,failure=process.env.JADE_UI_FAILURE_TRACE==='1';
 fs.writeFileSync(path.join(stage,'host-process.json'),JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));
 void(async()=>{
  let controller;
  try{
   const {SourcePullController}=require('./src/SourcePullController'),workspace=vscode.workspace.workspaceFolders[0].uri.fsPath,folder=vscode.workspace.workspaceFolders[0];
   const readme=await vscode.workspace.openTextDocument(path.join(workspace,'UI VERIFICATION - SIMULATED PROTOCOL.md'));await vscode.window.showTextDocument(readme,{preview:false});
   const payloads={'schemas/UiProof.scm':'jadeVersionNumber "25.0.02";\nschemaDefinition\nUiProof subschemaOf RootSchema completeDefinition;\n','schemas/UiProof/types/Probe.cls':'jadeVersionNumber "25.0.02";\nschemaDefinition\nUiProof subschemaOf RootSchema partialDefinition;\ntypeHeaders\n Probe subclassOf Object transient;\ntypeDefinitions\n Probe completeDefinition\n (\n )\ndatabaseDefinitions\ntypeSources\n','schemas/UiProof/schemaResources.ddx':'<schema name="UiProof" CompleteDefinition="false"/>'};
   let busy=false,stopped=false;
   const service={sourceCapabilities:async()=>({sourceExtraction:{protocol:1,scopes:['all'],fullSchema:true,available:true,layout:'schema-ddx',requiresPromotionPermit:true,versions:['current']}}),startSourceExtraction:(_config,input,callbacks)=>{
    const operation={started:true,stop:()=>{stopped=true;}};
    operation.completion=(async()=>{
     callbacks.onOutput('UI VERIFICATION ONLY — SIMULATED PROTOCOL; NO DATABASE OR NATIVE PROCESS.\n');callbacks.onStarted?.();
     if(failure){callbacks.onStage({stage:'inventory',completedFiles:0,totalFiles:0});return {passed:false,code:1205,status:'failed',scope:'all',version:'current',authoritative:false,partial:false,completedFiles:0,counts:{},report:{error:'SIMULATED Native isSystemSchema: Jade 1205: Method aborted',executionSchema:'JadeSchema',sourceVersion:'CURRENT',stage:'inventory',targetSchema:'UiProof',lastSuccessfullySelectedSchema:'UiProof',recentOperations:[{stage:'inventory',targetSchema:'UiProof',operation:'beginInventory',receiverNull:false,receiverKind:'Schema'},{stage:'inventory',targetSchema:'UiProof',currentType:'Probe',operation:'isSystemSchema',receiverNull:false,receiverKind:'Schema'}]}};}
     for(const stageName of ['opening','git-baseline','inventory','local-snapshot','native-write','hash-and-compare']){
      callbacks.onStage({stage:stageName,completedFiles:0,totalFiles:3});await delay(500);
      if(stageName==='hash-and-compare'){
       await vscode.commands.executeCommand('notifications.showList');await delay(500);
       await require(path.join(base,'tests/SourcePullIntegration/SourcePullIntegration_host_fixture.cjs')).screenshot(Number(process.env.JADE_UI_PORT),process.env.JADE_UI_SCREENSHOT);
      }
     }
     callbacks.onStage({stage:'guarded-apply',completedFiles:0,totalFiles:3});
     for(const [relative,text] of Object.entries(payloads)){assert.equal(callbacks.onPermit({path:relative}),true);const file=path.join(input.destination,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);callbacks.onFile({path:relative,outcome:'added',bytes:Buffer.byteLength(text)});}
     callbacks.onStage({stage:'closing',completedFiles:3,totalFiles:3});
     return {passed:true,code:0,status:'completed',scope:'all',version:'current',authoritative:true,partial:false,completedFiles:3,counts:{added:3},appliedFiles:3};
    })();return operation;
   }};
   controller=new SourcePullController(vscode,context,{service,resolveProject:async()=>({folder,destination:workspace,cwd:workspace,config:{databasePath:'UI simulation — no database opened',workspaceRoots:[workspace]}}),settings:()=>({}),beforeOperation:async()=>{},isBusy:()=>busy,setBusy:async value=>{busy=value;},index:{pauseDiskUpdates:async()=>async()=>{},schedule(){}},testing:{discover:async()=>{}},classView:{refresh:async()=>{}}});
   const result=await controller.runAll(folder.uri);assert.equal(result.passed,!failure,JSON.stringify(result));assert.equal(stopped,false);assert.equal(busy,false);
   if(failure){assert.equal(result.code,1205);await vscode.commands.executeCommand('notifications.clearAll');await vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');await delay(700);await require(path.join(base,'tests/SourcePullIntegration/SourcePullIntegration_host_fixture.cjs')).screenshot(Number(process.env.JADE_UI_PORT),process.env.JADE_UI_SCREENSHOT);}
   fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify({passed:true,simulatedProtocol:true,nativeProcessStarted:false,databaseOpened:false,renderedStage:failure?'failed-inventory-context':'hash-and-compare',completedFiles:failure?0:3,screenshot:failure?'docs/screenshots/source-extraction-failure-context/failure-output-ui-simulation.png':'docs/screenshots/full-workspace-publish/source-progress-ui-simulation.png'}));
  }catch(error){fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify({passed:false,error:error.stack,simulatedProtocol:true,nativeProcessStarted:false}));}
  finally{await controller?.dispose();await vscode.commands.executeCommand('workbench.action.quit');}
 })();
};
async function main(){
 const base=path.resolve(__dirname,'../..'),code=process.env.JADE_TEST_CODE;if(!code||!fs.existsSync(code))throw Error('Set JADE_TEST_CODE to the existing Code executable.');
 const failure=process.env.JADE_UI_FAILURE_TRACE==='1',{HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs'),artifacts=new HostTestArtifacts({evidencePath:path.join(base,failure?'tests/SourceExtractionFailureLog/receipts/failure-output-ui-simulation.json':'tests/ProjectTools/receipts/source-progress-ui-simulation.json')});
 await artifacts.run(async stage=>{
  const extension=path.join(stage,'extension'),workspace=path.join(stage,'UI verification - simulated protocol');fs.mkdirSync(extension);fs.mkdirSync(workspace);
  fs.cpSync(path.join(base,'extension/src'),path.join(extension,'src'),{recursive:true});fs.mkdirSync(path.join(extension,'vendor'));fs.copyFileSync(path.join(base,'extension/vendor/sax.js'),path.join(extension,'vendor/sax.js'));
  fs.copyFileSync(__filename,path.join(extension,'ui-main.cjs'));fs.writeFileSync(path.join(extension,'package.json'),JSON.stringify({name:'jade-ui-verification',displayName:'Jade UI verification (simulated protocol)',publisher:'jade-local-tools',version:'0.0.0',engines:{vscode:'^1.96.0'},main:'./ui-main.cjs',activationEvents:['onStartupFinished']}));
  fs.writeFileSync(path.join(workspace,'UI VERIFICATION - SIMULATED PROTOCOL.md'),'# Jade Tools · UI verification\n\nSIMULATED PROTOCOL — NO DATABASE\n\nThis is the actual Source Pull interface in an isolated Code host.\nOnly progress events are simulated; no Jade process is launched.\n\nThe new stages distinguish:\n\n- committed Git baseline\n- local source snapshot\n- native writing\n- hashing and content comparison\n- approved file application\n\nNative edit → review → publish is verified separately against disposable databases.\nThis screen is not a native performance benchmark.\n');
  const data=path.join(stage,'data');fs.mkdirSync(path.join(data,'User'),{recursive:true});fs.writeFileSync(path.join(data,'User/settings.json'),JSON.stringify({'window.title':'Jade Tools UI verification — SIMULATED PROTOCOL','workbench.startupEditor':'none','workbench.panel.defaultLocation':'right','workbench.panel.opensMaximized':'never','telemetry.telemetryLevel':'off','update.mode':'none','extensions.autoCheckUpdates':false,'extensions.autoUpdate':false,'security.workspace.trust.enabled':false,'editor.wordWrap':'on'}));
  const server=require('node:net').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const env={...process.env,JADE_UI_STAGE:stage,JADE_UI_REPOSITORY:base,JADE_UI_PORT:String(port),JADE_UI_SCREENSHOT:path.join(base,failure?'docs/screenshots/source-extraction-failure-context/failure-output-ui-simulation.png':'docs/screenshots/full-workspace-publish/source-progress-ui-simulation.png'),JADE_HOST_OWNER:artifacts.nonce};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(code,['--new-window','--remote-debugging-port='+port,'--user-data-dir',data,'--extensions-dir',path.join(stage,'extensions'),'--extensionDevelopmentPath='+extension,'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env,windowsHide:true,stdio:'pipe'});
  let tail='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{tail=(tail+bytes).slice(-4000);});
  try{await artifacts.wait(child,{timeoutMilliseconds:120000});}catch(error){throw Error(error.message+'\n'+tail);}
  const report=JSON.parse(fs.readFileSync(path.join(stage,'host-report.json'),'utf8'));assert.equal(report.passed,true,report.error);console.log('PASS actual isolated Code '+(failure?'failure output':'progress')+' UI; protocol simulated, no native process/database, owned host artifacts cleaned.');
 });
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
