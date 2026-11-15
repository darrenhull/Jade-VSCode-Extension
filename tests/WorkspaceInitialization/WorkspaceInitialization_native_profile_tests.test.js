'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {CliWorkingSession}=require('../../extension/src/cli-client');
const {registerWorkspaceInitialization}=require('../../extension/src/workspace-initialization');

test('packaged native init repairs a cloned private profile without opening a database or rewriting the project',{
 skip:process.env.JADE_WORKSPACE_INIT_NATIVE_PROOF!=='1',timeout:30000,
},async t=>{
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'jade-init-native-')),workspace=path.join(stage,'workspace'),profiles=path.join(stage,'private','connections.json');
 fs.mkdirSync(workspace);
 const project=path.join(workspace,'jade.json'),original=Buffer.from('{\n  "connection": "cloned-project"\n}\n');
 fs.writeFileSync(project,original);
 const config={installPath:path.join(stage,'NoInstalledJade'),databasePath:path.join(stage,'Source','system'),iniPath:path.join(stage,'Source','jade.ini'),server:'singleUser'};
 const env={...process.env,JADE_TOOLS_CONNECTIONS_FILE:profiles,JADE_TOOLS_STATE_DIRECTORY:path.join(stage,'broker'),JADE_INSTALL:'',JADE_HOME:''};
 const entry=process.env.JADE_INIT_CLI||path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe');
 const client=new CliWorkingSession({entry,spawn:(exe,args,options)=>spawn(exe,args,{...options,env:{...options.env,...env}})});
 let brokerPID;
 t.after(async()=>{
  let safeCleanup=!fs.existsSync(path.join(stage,'broker','owner.json'));
  try{
   if(client.client){
    const status=await client.request('status').promise;brokerPID=status.brokerPID;assert.ok(Number.isInteger(brokerPID)&&brokerPID>0,'Isolated native broker PID is missing');
    const shutdown=await client.request('shutdown').promise;assert.equal(shutdown.passed,true,'Owned isolated broker shutdown failed');safeCleanup=true;
   }
  }finally{
   client.dispose();
   for(let attempt=0;brokerPID&&attempt<100;attempt++){
    try{process.kill(brokerPID,0);}catch(error){if(error.code==='ESRCH'){brokerPID=undefined;break;}throw error;}
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   assert.ok(safeCleanup&&brokerPID===undefined,'Isolated broker shutdown is unverified; preserve owned fixture instead of deleting live files');
   fs.rmSync(stage,{recursive:true,force:true});
  }
 });
 const folder={uri:{fsPath:workspace}},logs=[],requests=[],choices=['Configure This Machine','Create Machine Profile'];
 const vscode={ProgressLocation:{Notification:15},workspace:{workspaceFolders:[folder],getWorkspaceFolder:()=>folder,textDocuments:[]},
  commands:{registerCommand:()=>({dispose(){}})},window:{
   createOutputChannel:()=>({show(){},dispose(){},append:text=>logs.push(text),appendLine:text=>logs.push(text)}),
   withProgress:async(options,run)=>run({report(){}}),showWarningMessage:async()=>choices.shift(),showInformationMessage:async()=>{},
  }};
 const services={isBusy:()=>false,configFor:()=>config,detect:async()=>{throw Error('Runtime settings are supplied explicitly');},
  client:{request:(command,body,output)=>{requests.push({command,body});return client.request(command,body,output);}}};
 const controller=registerWorkspaceInitialization(vscode,{subscriptions:[]},services);
 const result=await controller.initialize(folder.uri);
 assert.equal(result.passed,true);assert.equal(result.created,false);assert.equal(result.connection,'cloned-project');
 assert.deepEqual(fs.readFileSync(project),original);
 assert.deepEqual(requests.map(row=>row.command),['cli','cli']);
 const privateProfiles=JSON.parse(fs.readFileSync(profiles,'utf8'));
 assert.deepEqual(privateProfiles.profiles['cloned-project'],config);
 assert.equal(fs.existsSync(config.databasePath),false,'Configuration-only setup must not create/open a database');
 assert.equal(fs.existsSync(path.join(workspace,'.jade','working')),false);
 const repeat=await controller.initialize(folder.uri);
 assert.equal(repeat.passed,true);assert.equal(requests.length,3);assert.deepEqual(fs.readFileSync(project),original);
 assert.ok(logs.some(text=>/Unknown Jade connection profile/.test(text)));
 assert.ok(logs.some(text=>/Configuration step complete/.test(text)));
 console.log(JSON.stringify({nativeInit:true,missingProfileRepair:true,existingProjectBytesPreserved:true,repeatPreservesProfile:true,databaseOpened:false}));
});
