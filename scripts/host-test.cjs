const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const {HostTestArtifacts}=require('./HostTestArtifacts.cjs');
async function main(){
 const artifacts=new HostTestArtifacts();artifacts.assertFreeSpace();
 const classSourceSplitUi=process.argv.includes('--class-source-split-ui'),classWorkspaceUi=classSourceSplitUi||process.argv.includes('--class-workspace-ui'),memberTreeUi=process.argv.includes('--member-tree-ui'),objectWorkspaceUi=memberTreeUi||process.argv.includes('--object-workspace-ui');
 const collectionFamilies=process.argv.includes('--collection-families'),creation=collectionFamilies||process.argv.includes('--creation'),nativeOids=process.argv.includes('--native-oids'),formatting=process.argv.includes('--formatting'),workspaces=process.argv.includes('--workspaces'),incremental=process.argv.includes('--incremental');
 require('./bundle-cli.cjs').bundleCli({minimumVersion:workspaces?require('../extension/package.json').jadeNative.minimumCliVersion:undefined});
 artifacts.nativeSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../extension/vendor/jade-tools-cli/jade-cli.exe'))).digest('hex');
 const sharedConnection=process.argv.includes('--shared-connection');
 const cliIntegration=process.argv.includes('--cli'),alternating=process.argv.includes('--alternating'),perf=process.argv.includes('--perf'),project=process.argv.includes('--project'),pull=process.argv.includes('--pull'),debug=sharedConnection||process.argv.includes('--debug'),collections=process.argv.includes('--collections'),classes=process.argv.includes('--classes'),objects=process.argv.includes('--objects'),impact=process.argv.includes('--impact'),testDebug=process.argv.includes('--test-debug');
 const cancellation=new AbortController(),cancel=()=>cancellation.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{return await artifacts.run(async stage=>{
 const base=path.resolve(__dirname,'..'),repository=base,extension=path.join(stage,'extension'),workspace=path.join(stage,'workspace');
 let creationPort;
 if(creation||classWorkspaceUi||objectWorkspaceUi||sharedConnection){const server=require('node:net').createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});creationPort=server.address().port;await new Promise(resolve=>server.close(resolve));}
 const packagedVsix=sharedConnection?process.env.JADE_SHARED_CONNECTION_VSIX:creation?process.env.JADE_CREATION_VSIX:objectWorkspaceUi?process.env.JADE_OBJECT_WORKSPACE_VSIX:classWorkspaceUi?process.env.JADE_CLASS_WORKSPACE_VSIX:undefined;
 if(packagedVsix){
  // Exercise the packaged product, then append the private test entry point.
  // .NET validates ZIP destination containment; reject non-product entries and
  // links before extraction so no test owner marker can be overwritten.
  const script=`$ErrorActionPreference='Stop';$zip=[IO.Compression.ZipFile]::OpenRead($env:JADE_CREATION_VSIX);try{$total=0;if($zip.Entries.Count -gt 4096){throw 'VSIX entry limit exceeded'};foreach($entry in $zip.Entries){$total+=$entry.Length;if($total -gt 268435456){throw 'VSIX size limit exceeded'};if($entry.FullName -notmatch '^(extension/|extension.vsixmanifest$|\\[Content_Types\\]\\.xml$)' -or $entry.FullName.Contains('..') -or $entry.FullName.Contains('\\') -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Unsafe VSIX entry'}}}finally{$zip.Dispose()};[IO.Compression.ZipFile]::ExtractToDirectory($env:JADE_CREATION_VSIX,$env:JADE_CREATION_STAGE)`;
  execFileSync('pwsh',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,JADE_CREATION_VSIX:path.resolve(packagedVsix),JADE_CREATION_STAGE:stage},windowsHide:true,stdio:'pipe'});
  require('./bundle-cli.cjs').bundleCli({source:path.join(extension,'vendor/jade-tools-cli'),pinFile:path.join(base,'packages/jade-cli-pin.json'),verifyOnly:true});
 }else fs.cpSync(path.join(base,'extension'),extension,{recursive:true,filter:source=>!['dist','.vscode'].includes(path.relative(path.join(base,'extension'),source).split(path.sep)[0])});
 fs.mkdirSync(path.join(extension,'test'));fs.copyFileSync(path.join(base,'test/'+(nativeOids?'vscode-native-oids-smoke.js':incremental?'vscode-incremental-build-smoke.js':workspaces?'vscode-workspaces-smoke.js':formatting?'vscode-formatting-smoke.js':cliIntegration?'vscode-cli-smoke.js':alternating?'vscode-alternating-tests-smoke.js':perf?'vscode-performance-smoke.js':testDebug?'vscode-test-debug-smoke.js':impact?'vscode-impact-smoke.js':objects?'vscode-objects-smoke.js':classes?'vscode-class-view-smoke.js':collections?'vscode-collections-smoke.js':debug?'vscode-debug-smoke.js':pull?'vscode-pull-smoke.js':project?'vscode-project-smoke.js':'vscode-headless-smoke.js')),path.join(extension,'test/implementation.js'));
 if(classWorkspaceUi||process.argv.includes('--class-workspace-editor')){fs.copyFileSync(path.join(base,'test/vscode-class-workspace-editor-smoke.js'),path.join(extension,'test/implementation.js'));const manifestPath=path.join(extension,'package.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.contributes.customEditors=[...(manifest.contributes.customEditors||[]),{viewType:'jade.testClassWorkspace',displayName:'Class Workspace Proof',selector:[{filenamePattern:'*.cls'}],priority:'option'}];fs.writeFileSync(manifestPath,JSON.stringify(manifest));}
 fs.writeFileSync(path.join(extension,'test/smoke.js'),"const fs=require('node:fs');exports.run=async()=>{fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));return require('./implementation').run();};");
 if(creation){fs.copyFileSync(path.join(base,collectionFamilies?'test/vscode-collection-families-smoke.js':'test/vscode-creation-smoke.js'),path.join(extension,'test/implementation.js'));fs.copyFileSync(path.join(base,'scripts/creation-ui-capture.cjs'),path.join(extension,'test/creation-ui-capture.cjs'));fs.copyFileSync(path.join(base,'test/vscode-creation-project-smoke.js'),path.join(extension,'test/vscode-creation-project-smoke.js'));fs.cpSync(path.join(base,'test/fixtures/creation-imports'),path.join(extension,'test/fixtures/creation-imports'),{recursive:true});}
 if(classWorkspaceUi){fs.copyFileSync(path.join(base,'scripts/creation-ui-capture.cjs'),path.join(extension,'test/creation-ui-capture.cjs'));fs.copyFileSync(path.join(base,classSourceSplitUi?'test/vscode-class-source-split-ui-smoke.js':process.env.JADE_SCRATCH_PAD_MERMAID_PROOF==='1'?'test/vscode-scratch-pad-mermaid-smoke.js':process.env.JADE_CLASS_WORKSPACE_MOVE_PROOF==='1'?'test/vscode-class-workspace-move-smoke.js':'test/vscode-class-workspace-ui-smoke.js'),path.join(extension,'test/implementation.js'));fs.copyFileSync(path.join(base,'scripts/class-workspace-ui-capture.cjs'),path.join(extension,'test/class-workspace-ui-capture.cjs'));}
 if(classWorkspaceUi&&process.env.JADE_SCRATCH_PAD_SAVE_PROOF==='1')fs.copyFileSync(path.join(base,'test/vscode-scratch-pad-failure-save-smoke.js'),path.join(extension,'test/implementation.js'));
 if(classWorkspaceUi){
  // VS Code intentionally suppresses modal dialogs under extensionTestsPath.
  // The private development host runs the same staged product normally, so
  // native Save/Discard/Cancel and source-recovery confirmation are real UI.
  const manifestPath=path.join(extension,'package.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const commandSpies={'jadeNative.buildWorkspace':'jade.test.buildWorkspace','jadeNative.publishClass':'jade.test.publishClass','jadeNative.runLocalTests':'jade.test.runLocalTests'};
  manifest.contributes.keybindings=manifest.contributes.keybindings.map(binding=>({...binding,command:commandSpies[binding.command]||binding.command}));
  manifest.main='./test/ui-main.js';manifest.activationEvents=[...new Set([...(manifest.activationEvents||[]),'onStartupFinished'])];
  fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  fs.writeFileSync(path.join(extension,'test/ui-main.js'),[
   "'use strict';",
   "const fs=require('node:fs'),vscode=require('vscode'),original=require('../src/extension');",
   "exports.activate=async context=>{",
   " fs.writeFileSync(process.env.JADE_HOST_PROCESS_FILE,JSON.stringify({pid:process.pid,nonce:process.env.JADE_HOST_OWNER}));",
   " let api;try{api=await original.activate(context);}catch(error){fs.writeFileSync(process.env.JADE_HEADLESS_HOST_REPORT,JSON.stringify({passed:false,error:error.stack}));await vscode.commands.executeCommand('workbench.action.quit');return;}",
   " const runSmoke=async()=>{try{await require('./implementation').run(context);}catch(error){if(!fs.existsSync(process.env.JADE_HEADLESS_HOST_REPORT))fs.writeFileSync(process.env.JADE_HEADLESS_HOST_REPORT,JSON.stringify({passed:false,error:error.stack}));}finally{await vscode.commands.executeCommand('workbench.action.quit');}};",
   " if(process.env.JADE_CLASS_WORKSPACE_MOVE_PROOF==='1')void runSmoke();else setTimeout(runSmoke,100);",
   " return api;",
   "};",
   "exports.deactivate=()=>original.deactivate?.();",
  ].join('\n'));
 }
 if(objectWorkspaceUi){for(const [source,target] of [[memberTreeUi?'test/vscode-member-tree-ui-smoke.js':'test/vscode-object-workspace-ui-smoke.js','implementation.js'],['scripts/creation-ui-capture.cjs','creation-ui-capture.cjs'],['scripts/class-workspace-ui-capture.cjs','class-workspace-ui-capture.cjs']])fs.copyFileSync(path.join(base,source),path.join(extension,'test',target));const manifestPath=path.join(extension,'package.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.main='./test/object-fixture-owner.cjs';manifest.contributes.views.jadeNative=[{id:'jade.testInspectionInstances',name:memberTreeUi?'Object Explorer':'Database Objects'}];fs.writeFileSync(manifestPath,JSON.stringify(manifest));fs.writeFileSync(path.join(extension,'test/object-fixture-owner.cjs'),'exports.activate=()=>{};');}
 if(sharedConnection)fs.copyFileSync(path.join(base,'scripts/creation-ui-capture.cjs'),path.join(extension,'test/creation-ui-capture.cjs'));
 if(cliIntegration||workspaces||incremental||nativeOids)fs.copyFileSync(path.join(base,'test/PrivateNativeFixture.js'),path.join(extension,'test/PrivateNativeFixture.js'));
 if(cliIntegration||workspaces||incremental)fs.copyFileSync(path.join(base,'test/cli-integration-fixture.js'),path.join(extension,'test/cli-integration-fixture.js'));
 if(alternating)fs.copyFileSync(path.join(base,'inspector/application-probe.ddx'),path.join(extension,'test/application-probe.ddx'));
 if(pull&&fs.existsSync(workspace)&&fs.readdirSync(workspace).length)throw Error('Pull verification requires an empty folder: '+workspace);
 fs.mkdirSync(workspace,{recursive:true});
 if(classWorkspaceUi&&process.env.JADE_SCRATCH_PAD_MERMAID_PROOF==='1'){fs.mkdirSync(path.join(workspace,'.vscode'),{recursive:true});fs.writeFileSync(path.join(workspace,'.vscode/settings.json'),JSON.stringify({'inlineChat.notebookAgent':true}));}

 if(debug)fs.writeFileSync(path.join(workspace,'VsCodeDebugProbe.cls'),fs.readFileSync(path.join(base,'test/fixtures/DebugDemo.cls'),'utf8').replaceAll('DebugDemo','VsCodeDebugProbe'));
 for(const name of (creation||objectWorkspaceUi||nativeOids||incremental||workspaces||formatting||cliIntegration||alternating||perf||project||pull||debug||collections||classes||objects||impact||testDebug?[]:['schemas/SJetSchema/types/Fish.cls','schemas/SJetTestSchema/types/BaseUnitTest.cls','schemas/SJetTestSchema/types/FishTest.cls'])){
  const to=path.join(workspace,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,fs.readFileSync(path.join(repository,'test/fixtures/workspace',name),'utf8').replaceAll('BaseUnitTest','HostFreshBaseUnitTest').replaceAll('FishTest','HostFreshFishTest'));
 }
 const code=process.env.JADE_TEST_CODE;if(!code||!fs.existsSync(code))throw Error('Set JADE_TEST_CODE to a VS Code executable for isolated extension-host tests.');
 // Every run owns a newly created, nonce-marked stage. A report that did not
 // exist before launch belongs to this run; filesystem clocks can lag Date.now.
 const report=path.join(stage,'host-report.json');
 if(fs.existsSync(report))throw Error('Unexpected existing report in a fresh owned host stage.');
 artifacts.evidencePath=path.join(base,nativeOids?'evidence/vscode-native-oids-host.json':incremental?'evidence/vscode-incremental-host.json':workspaces?'evidence/vscode-workspaces-host.json':formatting?'evidence/vscode-formatting-host.json':cliIntegration?'evidence/vscode-cli-host.json':alternating?'evidence/vscode-alternating-tests-host.json':perf?'evidence/vscode-performance-host.json':testDebug?'evidence/vscode-test-debug-host.json':impact?'evidence/vscode-impact-host.json':objects?'evidence/vscode-objects-host.json':classes?'evidence/vscode-class-view-host.json':collections?'evidence/vscode-collections-host.json':debug?'evidence/vscode-debug-host.json':pull?'evidence/vscode-pull-host.json':project?'evidence/vscode-project-host.json':'evidence/vscode-host.json');
 if(process.argv.includes('--class-workspace-editor'))artifacts.evidencePath=path.join(base,'evidence/vscode-class-workspace-editor-host.json');
 const hostEnv={...process.env,JADE_HEADLESS_HOST_REPORT:report,JADE_HOST_PROCESS_FILE:path.join(stage,'host-process.json'),JADE_HOST_OWNER:artifacts.nonce,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_TOOLS_CONNECTIONS_FILE:path.join(stage,'connections.json')};delete hostEnv.ELECTRON_RUN_AS_NODE;
 if(sharedConnection){hostEnv.JADE_SHARED_CONNECTION_PROOF='1';hostEnv.JADE_SHARED_CONNECTION_DEBUG_PORT=String(creationPort);hostEnv.JADE_SHARED_CONNECTION_SCREENSHOTS=path.join(base,'docs/screenshots/shared-connection');artifacts.evidencePath=path.join(base,'evidence/vscode-shared-connection-host.json');}
 if(creation){hostEnv.JADE_CREATION_DEBUG_PORT=String(creationPort);hostEnv.JADE_CREATION_SCREENSHOTS=path.join(base,'docs/images');artifacts.evidencePath=path.join(base,collectionFamilies?'evidence/vscode-collection-families-host.json':'evidence/vscode-creation-host.json');}
 if(classWorkspaceUi){hostEnv.JADE_CLASS_WORKSPACE_DEBUG_PORT=String(creationPort);hostEnv.JADE_CLASS_WORKSPACE_SCREENSHOTS=path.join(base,'docs/screenshots/class-workspace');artifacts.evidencePath=path.join(base,classSourceSplitUi?'evidence/vscode-class-source-split-ui-host.json':process.env.JADE_SCRATCH_PAD_MERMAID_PROOF==='1'?'evidence/vscode-scratch-pad-mermaid-host.json':process.env.JADE_CLASS_WORKSPACE_MOVE_PROOF==='1'?'evidence/vscode-class-workspace-move-host.json':'evidence/vscode-class-workspace-ui-host.json');}
 if(classWorkspaceUi&&process.env.JADE_SCRATCH_PAD_SAVE_PROOF==='1')artifacts.evidencePath=path.join(base,'evidence/vscode-scratch-pad-failure-save-host.json');
 if(objectWorkspaceUi){hostEnv.JADE_OBJECT_WORKSPACE_DEBUG_PORT=String(creationPort);hostEnv.JADE_OBJECT_WORKSPACE_SCREENSHOTS=path.join(base,'docs/screenshots/object-workspace');artifacts.evidencePath=path.join(base,memberTreeUi?'evidence/vscode-native-member-tree-ui-host.json':'evidence/vscode-object-workspace-ui-host.json');if(memberTreeUi)hostEnv.JADE_OBJECT_WORKSPACE_SCREENSHOTS=path.join(base,'docs/screenshots/class-workspace');}
 const child=spawn(code,[...((creation||classWorkspaceUi||objectWorkspaceUi||sharedConnection)?['--remote-debugging-port='+creationPort]:[]),'--new-window','--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',path.join(stage,'extensions'),'--extensionDevelopmentPath='+extension,...(classWorkspaceUi?[]:['--extensionTestsPath='+path.join(extension,'test/smoke.js')]),'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env:hostEnv,windowsHide:!creation&&!classWorkspaceUi&&!workspaces&&!incremental&&!nativeOids&&process.env.JADE_FORMATTING_UI_HOLD!=='1',stdio:'inherit'});
 await artifacts.wait(child,{signal:cancellation.signal});
 for(let i=0;i<(alternating?140:180);i++){
  if(cancellation.signal.aborted)throw Error('VS Code host cancelled.');
  if(fs.existsSync(report)){if(fs.statSync(report).size>262144)throw Error('Host report exceeds the 256 KiB evidence limit.');const result=JSON.parse(fs.readFileSync(report,'utf8'));if(!result.passed)throw Error(JSON.stringify(result));console.log('Native working-database VS Code host passed; owned artifacts will be removed.');return;}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }throw Error('No fresh VS Code host report.');
 });}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
