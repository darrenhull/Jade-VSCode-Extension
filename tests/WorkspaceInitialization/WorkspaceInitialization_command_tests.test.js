'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../../extension/package.json');
test('Initialise Workspace is contributed as an actual command',()=>{assert.ok(manifest.contributes.commands.some(row=>row.command==='jadeNative.initializeWorkspace'&&row.title==='Initialise Workspace'));});

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerWorkspaceInitialization}=require('../../extension/src/workspace-initialization');
function setup(t,{existing=false,configured=true,result,hold,results,choices=[]}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-setup-')),folder={name:'Project',uri:{fsPath:root}},calls=[],messages=[],logs=[],prompts=[],commands=new Map();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));if(existing)fs.writeFileSync(path.join(root,'jade.json'),'{"connection":"keep-me"}');let detected=false;
 const vscode={ProgressLocation:{Notification:15},workspace:{workspaceFolders:[folder],getWorkspaceFolder:()=>folder},window:{showQuickPick:async rows=>rows[0],withProgress:async(_options,run)=>run({report:text=>messages.push(text)}),createOutputChannel:()=>({show(){},dispose(){},append:text=>logs.push(text),appendLine:text=>logs.push(text)}),showInformationMessage:async text=>messages.push(text),showErrorMessage:async text=>messages.push(text),showWarningMessage:async(text,options,...actions)=>{prompts.push({text,options,actions});controller.onWarning?.();return choices.shift();}},commands:{registerCommand:(id,run)=>{commands.set(id,run);return{dispose(){}};}}};
 const services={isBusy:()=>false,configFor:()=>{if(!configured&&!detected)throw Object.assign(Error('Not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'});return{installPath:'C:/Jade ANSI',databasePath:'C:/Source DB/system',iniPath:'C:/Source DB/jade.ini',server:'multiUser'};},detect:async()=>{detected=true;return{};},client:{request:(command,body)=>{calls.push({command,...body});return{promise:(async()=>{if(hold)await hold;return results?.shift()||result||{passed:true,code:0,created:!existing};})()};}}};
 const controller=registerWorkspaceInitialization(vscode,{subscriptions:[]},services);Object.assign(controller,{calls,messages,logs,prompts,commands,services,folder,root,vscode,wasDetected:()=>detected});return controller;
}
test('initialise delegates to native init for the chosen folder with literal paths and no database operation',async t=>{const s=setup(t);await s.initialize(s.folder.uri);assert.equal(s.calls.length,1);const call=s.calls[0];assert.equal(call.command,'cli');assert.equal(call.operation,'init');assert.equal(call.cwd,s.root);assert.deepEqual(call.argv.slice(0,2),['--config',path.join(s.root,'jade.json')]);assert.ok(call.argv.includes('C:/Jade ANSI'));assert.ok(call.argv.includes('C:/Source DB/system'));assert.match(call.argv[3],/^vscode-/);assert.ok(s.logs.some(text=>/Configuration step complete/.test(text)));});
test('existing project configuration and its connection remain intact',async t=>{const s=setup(t,{existing:true});s.services.configFor=()=>{throw Error('Must not rediscover or replace existing connection');};await s.initialize(s.folder.uri);assert.deepEqual(s.calls[0].argv,['--config',path.join(s.root,'jade.json')]);assert.equal(fs.readFileSync(path.join(s.root,'jade.json'),'utf8'),'{"connection":"keep-me"}');});
test('missing runtime settings use existing Detect Runtime Settings before native initialisation',async t=>{const s=setup(t,{configured:false});await s.initialize(s.folder.uri);assert.equal(s.wasDetected(),true);assert.equal(s.calls.length,1);});
test('repeated initialise clicks share one native configuration request',async t=>{let finish;const s=setup(t,{hold:new Promise(resolve=>finish=resolve)});const a=s.initialize(s.folder.uri),b=s.initialize(s.folder.uri);await new Promise(setImmediate);assert.equal(s.calls.length,1);finish();await Promise.all([a,b]);});
test('native configuration failure retains original cause without claiming completion',async t=>{const s=setup(t,{result:{passed:false,code:2,report:{error:'Existing profile is invalid'}}});const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.passed,false);assert.match(result.error,/Existing profile is invalid/);assert.ok(s.logs.every(text=>!/Configuration step complete/.test(text)));});
test('database preparation timeout is separate and bounded in resource settings',()=>{const settings=manifest.contributes.configuration.properties;assert.equal(settings['jadeNative.workingDatabaseTimeoutSeconds'].default,7200);assert.equal(settings['jadeNative.workingDatabaseTimeoutSeconds'].maximum,86400);assert.equal(settings['jadeNative.workingDatabaseTimeoutSeconds'].scope,'resource');assert.equal(settings['jadeNative.testTimeoutSeconds'].default,120);});

test('cancelling runtime detection settles as cancelled without native calls or error notification',async t=>{
 const s=setup(t,{configured:false});s.services.detect=async()=>undefined;
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.cancelled,true);assert.equal(s.calls.length,0);
 assert.ok(s.messages.every(text=>typeof text!=='string'||!/Not configured/.test(text)));
});
test('an explicit resource outside the workspace cannot initialise a different folder',async t=>{
 const s=setup(t),outside={fsPath:path.join(s.root,'..','outside')};
 s.vscode.workspace.getWorkspaceFolder=resource=>resource===outside?undefined:s.folder;
 const result=await s.commands.get('jadeNative.initializeWorkspace')(outside);
 assert.equal(result.passed,false);assert.match(result.error,/not open|workspace/i);assert.equal(s.calls.length,0);
});
test('a missing cloned profile offers native repair without changing existing project bytes',async t=>{
 const s=setup(t,{existing:true,results:[{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'. Run jade-cli init."}},{passed:true,code:0,created:false,connection:'keep-me'}],choices:['Configure This Machine','Create Machine Profile']});
 const bytes=fs.readFileSync(path.join(s.root,'jade.json'));const result=await s.initialize(s.folder.uri);
 assert.equal(result.passed,true);assert.equal(s.calls.length,2);
 assert.deepEqual(s.calls[0].argv,['--config',path.join(s.root,'jade.json')]);
 const repair=s.calls[1].argv;assert.equal(repair.includes('--profile'),false);assert.equal(repair[repair.indexOf('--install')+1],'C:/Jade ANSI');
 assert.deepEqual(fs.readFileSync(path.join(s.root,'jade.json')),bytes);
 assert.ok(s.prompts.some(row=>row.options?.modal===true&&/C:\/Source DB\/system/.test(row.options.detail)));
});
test('dismissing missing-profile repair preserves the native error and makes no repair call',async t=>{
 const error="Unknown Jade connection profile 'keep-me'. Run jade-cli init.";
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error}},choices:[undefined]});
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.equal(result.error,error);assert.equal(s.calls.length,1);
 assert.ok(s.logs.every(text=>!/Configuration step complete/.test(text)));
});
test('declining reviewed profile creation cancels with no second native call',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine',undefined]});
 const result=await s.initialize(s.folder.uri);
 assert.equal(result.cancelled,true);assert.equal(s.calls.length,1);
});
test('native profile collision during repair remains a failure and preserves existing files',async t=>{
 const error="Connection profile 'keep-me' already points to another connection. Choose a different --profile name.";
 const s=setup(t,{existing:true,results:[{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},{passed:false,code:2,report:{error}}],choices:['Configure This Machine','Create Machine Profile']});
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.equal(result.error,error);assert.equal(s.calls.length,2);
 assert.equal(fs.readFileSync(path.join(s.root,'jade.json'),'utf8'),'{"connection":"keep-me"}');
 assert.ok(s.logs.every(text=>!/Configuration step complete/.test(text)));
});
test('other existing configuration errors never trigger profile repair',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:'Configuration must be a JSON object.'}}});
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.equal(s.calls.length,1);assert.equal(s.prompts.length,0);
});
test('workspace removal while profile review is open prevents the repair',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine','Create Machine Profile']});
 s.onWarning=()=>{if(s.prompts.length===2)s.vscode.workspace.getWorkspaceFolder=()=>undefined;};
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.match(result.error,/Workspace changed/);assert.equal(s.calls.length,1);
});
test('pending configuration editor edits prevent native init',async t=>{
 const s=setup(t,{existing:true});s.vscode.workspace.textDocuments=[{isDirty:true,uri:{fsPath:path.join(s.root,'jade.json')}}];
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.match(result.error,/pending jade.json edits/);assert.equal(s.calls.length,0);
});
test('configuration changed during profile review cannot repair a different alias',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine','Create Machine Profile']});
 s.onWarning=()=>{if(s.prompts.length===2)fs.writeFileSync(path.join(s.root,'jade.json'),'{"connection":"another-project"}');};
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.match(result.error,/jade.json changed/);assert.equal(s.calls.length,1);
 assert.equal(fs.readFileSync(path.join(s.root,'jade.json'),'utf8'),'{"connection":"another-project"}');
});
test('a project created during runtime detection is preserved for a deliberate retry',async t=>{
 const s=setup(t,{configured:false});let selected=false;
 s.services.detect=async()=>{selected=true;fs.writeFileSync(path.join(s.root,'jade.json'),'{"connection":"other"}');return{};};
 s.services.configFor=()=>selected?{}:(()=>{throw Object.assign(Error('Not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'});})();
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.match(result.error,/jade.json changed/);assert.equal(s.calls.length,0);
 assert.equal(fs.readFileSync(path.join(s.root,'jade.json'),'utf8'),'{"connection":"other"}');
});
test('cancelling detection during missing-profile repair is cancelled without a second native request',async t=>{
 const s=setup(t,{existing:true,configured:false,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine']});
 s.services.detect=async()=>undefined;
 const result=await s.initialize(s.folder.uri);
 assert.equal(result.cancelled,true);assert.equal(s.calls.length,1);
 assert.ok(s.logs.every(text=>!/Configuration step complete/.test(text)));
});
test('a settled native failure releases the pending operation for deliberate retry',async t=>{
 const s=setup(t,{results:[{passed:false,code:2,report:{error:'Private profile locked'}},{passed:true,code:0,created:true}]});
 assert.equal((await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri)).passed,false);
 assert.equal((await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri)).passed,true);assert.equal(s.calls.length,2);
});
test('multi-root initialization uses the explicitly chosen project and full-path labels',async t=>{
 const s=setup(t),otherRoot=path.join(s.root,'second'),other={name:'Project',uri:{fsPath:otherRoot}};fs.mkdirSync(otherRoot);
 s.vscode.workspace.workspaceFolders=[s.folder,other];s.vscode.workspace.getWorkspaceFolder=uri=>s.vscode.workspace.workspaceFolders.find(folder=>folder.uri.fsPath===uri.fsPath);
 s.vscode.window.showQuickPick=async rows=>{assert.equal(rows[1].description,otherRoot);return rows[1];};
 await s.initialize();assert.equal(s.calls.length,1);assert.equal(s.calls[0].cwd,otherRoot);assert.equal(s.calls[0].argv[1],path.join(otherRoot,'jade.json'));
});
test('cancelled multi-root selection starts no setup work',async t=>{
 const s=setup(t);s.vscode.workspace.workspaceFolders=[s.folder,{name:'Other',uri:{fsPath:path.join(s.root,'other')}}];s.vscode.window.showQuickPick=async()=>undefined;
 const result=await s.initialize();assert.equal(result.cancelled,true);assert.equal(s.calls.length,0);
});
test('runtime settings changed during profile review cannot create a stale machine profile',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine','Create Machine Profile']});
 let moved=false;s.onWarning=()=>{if(s.prompts.length===2)moved=true;};
 const configFor=s.services.configFor;s.services.configFor=()=>({...configFor(),...(moved?{databasePath:'C:/Different Source/system'}:{})});
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.passed,false);assert.match(result.error,/runtime settings changed/);assert.equal(s.calls.length,1);
});
