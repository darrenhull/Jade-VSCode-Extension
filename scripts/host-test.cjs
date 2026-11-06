const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
async function main(){
 const formatting=process.argv.includes('--formatting'),workspaces=process.argv.includes('--workspaces');
 require('./bundle-cli.cjs').bundleCli({minimumVersion:workspaces?require('../extension/package.json').jadeNative.minimumCliVersion:undefined});
 const cliIntegration=process.argv.includes('--cli'),alternating=process.argv.includes('--alternating'),perf=process.argv.includes('--perf'),project=process.argv.includes('--project'),pull=process.argv.includes('--pull'),debug=process.argv.includes('--debug'),collections=process.argv.includes('--collections'),classes=process.argv.includes('--classes'),objects=process.argv.includes('--objects'),impact=process.argv.includes('--impact'),testDebug=process.argv.includes('--test-debug');
 const base=path.resolve(__dirname,'..'),repository=base,stage=fs.mkdtempSync(path.join(os.tmpdir(),'jade-headless-host-')),extension=path.join(stage,'extension'),workspace=path.join(stage,'workspace');
 fs.cpSync(path.join(base,'extension'),extension,{recursive:true,filter:source=>!['dist','.vscode'].includes(path.relative(path.join(base,'extension'),source).split(path.sep)[0])});
 fs.mkdirSync(path.join(extension,'test'));fs.copyFileSync(path.join(base,'test/'+(workspaces?'vscode-workspaces-smoke.js':formatting?'vscode-formatting-smoke.js':cliIntegration?'vscode-cli-smoke.js':alternating?'vscode-alternating-tests-smoke.js':perf?'vscode-performance-smoke.js':testDebug?'vscode-test-debug-smoke.js':impact?'vscode-impact-smoke.js':objects?'vscode-objects-smoke.js':classes?'vscode-class-view-smoke.js':collections?'vscode-collections-smoke.js':debug?'vscode-debug-smoke.js':pull?'vscode-pull-smoke.js':project?'vscode-project-smoke.js':'vscode-headless-smoke.js')),path.join(extension,'test/smoke.js'));
 if(cliIntegration)fs.copyFileSync(path.join(base,'test/cli-integration-fixture.js'),path.join(extension,'test/cli-integration-fixture.js'));
 if(alternating)fs.copyFileSync(path.join(base,'inspector/application-probe.ddx'),path.join(extension,'test/application-probe.ddx'));
 if(pull&&fs.existsSync(workspace)&&fs.readdirSync(workspace).length)throw Error('Pull verification requires an empty folder: '+workspace);
 fs.mkdirSync(workspace,{recursive:true});
 if(debug)fs.writeFileSync(path.join(workspace,'VsCodeDebugProbe.cls'),fs.readFileSync(path.join(base,'test/fixtures/DebugDemo.cls'),'utf8').replaceAll('DebugDemo','VsCodeDebugProbe'));
 for(const name of (workspaces||formatting||cliIntegration||alternating||perf||project||pull||debug||collections||classes||objects||impact||testDebug?[]:['schemas/SJetSchema/types/Fish.cls','schemas/SJetTestSchema/types/BaseUnitTest.cls','schemas/SJetTestSchema/types/FishTest.cls'])){
  const to=path.join(workspace,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,fs.readFileSync(path.join(repository,'test/fixtures/workspace',name),'utf8').replaceAll('BaseUnitTest','HostFreshBaseUnitTest').replaceAll('FishTest','HostFreshFishTest'));
 }
 const code=process.env.JADE_TEST_CODE;if(!code||!fs.existsSync(code))throw Error('Set JADE_TEST_CODE to a VS Code executable for isolated extension-host tests.');const launcher=path.join(path.dirname(code),'bin/code.cmd');
 // During an update multiple resource versions coexist. Use the installed
 // launcher's active version rather than the first alphabetically named folder.
 const active=fs.existsSync(launcher)?fs.readFileSync(launcher,'utf8').match(/%~dp0\.\.\\([^"\r\n]*resources\\app\\out\\cli\.js)/i)?.[1]:undefined;
 const cli=[active&&path.join(path.dirname(code),active),path.join(path.dirname(code),'resources/app/out/cli.js'),...fs.readdirSync(path.dirname(code)).map(name=>path.join(path.dirname(code),name,'resources/app/out/cli.js'))].filter(Boolean).find(file=>fs.existsSync(file)),report=path.join(stage,'host-report.json'),started=Date.now();
 fs.mkdirSync(path.join(base,'evidence'),{recursive:true});
 const hostEnv={...process.env,JADE_HEADLESS_HOST_REPORT:report};if(workspaces){delete hostEnv.ELECTRON_RUN_AS_NODE;hostEnv.JADE_TOOLS_STATE_DIRECTORY=path.join(stage,'broker');hostEnv.JADE_TOOLS_CONNECTIONS_FILE=path.join(stage,'connections.json');}else hostEnv.ELECTRON_RUN_AS_NODE='1';
 const child=spawn(code,[...(workspaces?[]:[cli]),'--new-window','--user-data-dir',path.join(stage,'vscode-data'),'--extensions-dir',path.join(stage,'extensions'),'--extensionDevelopmentPath='+extension,'--extensionTestsPath='+path.join(extension,'test/smoke.js'),'--disable-workspace-trust','--skip-welcome','--skip-release-notes',workspace],{env:hostEnv,windowsHide:!workspaces&&process.env.JADE_FORMATTING_UI_HOLD!=='1',stdio:'inherit'});
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('VS Code launcher failed: '+code)));});
 for(let i=0;i<(alternating?140:180);i++){
  if(fs.existsSync(report)&&fs.statSync(report).mtimeMs>=started){const result=JSON.parse(fs.readFileSync(report,'utf8'));fs.copyFileSync(report,path.join(base,workspaces?'evidence/vscode-workspaces-host.json':formatting?'evidence/vscode-formatting-host.json':cliIntegration?'evidence/vscode-cli-host.json':alternating?'evidence/vscode-alternating-tests-host.json':perf?'evidence/vscode-performance-host.json':testDebug?'evidence/vscode-test-debug-host.json':impact?'evidence/vscode-impact-host.json':objects?'evidence/vscode-objects-host.json':classes?'evidence/vscode-class-view-host.json':collections?'evidence/vscode-collections-host.json':debug?'evidence/vscode-debug-host.json':pull?'evidence/vscode-pull-host.json':project?'evidence/vscode-project-host.json':'evidence/vscode-host.json'));if(!result.passed)throw Error(JSON.stringify(result));console.log('Native working-database VS Code host passed: '+stage);return;}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }throw Error('No fresh VS Code host report. Retained '+stage);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
