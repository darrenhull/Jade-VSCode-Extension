'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../../extension/package.json');
test('Initialise Workspace is contributed as an actual command',()=>{assert.ok(manifest.contributes.commands.some(row=>row.command==='jadeNative.initializeWorkspace'&&row.title==='Initialise Workspace'));});

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerWorkspaceInitialization}=require('../../extension/src/workspace-initialization');
function setup(t,{existing=false,configured=true,result,hold,results,choices=[],gitProof=true,nativeOutput=[],rememberedProfile}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-setup-')),folder={name:'Project',uri:{fsPath:root}},calls=[],messages=[],logs=[],prompts=[],commands=new Map();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));if(existing)fs.writeFileSync(path.join(root,'jade.json'),'{"connection":"keep-me"}');let detected=false;
 const vscode={ProgressLocation:{Notification:15},workspace:{workspaceFolders:[folder],getWorkspaceFolder:()=>folder},window:{showQuickPick:async rows=>rows[0],withProgress:async(_options,run)=>run({report:text=>messages.push(text)}),createOutputChannel:()=>({show(){},dispose(){},append:text=>logs.push(text),appendLine:text=>logs.push(text)}),showInformationMessage:async text=>messages.push(text),showErrorMessage:async text=>messages.push(text),showWarningMessage:async(text,options,...actions)=>{prompts.push({text,options,actions});controller.onWarning?.();return choices.shift();}},commands:{registerCommand:(id,run)=>{commands.set(id,run);return{dispose(){}};}}};
 const services={isBusy:()=>false,configFor:()=>{if(!configured&&!detected)throw Object.assign(Error('Not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'});return{installPath:'C:/Jade ANSI',databasePath:'C:/Source DB/system',iniPath:'C:/Source DB/jade.ini',server:'multiUser'};},detect:async()=>{detected=true;return{};},client:{request:(command,body,onOutput)=>{calls.push({command,...body});return{promise:(async()=>{for(const text of nativeOutput)onOutput?.(text);if(hold)await hold;const value=results?.shift()||result||{passed:true,code:0,created:!existing};return value.passed===true&&gitProof&&value.git===undefined?{...value,git:{initialized:!existing,reused:existing,root,ignoreEnsured:true}}:value;})()};}}};
 const controller=registerWorkspaceInitialization(vscode,{subscriptions:[],workspaceState:{get:()=>rememberedProfile,update:async()=>{}}},services);Object.assign(controller,{calls,messages,logs,prompts,commands,services,folder,root,vscode,wasDetected:()=>detected});return controller;
}
test('initialise delegates to native init for the chosen folder with literal paths and no database operation',async t=>{const s=setup(t);await s.initialize(s.folder.uri);assert.equal(s.calls.length,1);const call=s.calls[0];assert.equal(call.command,'cli');assert.equal(call.operation,'init');assert.equal(call.cwd,s.root);assert.deepEqual(call.argv.slice(0,2),['--config',path.join(s.root,'jade.json')]);assert.ok(call.argv.includes('C:/Jade ANSI'));assert.ok(call.argv.includes('C:/Source DB/system'));assert.match(call.argv[3],/^vscode-/);assert.ok(s.logs.some(text=>/Configuration step complete/.test(text)));});
test('initialise performs exactly one shared source refresh after native configuration and retains its failure cause',async t=>{const s=setup(t),roots=[];s.services.refreshSourceIndex=async folder=>{assert.equal(s.calls.length,1);roots.push(folder.uri.fsPath);throw Error('Git source worktree is not initialized');};const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.passed,false);assert.match(result.error,/Git source worktree/);assert.deepEqual(roots,[s.root]);assert.ok(!s.logs.some(text=>/Shared source index is ready/.test(text)));});
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

test('new-project setup reports native Git, ignore, configuration and cache phases without a JS Git writer',async t=>{
 const s=setup(t,{nativeOutput:['[Setup] Git initialized repository\n','[Setup] Git ignore ensured /.jade/\n']});let refreshes=0;s.services.refreshSourceIndex=async()=>{refreshes++;};const result=await s.initialize(s.folder.uri);assert.equal(result.passed,true);assert.equal(refreshes,1);assert.equal(s.calls.length,1);assert.equal(s.calls[0].operation,'init');assert.equal(fs.existsSync(path.join(s.root,'.git')),false,'The protocol double must not be replaced by a JS Git writer');
 const stages=s.messages.filter(value=>value?.message).map(value=>value.message);assert.ok(stages.some(value=>/Git repository/i.test(value)));assert.ok(stages.some(value=>/ignored by Git/i.test(value)));assert.ok(stages.some(value=>/shared Git source index/i.test(value)));assert.ok(s.logs.some(value=>/Initialised Git repository/.test(value)));assert.ok(s.logs.some(value=>/Managed .jade state is ignored by Git/.test(value)));assert.ok(s.logs.findIndex(value=>/Initialised Git repository/.test(value))<s.logs.findIndex(value=>/Configuration step complete/.test(value)));assert.ok(s.logs.findIndex(value=>/Configuration step complete/.test(value))<s.logs.findIndex(value=>/Shared source index is ready/.test(value)));
});
test('reused native Git setup preserves existing configuration and ignore bytes',async t=>{
 const s=setup(t,{existing:true}),ignore=path.join(s.root,'.gitignore'),original=Buffer.from('# existing rules\nkeep-output/\n');fs.writeFileSync(ignore,original);const config=fs.readFileSync(path.join(s.root,'jade.json'));let refreshes=0;s.services.refreshSourceIndex=async()=>{refreshes++;};await s.initialize(s.folder.uri);assert.deepEqual(fs.readFileSync(ignore),original);assert.deepEqual(fs.readFileSync(path.join(s.root,'jade.json')),config);assert.equal(refreshes,1);assert.ok(s.logs.some(value=>/Reused Git repository/.test(value)));
});
test('missing native Git confirmation is actionable and cannot claim configuration/cache readiness',async t=>{
 const s=setup(t,{gitProof:false}),refreshes=[];s.services.refreshSourceIndex=async()=>refreshes.push(true);const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.passed,false);assert.match(result.error,/Git.*confirm|confirm.*Git/i);assert.equal(refreshes.length,0);assert.ok(s.logs.every(value=>!/Configuration step complete|Shared source index is ready/.test(value)));
});
test('native Git setup failure preserves its cause and never starts source-cache refresh',async t=>{
 const s=setup(t,{result:{passed:false,code:2,report:{error:'Git executable was not found'}}}),refreshes=[];s.services.refreshSourceIndex=async()=>refreshes.push(true);const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.passed,false);assert.equal(result.error,'Git executable was not found');assert.equal(refreshes.length,0);assert.ok(s.logs.every(value=>!/Configuration step complete|Shared source index is ready/.test(value)));
});

test('JOX config-only setup leaves private-profile discovery native and forwards no undefined runtime defaults',async t=>{
 const s=setup(t);s.services.nativeDiscovery=true;s.services.configFor=()=>({sourceFormat:'jox'});
 await s.initialize(s.folder.uri);
 assert.deepEqual(s.calls[0].argv,['--config',path.join(s.root,'jade.json')]);
 assert.ok(!s.messages.some(value=>typeof value==='string'&&/Extract All Sources/.test(value)));
});


const nativeMissingConnection='Jade connection setup is required. Run jade-cli init --install <Jade folder> or choose --profile <name>; noninteractive commands never prompt.';
const selectedRuntime={installPath:'C:/Selected Jade',databasePath:'C:/Selected Source/system',iniPath:'C:/Selected Source/source.ini',server:'singleUser'};
function nativeDiscovery(s,{cancel=false}={}){
 let selected=false,detects=0;
 s.services.nativeDiscovery=true;s.services.configFor=()=>selected?{sourceFormat:'jox',...selectedRuntime}:{sourceFormat:'jox'};
 s.services.detect=async uri=>{assert.equal(uri,s.folder.uri);detects++;if(cancel)return;selected=true;return{...selectedRuntime};};
 return()=>detects;
}
test('native missing-connection diagnosis hands fresh JOX setup to detection then retries explicit settings once',async t=>{
 const s=setup(t,{results:[{passed:false,code:2,report:{error:nativeMissingConnection}},{passed:true,code:0,created:true}]}),detects=nativeDiscovery(s);
 const result=await s.initialize(s.folder.uri);
 assert.equal(result.passed,true);assert.equal(detects(),1);assert.equal(s.calls.length,2);
 assert.deepEqual(s.calls[0].argv,['--config',path.join(s.root,'jade.json')]);
 const retry=s.calls[1].argv;assert.match(retry[retry.indexOf('--profile')+1],/^vscode-/);
 for(const [option,key] of [['install','installPath'],['database','databasePath'],['ini','iniPath'],['server','server']])assert.equal(retry[retry.indexOf('--'+option)+1],selectedRuntime[key]);
 assert.equal(retry.includes(undefined),false);
});
test('cancelling native-first detection stops before retry without a failure notification',async t=>{
 const s=setup(t,{result:{passed:false,code:2,report:{error:nativeMissingConnection}}}),detects=nativeDiscovery(s,{cancel:true});
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.cancelled,true);assert.equal(detects(),1);assert.equal(s.calls.length,1);
 assert.ok(!s.messages.includes(nativeMissingConnection));
});
test('a genuine native configuration error never offers runtime detection',async t=>{
 const error='Connection profile is locked; preserve existing settings';const s=setup(t,{result:{passed:false,code:2,report:{error}}}),detects=nativeDiscovery(s);
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.error,error);assert.equal(detects(),0);assert.equal(s.calls.length,1);
});
test('a repeated native missing-connection failure preserves the cause without another detection loop',async t=>{
 const s=setup(t,{result:{passed:false,code:2,report:{error:nativeMissingConnection}}}),detects=nativeDiscovery(s);
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.equal(result.error,nativeMissingConnection);assert.equal(detects(),1);assert.equal(s.calls.length,2);
});
test('runtime settings changed after detection cannot be sent as a stale retry',async t=>{
 const s=setup(t,{result:{passed:false,code:2,report:{error:nativeMissingConnection}}});nativeDiscovery(s);
 let detected=false,reads=0;s.services.detect=async()=>{detected=true;return selectedRuntime;};
 s.services.configFor=()=>!detected?{sourceFormat:'jox'}:{sourceFormat:'jox',...selectedRuntime,...(++reads>1?{databasePath:'C:/Changed/system'}:{})};
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.match(result.error,/runtime settings changed/);assert.equal(s.calls.length,1);
});
test('existing native private-profile discovery succeeds without requiring explicit installation settings',async t=>{
 const s=setup(t,{existing:true}),detects=nativeDiscovery(s),bytes=fs.readFileSync(path.join(s.root,'jade.json'));
 const result=await s.initialize(s.folder.uri);
 assert.equal(result.passed,true);assert.equal(detects(),0);assert.equal(s.calls.length,1);assert.equal(s.prompts.length,0);
 assert.deepEqual(s.calls[0].argv,['--config',path.join(s.root,'jade.json')]);assert.deepEqual(fs.readFileSync(path.join(s.root,'jade.json')),bytes);
});
test('native missing-profile repair detects real settings before reviewing or creating that same alias',async t=>{
 const error="Unknown Jade connection profile 'keep-me'. Run jade-cli init --profile \"keep-me\" --install <Jade folder>.";
 const s=setup(t,{existing:true,results:[{passed:false,code:2,report:{error}},{passed:true,code:0,created:false}],choices:['Configure This Machine','Create Machine Profile']}),detects=nativeDiscovery(s);
 const bytes=fs.readFileSync(path.join(s.root,'jade.json'));const result=await s.initialize(s.folder.uri);
 assert.equal(result.passed,true);assert.equal(detects(),1);assert.equal(s.calls.length,2);assert.equal(s.calls[1].argv.includes('--profile'),false);
 assert.equal(s.calls[1].argv[s.calls[1].argv.indexOf('--install')+1],selectedRuntime.installPath);
 const review=s.prompts.find(row=>row.options?.modal);assert.ok(review);assert.ok(!review.options.detail.includes('undefined'));
 for(const value of Object.values(selectedRuntime))assert.ok(review.options.detail.includes(value));
 assert.deepEqual(fs.readFileSync(path.join(s.root,'jade.json')),bytes);
});
test('cancelling native missing-profile detection does not review undefined settings or create a profile',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine']}),detects=nativeDiscovery(s,{cancel:true});
 const result=await s.initialize(s.folder.uri);assert.equal(result.cancelled,true);assert.equal(detects(),1);assert.equal(s.calls.length,1);assert.equal(s.prompts.length,1);
});
test('a cancelled native result cannot be reinterpreted as a request to detect settings',async t=>{
 const s=setup(t,{result:{passed:false,code:130,cancelled:true,report:{error:nativeMissingConnection}}}),detects=nativeDiscovery(s);
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.passed,false);assert.equal(detects(),0);assert.equal(s.calls.length,1);
});
test('configuration created during native-first detection is preserved without retrying another project',async t=>{
 const s=setup(t,{result:{passed:false,code:2,report:{error:nativeMissingConnection}}});nativeDiscovery(s);
 s.services.detect=async()=>{fs.writeFileSync(path.join(s.root,'jade.json'),'{"connection":"other"}');s.services.configFor=()=>({sourceFormat:'jox',...selectedRuntime});return selectedRuntime;};
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.match(result.error,/jade.json changed/);assert.equal(s.calls.length,1);
 assert.equal(fs.readFileSync(path.join(s.root,'jade.json'),'utf8'),'{"connection":"other"}');
});

test('native unresolved existing connection detects settings without selecting a different profile',async t=>{
 const error='Jade connection is not configured. Run jade-cli init --install <Jade folder> or choose --profile <name>.';
 const s=setup(t,{existing:true,results:[{passed:false,code:2,report:{error}},{passed:true,code:0,created:false}]}),detects=nativeDiscovery(s),bytes=fs.readFileSync(path.join(s.root,'jade.json'));
 const result=await s.initialize(s.folder.uri);assert.equal(result.passed,true);assert.equal(detects(),1);assert.equal(s.calls.length,2);
 assert.equal(s.calls[1].argv.includes('--profile'),false);assert.equal(s.calls[1].argv[s.calls[1].argv.indexOf('--install')+1],selectedRuntime.installPath);assert.deepEqual(fs.readFileSync(path.join(s.root,'jade.json')),bytes);
});
test('detection without selected installation settings never creates an undefined machine profile',async t=>{
 const s=setup(t,{existing:true,result:{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},choices:['Configure This Machine']});nativeDiscovery(s);
 s.services.detect=async()=>({});const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);
 assert.match(result.error,/did not provide a Jade installation/);assert.equal(s.calls.length,1);assert.equal(s.prompts.length,1);
});
test('a similar but different native diagnostic retains its original cause',async t=>{
 const error='Jade connection setup is required for a newer unsupported server protocol.';
 const s=setup(t,{result:{passed:false,code:2,report:{error}}}),detects=nativeDiscovery(s);
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.error,error);assert.equal(detects(),0);assert.equal(s.calls.length,1);
});

test('explicit installation-only profile repair reviews native defaults without inventing paths',async t=>{
 const s=setup(t,{existing:true,results:[{passed:false,code:2,report:{error:"Unknown Jade connection profile 'keep-me'."}},{passed:true,code:0,created:false}],choices:['Configure This Machine','Create Machine Profile']});nativeDiscovery(s);
 s.services.configFor=()=>({sourceFormat:'jox',installPath:selectedRuntime.installPath});s.services.detect=async()=>{assert.fail('Explicit installation settings should reach native defaults');};
 const result=await s.initialize(s.folder.uri);assert.equal(result.passed,true);
 const detail=s.prompts.find(row=>row.options?.modal).options.detail;assert.ok(!detail.includes('undefined'));assert.match(detail,/Database: Native default\nINI: Native default\nServer: Native default/);
 assert.deepEqual(s.calls[1].argv,['--config',path.join(s.root,'jade.json'),'--install',selectedRuntime.installPath]);
});

for(const proof of ['native-failure','git-failure'])test('detected settings handoff waits for confirmed native configuration and Git: '+proof,async t=>{
 const s=setup(t,{gitProof:proof!=='git-failure',results:[{passed:false,code:2,report:{error:nativeMissingConnection}},proof==='native-failure'?{passed:false,code:2,report:{error:'Profile ownership conflict'}}:{passed:true,code:0,created:true}]});nativeDiscovery(s);
 let handedOff=0;s.services.runtimeSettingsReady=async()=>{handedOff++;};
 const result=await s.commands.get('jadeNative.initializeWorkspace')(s.folder.uri);assert.equal(result.passed,false);assert.equal(handedOff,0);assert.equal(s.calls.length,2);
});

for(const next of [{passed:false,code:2,report:{error:'Native initialization refused'}},{passed:false,code:130,cancelled:true}])test('failed or cancelled profile initialization leaves the remembered alias unchanged: '+next.code,async t=>{const s=setup(t,{results:[{passed:false,code:2,report:{error:'Multiple Jade connection profiles are available (alpha, beta). Choose --profile <name>; no interactive prompt is available.'}},next]}),state=new Map();s.services.nativeDiscovery=true;s.services.configFor=()=>({});const controller=registerWorkspaceInitialization(s.vscode,{subscriptions:[],workspaceState:{get:key=>state.get(key),update:async(key,value)=>state.set(key,value)}},s.services);await assert.rejects(controller.initialize(s.folder.uri));assert.equal(state.size,0);assert.deepEqual(s.calls[1].argv.slice(-2),['--profile','alpha']);});
test('successful profile initialization remembers the exact selected alias after native Git proof',async t=>{const s=setup(t,{results:[{passed:false,code:2,report:{error:'Multiple Jade connection profiles are available (alpha, beta). Choose --profile <name>; no interactive prompt is available.'}},{passed:true,code:0,created:true,connection:'alpha'}]}),state=new Map();s.services.nativeDiscovery=true;s.services.configFor=()=>({});const controller=registerWorkspaceInitialization(s.vscode,{subscriptions:[],workspaceState:{get:key=>state.get(key),update:async(key,value)=>state.set(key,value)}},s.services);const result=await controller.initialize(s.folder.uri);assert.equal(result.passed,true);assert.deepEqual([...state.values()],['alpha']);});
test('creating a configless profile with new runtime paths does not rewrite a remembered shared alias',async t=>{const s=setup(t,{rememberedProfile:'shared-user-profile'});s.services.nativeDiscovery=true;await s.initialize(s.folder.uri);const args=s.calls[0].argv;assert.match(args[args.indexOf('--profile')+1],/^vscode-[a-f0-9]{24}$/);assert(!args.includes('shared-user-profile'));});

for(const confirmed of ['alpha','beta',undefined])test('runtime retry retains picked alias and accepts only native-confirmed identity: '+confirmed,async t=>{const s=setup(t,{results:[{passed:false,code:2,report:{error:'Multiple Jade connection profiles are available (alpha, beta). Choose --profile <name>; no interactive prompt is available.'}},{passed:false,code:2,report:{error:nativeMissingConnection}},{passed:true,code:0,created:true,...(confirmed?{connection:confirmed}:{})}]}),state=new Map();nativeDiscovery(s);const controller=registerWorkspaceInitialization(s.vscode,{subscriptions:[],workspaceState:{get:key=>state.get(key),update:async(key,value)=>state.set(key,value)}},s.services);if(confirmed==='alpha'){await controller.initialize(s.folder.uri);assert.deepEqual([...state.values()],['alpha']);}else{await assert.rejects(controller.initialize(s.folder.uri),/selected.*profile|confirm.*profile/i);assert.equal(state.size,0);}assert.deepEqual(s.calls[2].argv.slice(2,4),['--profile','alpha']);});

test('native initialization guides the default saved-source setup without promising extraction',async t=>{const s=setup(t);s.services.nativeDiscovery=true;await s.initialize(s.folder.uri);const notice=s.messages.find(value=>typeof value==='string'&&value.startsWith('Jade project configuration is ready.'));assert.match(notice,/Set Up Project.*synchroniz/i);assert.doesNotMatch(notice,/extract/i);});

test('initialization cannot commit a picked profile after Working setup acquires the lock',async t=>{const s=setup(t,{results:[{passed:false,code:2,report:{error:'Multiple Jade connection profiles are available (alpha, beta). Choose --profile <name>; no interactive prompt is available.'}},{passed:true,code:0,created:true,connection:'alpha'}]}),state=new Map();s.services.nativeDiscovery=true;s.services.configFor=()=>({});let busy=false;s.services.isBusy=()=>busy;const request=s.services.client.request;s.services.client.request=(...args)=>{const result=request(...args);if(s.calls.length===2)return{promise:result.promise.then(value=>{busy=true;return value;})};return result;};const controller=registerWorkspaceInitialization(s.vscode,{subscriptions:[],workspaceState:{get:key=>state.get(key),update:async(key,value)=>state.set(key,value)}},s.services);await assert.rejects(controller.initialize(s.folder.uri),/current Jade|Wait|operation/);assert.equal(state.size,0);});
