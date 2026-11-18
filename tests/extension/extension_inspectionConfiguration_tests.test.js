'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const sourcePath=path.resolve(__dirname,'../../extension/src/extension.js');
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(explicit={},nativeFailure){
 const root=path.join(path.parse(process.cwd()).root,'generic-inspection-project'),folder={uri:{scheme:'file',fsPath:root}};
 const resolved={sourceFormat:'jox',connection:'private-profile',installPath:path.join(root,'selected-install'),databasePath:path.join(root,'selected-database'),iniPath:path.join(root,'selected.ini'),server:'multiUser',schema:'SelectedSchema',workspaceRoots:[path.join(root,'sources')],workingDatabaseDirectory:path.join(root,'.jade','working'),workingDatabaseGeneration:'native-generation',characterSet:'unicode',user:'profile-user',password:'profile-secret'};
 const configFile=path.join(root,'jade.json'),requests=[],targetCalls=[],locationCalls=[];
 const settings={get:key=>Object.hasOwn(explicit,key)?explicit[key]:({server:'singleUser',schema:'',workingDatabaseDirectory:''})[key],inspect:key=>Object.hasOwn(explicit,key)?{workspaceFolderValue:explicit[key]}:{}};
 const vscode={workspace:{getConfiguration:()=>settings,getWorkspaceFolder:()=>folder},commands:{registerCommand:()=>({dispose(){}})},window:{showErrorMessage:message=>assert.fail(message)}};
 const client={request(command,body){requests.push({command,body:plain(body)});return{promise:Promise.resolve(nativeFailure||{code:0,passed:true,prepared:{config:resolved,configFile}})};},inspectionTarget(...args){targetCalls.push(args);return args[0];},workingLocation(config){locationCalls.push(config);return config;},dispose(){}};
 let inspection;
 const workspace={executing:false,projectForUri:()=>({folder}),sourceContext(){}};
 const context={extensionPath:root,subscriptions:[],workspaceState:{get:()=> 'retired-editor-generation'}};
 const actualRequire=createRequire(sourcePath),module={exports:{}};
 const requireModule=name=>name==='vscode'?vscode:name==='./cli-client'?{CliWorkingSession:class{constructor(){return client;}}}:name==='./cli-gateway'?{configure(){}}:name==='./register-jox-workspace'?{registerJoxWorkspace:()=>({workspace})}:name==='./object-explorer'?{registerObjectExplorer:(_v,_c,options)=>{inspection=options;return{releaseForOperation(){}};}}:name==='./jox-project-setup'?{registerJoxProjectSetup:()=>({onboarding:{resume:async()=>{}}})}:actualRequire(name);
 vm.runInNewContext(fs.readFileSync(sourcePath,'utf8')+'\nmodule.exports.activateForInspectionControl=activate;',{require:requireModule,module,exports:module.exports,process:{platform:process.platform,env:{...process.env,JADE_INSTALL:''}},__dirname:path.dirname(sourcePath),console});
 module.exports.activateForInspectionControl(context);
 return{inspection,folder,resolved,configFile,requests,targetCalls,locationCalls};
}
test('JOX inspection resolves jade.json/private-profile-only coordinates through native configuration, without local install guesses',async()=>{
 const f=setup();const config=await f.inspection.config(undefined,f.folder);
 for(const key of ['installPath','databasePath','iniPath','server','schema','workspaceRoots','workingDatabaseDirectory','workingDatabaseGeneration','characterSet'])assert.deepEqual(plain(config[key]),plain(f.resolved[key]),'Native '+key+' was overridden by editor defaults');
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].command,'prepare');assert.equal(f.requests[0].body.operation,'inspect.target');assert.equal(f.requests[0].body.cwd,f.folder.uri.fsPath);
 assert.equal(config.cwd,f.folder.uri.fsPath);assert.equal(config.configFile,f.configFile);
 assert.equal(Object.hasOwn(config,'user'),false);assert.equal(Object.hasOwn(config,'password'),false,'Profile credentials must not replace the independent inspection sign-on');
});
test('JOX inspection sends only explicit editor connection overrides for native normalization',async()=>{
 const f=setup({installPath:'${workspaceFolder}/override-install',server:'multiUser'});
 await f.inspection.config(undefined,f.folder);
 assert.deepEqual(f.requests[0].body.argv,['--install',f.folder.uri.fsPath+'/override-install','--server','multiUser']);
 assert.ok(!Object.hasOwn(f.requests[0].body,'user')&&!Object.hasOwn(f.requests[0].body,'password'));
});
test('native inspection config failure is retained and never falls back to install/system',async()=>{
 const f=setup({}, {code:2,passed:false,report:{error:'Selected connection profile is unavailable'}});
 await assert.rejects(f.inspection.config(undefined,f.folder),/Selected connection profile is unavailable/);
 assert.equal(f.targetCalls.length,0);assert.equal(f.locationCalls.length,0);
});
test('explicit inspection Source/Working choice and anonymous or signed-in credentials reach the native target unchanged',async()=>{
 const f=setup();const config=await f.inspection.config(undefined,f.folder);
 for(const target of ['source','working']){
  await f.inspection.inspectionTarget(config,target);
  const args=f.targetCalls.at(-1);assert.equal(args[1],target);assert.equal(args[0].user,'');assert.equal(args[0].password,'');assert.equal(args[0].connection,'private-profile');
 }
 await f.inspection.inspectionTarget({...config,user:'inspection-user',password:''},'source');
 assert.equal(f.targetCalls.at(-1)[0].user,'inspection-user');assert.equal(f.targetCalls.at(-1)[0].password,'');
});
