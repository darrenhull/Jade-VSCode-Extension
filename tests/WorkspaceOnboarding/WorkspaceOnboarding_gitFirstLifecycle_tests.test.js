'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
const {registerJoxProjectSetup}=require('../../extension/src/jox-project-setup');

// Presentation integration: real onboarding/provider/workspace, simulated CLI
// replies. This does not claim native compilation, reconciliation or execution.
function fixture(t,{configured=false,existing=false,initializeFailure=false,syncFailure=false,capabilityMissing=false,previewRefused=false,detectCancelled=false,confirmCancelled=false,sourceMode=false,sourceSeedOnly=false,stateWriteFailure=false,removeDuringInitialize=false,gitRepository=true,unknownProfile=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-git-first-onboarding-'));
 t.after(()=>{const temp=path.resolve(os.tmpdir())+path.sep,owned=path.resolve(root);assert.ok(owned.startsWith(temp)&&path.basename(owned).startsWith('jade-git-first-onboarding-'));fs.rmSync(owned,{recursive:true,force:true});});
 const uri=file=>({scheme:'file',fsPath:file,toString:()=>pathToFileURL(file).href});
 const folder={name:'Existing checkout',uri:uri(root)},source=path.join(root,'sources'),projectFile=path.join(root,'jade.json');
 fs.mkdirSync(source);fs.mkdirSync(path.join(root,'.git'));
 const sourceFile=path.join(source,'Fish.jox'),original=Buffer.from('saved JOX fixture bytes\r\n');fs.writeFileSync(sourceFile,original);
 const gitMarker=path.join(root,'.git','preserve');fs.writeFileSync(gitMarker,'user Git state');
 const project={sourceFormat:'jox',workingMode:sourceMode?'source-backed':'git-first',workspaceRoots:['sources']};
 if(configured)fs.writeFileSync(projectFile,JSON.stringify(project));
 let selected=configured||sourceSeedOnly,accepted=existing,snapshotHash='a'.repeat(64),nextSync={passed:true,code:0,report:{noOp:true,loadedFiles:0}};
 const calls=[],logs=[],commands=new Map();
 const machine={installPath:'C:/Licensed ANSI Jade',...(sourceSeedOnly?{databasePath:'C:/Application Source'}:{workingSeedDirectory:'C:/Private vendor seed'})};
 const capabilities={id:'jox',catalogue:true,initialization:true,checkoutInitialization:true,sync:true};
 if(capabilityMissing)delete capabilities.checkoutInitialization;
 const working={identity:'native-reviewed-working',root:path.join(root,'.jade','working'),databasePath:path.join(root,'.jade','working','system'),installPath:machine.installPath};
 const snapshot=()=>({provider:'jox',projectId:'opaque-project',generation:'opaque-generation',snapshotHash});
 const bound=()=>({...snapshot(),projectRoot:folder.uri.toString(),sourceRoots:[uri(source).toString()],capabilities});
 const reply=body=>({promise:Promise.resolve({passed:true,code:0,body})});
 const connection={closed:false};
 const client={client:connection,connect:()=>connection,sourceCapabilities:async config=>{calls.push({command:'capabilities',config});return{sourceSemantic:{format:1,providers:[capabilities]}};},request(command,args){
  calls.push({command,args});
  assert.ok(!command.startsWith('source.extract'),'Git-first setup must never extract Source');
  for(const key of ['databasePath','iniPath','sourceDatabasePath'])assert.equal(args.config?.[key],undefined,'Git-first CLI request must not supply '+key);
  if(command==='cli'){
   assert.fail('Existing saved JOX must not require CLI init or create jade.json');
  }
  if(command==='prepare'){if(unknownProfile)return{promise:Promise.resolve({passed:false,code:2,report:{error:'Unknown Jade connection profile: demo'}})};const explicit=fs.existsSync(projectFile)?JSON.parse(fs.readFileSync(projectFile,'utf8')):undefined;return{promise:Promise.resolve({passed:true,code:0,prepared:{config:explicit||{},configFile:explicit?projectFile:null}})};}
  if(command==='working.location'){
   assert.equal(args.checkoutOnly,true,'Existing source checkout must not enter Source-backed target discovery');
   if(previewRefused||!args.config.installPath||!args.config.workingSeedDirectory||args.config.workingMode!=='git-first')return reply({checkoutConfigured:false});
   return reply({checkoutConfigured:true,workingMode:'git-first',working,workingState:accepted?'existing':'new',sourceRoots:[uri(source).toString()]});
  }
  if(command==='working.initialize'){
   assert.equal(args.expectedWorkingIdentity,working.identity);assert.equal(args.destination,undefined,'Checkout setup must not extract to a destination');
   if(initializeFailure)return{promise:Promise.resolve({passed:false,code:6295,report:{error:'Native checkout load refused'}})};
   accepted=true;if(removeDuringInitialize)vscode.workspace.workspaceFolders=[];return reply({...bound(),sourceSnapshot:snapshot(),working,report:{workingMode:'git-first',workingPrepared:true,publicationEstablished:true}});
  }
  if(command==='working.prepare')return reply({working});
  if(command==='source.semantic.prepare')return reply(bound());
  if(command==='source.semantic.closeProject')return reply({});
  if(command==='sync')return{promise:Promise.resolve(syncFailure?{passed:false,code:6023,report:{error:'Native saved change rejected'}}:nextSync)};
  assert.fail('Unexpected native operation '+command);
 }};
 const configFor=()=>({sourceFormat:'jox',...(selected?machine:{})});
 const vscode={Uri:{file:uri},RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern;}},EventEmitter:class{constructor(){this.event=()=>({dispose(){}});}fire(){}dispose(){}},ProgressLocation:{Notification:15},
  commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async name=>calls.push({command:'ui.'+name})},
  extensions:{getExtension:()=>({activate:async()=>({enabled:true,getAPI:()=>({git:{path:'git.exe'},openRepository:async()=>gitRepository?{}:undefined})})})},
  workspace:{workspaceFolders:[folder],textDocuments:[],getWorkspaceFolder:value=>path.resolve(value.fsPath)===root?folder:undefined,findFiles:async(...args)=>{calls.push({command:'ui.findFiles',args});return[uri(sourceFile)];}},
  window:{createOutputChannel:()=>({show(){},append:line=>logs.push(line),appendLine:line=>logs.push(line),dispose(){}}),
   showWarningMessage:async(_message,_options,action)=>confirmCancelled?undefined:action,showErrorMessage:async message=>logs.push(message),showInformationMessage:async()=>undefined,
   withProgress:async(_options,run)=>run({report(){}},{isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})})}};
 const savedState=new Map();const context={subscriptions:[],globalState:{get(){},async update(){}},workspaceState:{get:(key,fallback)=>savedState.get(key)??fallback,update:async(key,value)=>{if(stateWriteFailure)throw Error('Private state write failed');savedState.set(key,value);}}};
 const workspace=new NativeSourceWorkspace({vscode,client,configFor});
 workspace.refresh=async()=>calls.push({command:'ui.refresh'});workspace.observeSources=()=>{};
 const setup=registerJoxProjectSetup(vscode,context,workspace,{client,configFor,detect:async(...args)=>{calls.push({command:'ui.detect',args});if(detectCancelled)return;const before=selected;if(args[2]?.deferSave)return{settings:{...machine},commit:async()=>{selected=true;},rollback:async()=>{selected=before;}};selected=true;return machine;}});
 return{settings:machine,context,vscode,client,configFor,root,folder,sourceFile,projectFile,original,gitMarker,calls,logs,setup,workspace,change:()=>{fs.writeFileSync(sourceFile,'changed saved JOX fixture');snapshotHash='b'.repeat(64);nextSync={passed:true,code:0,report:{noOp:false,loadedFiles:1}};}};
}

test('existing JOX checkout without jade.json or runtime settings reaches Source-free native setup',async t=>{
 const f=fixture(t),result=await f.setup.onboarding.setup(f.folder.uri);
 assert.equal(result.completed,true,JSON.stringify(result));assert.equal(result.sourceChoice,'git-first');
 assert.equal(f.calls.filter(row=>row.command==='ui.detect').length,1);
 assert.equal(f.calls.filter(row=>row.command==='working.initialize').length,1);
 assert.deepEqual(fs.readFileSync(f.sourceFile),f.original);assert.equal(fs.readFileSync(f.gitMarker,'utf8'),'user Git state');
 assert.equal(fs.existsSync(f.projectFile),false,'Git-first setup must preserve optional jade.json absence');
 assert.equal(f.calls.filter(row=>row.command==='cli').length,0);
 const scan=f.calls.find(row=>row.command==='ui.findFiles');assert.equal(scan.args[0].base,f.folder.uri);assert.equal(scan.args[0].pattern,'sources/**/*.[jJ][oO][xX]');assert.equal(scan.args[2],1,'Detection must not enumerate the source tree');
 assert.ok(f.calls.findIndex(row=>row.command==='working.initialize')<f.calls.findIndex(row=>row.command==='ui.refresh'));
});

test('selected checkout capability probe uses the detected runtime and seed without Source settings',async t=>{
 const f=fixture(t),result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,true,JSON.stringify(result));
 const detection=f.calls.findIndex(row=>row.command==='ui.detect'),probe=f.calls.slice(detection+1).find(row=>row.command==='capabilities');
 assert.ok(probe,'Probe must follow runtime selection');assert.equal(probe.config.installPath,'C:/Licensed ANSI Jade');assert.equal(probe.config.workingSeedDirectory,'C:/Private vendor seed');
 for(const key of ['databasePath','iniPath','sourceDatabasePath'])assert.equal(probe.config[key],undefined);
});

for(const [name,options] of [['missing checkout capability',{capabilityMissing:true}],['refused native checkout preview',{previewRefused:true}]])test(name+' fails closed instead of entering Source-backed setup',async t=>{
 const f=fixture(t,options),result=await f.setup.onboarding.setup(f.folder.uri);
 assert.equal(result.passed,false);assert.equal(result.completed,false);assert.match(result.error,/update.*cli|cli.*update|checkout.*unavailable|checkout.*not.*available|checkout.*refus/i);
 assert.equal(f.calls.filter(row=>row.command==='cli').length,0);assert.equal(f.calls.filter(row=>['working.initialize','working.prepare','sync','ui.refresh'].includes(row.command)).length,0);
 assert.equal(fs.existsSync(f.projectFile),false);assert.deepEqual(fs.readFileSync(f.sourceFile),f.original);
});

test('cancelled checkout runtime selection cannot create configuration or prepare a database',async t=>{
 const f=fixture(t,{detectCancelled:true}),result=await f.setup.onboarding.setup(f.folder.uri);
 assert.equal(result.cancelled,true);assert.equal(result.completed,false);
 assert.equal(f.calls.filter(row=>['cli','working.location','working.initialize','working.prepare','sync','ui.refresh'].includes(row.command)).length,0);
 assert.equal(fs.existsSync(f.projectFile),false);assert.deepEqual(fs.readFileSync(f.sourceFile),f.original);
});

test('accepted unchanged Working is reconciled natively on every setup before view refresh',async t=>{
 const f=fixture(t,{configured:true,existing:true});
 for(let i=0;i<2;i++){const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,true,JSON.stringify(result));}
 assert.equal(f.calls.filter(row=>row.command==='sync').length,2,'A previous no-op must not cache the next sync result');
 assert.equal(f.calls.filter(row=>row.command==='working.initialize').length,0);
 const firstPrepare=f.calls.findIndex(row=>row.command==='working.prepare'),firstSync=f.calls.findIndex(row=>row.command==='sync'),firstRefresh=f.calls.findIndex(row=>row.command==='ui.refresh');
 assert.ok(firstPrepare<firstSync&&firstSync<firstRefresh,'Connect, native sync, then refresh');
});

test('later saved Git changes use the same native sync path without Source extraction or reset',async t=>{
 const f=fixture(t,{configured:true,existing:true});await f.setup.onboarding.setup(f.folder.uri);f.change();
 const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,true,JSON.stringify(result));
 const sync=f.calls.filter(row=>row.command==='sync');assert.equal(sync.length,2);assert.equal(sync[1].args.sourceSnapshot.snapshotHash,'b'.repeat(64));
 assert.equal(f.calls.filter(row=>row.command==='working.initialize').length,0);assert.equal(fs.readFileSync(f.sourceFile,'utf8'),'changed saved JOX fixture');
});

test('native checkout failure preserves saved source and cannot fall back to Source extraction',async t=>{
 const f=fixture(t,{configured:true,initializeFailure:true}),result=await f.setup.onboarding.setup(f.folder.uri);
 assert.equal(result.passed,false);assert.equal(result.code,6295);assert.equal(result.completed,false);
 assert.equal(f.calls.filter(row=>row.command==='working.initialize').length,1);assert.equal(f.calls.filter(row=>row.command==='ui.refresh').length,0);
 assert.deepEqual(fs.readFileSync(f.sourceFile),f.original);
});

test('native reconciliation failure does not claim ready views or reinitialize Working',async t=>{
 const f=fixture(t,{configured:true,existing:true,syncFailure:true}),result=await f.setup.onboarding.setup(f.folder.uri);
 assert.equal(result.passed,false);assert.equal(result.code,6023);assert.equal(result.completed,false);
 assert.equal(f.calls.filter(row=>row.command==='sync').length,1);assert.equal(f.calls.filter(row=>row.command==='ui.refresh').length,0);
 assert.equal(f.calls.filter(row=>row.command==='working.initialize').length,0);assert.deepEqual(fs.readFileSync(f.sourceFile),f.original);
});

for(const options of [{previewRefused:true},{confirmCancelled:true}])test('refused or cancelled checkout preview preserves active configuration '+JSON.stringify(options),async t=>{const f=fixture(t,options);await f.setup.onboarding.setup(f.folder.uri);assert.deepEqual(f.setup.configFor(f.folder),f.configFor(f.folder));assert.equal(f.workspace.projects.size,0);});
test('successful configless checkout selection survives extension registration restart',async t=>{const f=fixture(t);assert.equal((await f.setup.onboarding.setup(f.folder.uri)).completed,true);const again=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:f.configFor});const setup=registerJoxProjectSetup(f.vscode,f.context,again,{client:f.client,configFor:f.configFor,detect:async()=>assert.fail('Unexpected detect')});assert.equal(setup.configFor(f.folder).workingMode,'git-first');assert.deepEqual(setup.configFor(f.folder).workspaceRoots,[path.join(f.root,'sources')]);});
test('explicit Source-backed mode is preserved despite saved JOX files',async t=>{const f=fixture(t,{configured:true,sourceMode:true});await f.setup.onboarding.setup(f.folder.uri);assert.equal(f.setup.configFor(f.folder).workingMode,undefined);assert.equal(f.calls.filter(row=>row.command==='working.location'&&row.args.checkoutOnly).length,0);});
test('application database setting cannot suppress separate vendor seed selection',async t=>{const f=fixture(t,{sourceSeedOnly:true,detectCancelled:true});const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.cancelled,true);assert.equal(f.calls.filter(row=>row.command==='ui.detect').length,1);assert.equal(f.calls.filter(row=>row.command==='working.location').length,0);});

test('failed checkout load rolls back temporary selection and never persists it',async t=>{const f=fixture(t,{initializeFailure:true});const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.code,6295);assert.deepEqual(f.setup.configFor(f.folder),f.configFor(f.folder));assert.equal(f.workspace.projects.size,0);assert.deepEqual(f.context.workspaceState.get('jadeNative.acceptedGitFirstCheckouts',[]),[]);});

test('a later explicit Source project supersedes a remembered configless selection',async t=>{const f=fixture(t);assert.equal((await f.setup.onboarding.setup(f.folder.uri)).completed,true);fs.writeFileSync(f.projectFile,JSON.stringify({sourceFormat:'jox',workingMode:'source-backed'}));assert.equal(f.setup.configFor(f.folder).workingMode,undefined);});
test('failed private state write rolls back temporary checkout selection',async t=>{const f=fixture(t,{stateWriteFailure:true});const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.match(result.error,/Private state write failed/);assert.deepEqual(f.setup.configFor(f.folder),f.configFor(f.folder));assert.equal(f.workspace.projects.size,0);});

test('pending checkout config is hidden from shared callers until private state accepts it',async t=>{const f=fixture(t);const save=f.context.workspaceState.update;let observed=false;f.context.workspaceState.update=async(...args)=>{observed=true;assert.equal(f.setup.configFor(f.folder).workingMode,undefined);return save(...args);};assert.equal((await f.setup.onboarding.setup(f.folder.uri)).completed,true);assert.equal(observed,true);assert.equal(f.setup.configFor(f.folder).workingMode,'git-first');});
test('remembered checkout repairs missing runtime settings before native review',async t=>{const f=fixture(t);assert.equal((await f.setup.onboarding.setup(f.folder.uri)).completed,true);delete f.settings.installPath;delete f.settings.workingSeedDirectory;let detected=false;const again=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:f.configFor});again.refresh=async()=>{};again.observeSources=()=>{};const setup=registerJoxProjectSetup(f.vscode,f.context,again,{client:f.client,configFor:f.configFor,detect:async()=>{detected=true;const values={installPath:'C:/Licensed ANSI Jade',workingSeedDirectory:'C:/Private vendor seed'};return{settings:values,commit:async()=>Object.assign(f.settings,values),rollback:async()=>{}};}});const result=await setup.onboarding.setup(f.folder.uri);assert.equal(detected,true);assert.equal(result.completed,true,JSON.stringify(result));});

test('refused checkout rebinding preserves a live existing source project',async t=>{const f=fixture(t);const original=f.workspace.project(f.folder);original.provider.snapshot={provider:'jox',projectId:'existing-project'};const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.equal(f.workspace.projects.get(f.folder.uri.toString()),original);assert.equal(original.provider.snapshot.projectId,'existing-project');});

test('failed setup restores a reused cold project and its provider configuration',async t=>{const f=fixture(t,{initializeFailure:true});const prior=f.workspace.project(f.folder),config={...prior.provider.config};const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.code,6295);assert.equal(f.workspace.projects.get(f.folder.uri.toString()),prior);assert.deepEqual(prior.provider.config,config);assert.equal(prior.provider.connection,undefined);assert.equal(prior.provider.snapshot,undefined);});
test('deferred workspace refresh is scheduled only after checkout state commit',async t=>{const f=fixture(t);let committed=false,scheduled=0;const save=f.context.workspaceState.update;f.context.workspaceState.update=async(...args)=>{await save(...args);committed=true;};f.workspace.pendingChanges.set({}, {needsPrepare:false});f.workspace.scheduleRefresh=()=>{scheduled++;assert.equal(committed,true);assert.equal(f.workspace.configFor(f.folder).workingMode,'git-first');};const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,true,JSON.stringify(result));assert.ok(scheduled>0);});

test('failed private persistence restores reused provider after closing the temporary native binding',async t=>{const f=fixture(t,{stateWriteFailure:true});const prior=f.workspace.project(f.folder),config={...prior.provider.config};const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.equal(f.workspace.projects.get(f.folder.uri.toString()),prior);assert.deepEqual(prior.provider.config,config);for(const key of ['connection','probe','snapshot','sourceRoots','flags'])assert.equal(Object.hasOwn(prior.provider,key),false,key);assert.ok(f.calls.some(row=>row.command==='source.semantic.closeProject'));});

test('pending setup never changes a provider already held by a workspace caller',async t=>{const f=fixture(t);const prior=f.workspace.project(f.folder),config={...prior.provider.config};const save=f.context.workspaceState.update;let observed=false;f.context.workspaceState.update=async(...args)=>{observed=true;assert.deepEqual(prior.provider.config,config);assert.equal(prior.provider.connection,undefined);return save(...args);};const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,true,JSON.stringify(result));assert.equal(observed,true);assert.notEqual(f.workspace.projects.get(f.folder.uri.toString()),prior);});
test('folder removal during initialization cannot persist checkout selection',async t=>{const f=fixture(t,{removeDuringInitialize:true});const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.deepEqual(f.context.workspaceState.get('jadeNative.acceptedGitFirstCheckouts',[]),[]);assert.equal(f.setup.configFor(f.folder).workingMode,undefined);});

test('setup adoption preserves an explicitly inherited Working policy',async t=>{const f=fixture(t);f.settings.workingJadeGitPolicy='inherit';const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,true,JSON.stringify(result));assert.equal(f.workspace.project(f.folder).provider.config.workingJadeGitPolicy,'inherit');});

test('loose JOX files without a repository retain ordinary setup initialization',async t=>{const f=fixture(t,{gitRepository:false});await f.setup.onboarding.setup(f.folder.uri);assert.equal(f.calls.some(row=>row.command==='working.initialize'),false);assert.ok(f.calls.some(row=>row.command==='cli'));});
test('a Source project added during confirmation stops before native Working operations',async t=>{const f=fixture(t);f.vscode.window.showWarningMessage=async(_message,_options,action)=>{fs.writeFileSync(f.projectFile,JSON.stringify({sourceFormat:'jox',workingMode:'source-backed'}));return action;};const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.equal(f.calls.filter(row=>['working.initialize','working.prepare','sync'].includes(row.command)).length,0);});
test('missing cloned profile discovery preserves ordinary machine-configuration recovery',async t=>{const f=fixture(t,{configured:true,sourceMode:true,unknownProfile:true});await f.setup.onboarding.setup(f.folder.uri);assert.ok(f.calls.some(row=>row.command==='cli'));assert.equal(f.calls.some(row=>row.command==='working.initialize'),false);});

test('refused preview leaves existing machine settings and cold provider unchanged',async t=>{const f=fixture(t,{previewRefused:true});const prior=f.workspace.project(f.folder),config={...prior.provider.config};await f.setup.onboarding.setup(f.folder.uri);assert.deepEqual(f.configFor(f.folder),{sourceFormat:'jox'});assert.equal(f.workspace.projects.get(f.folder.uri.toString()),prior);assert.deepEqual(prior.provider.config,config);assert.equal(f.workspace.project(f.folder),prior);});
test('failed acceptance rolls staged runtime settings back before releasing shared configuration',async t=>{const f=fixture(t,{stateWriteFailure:true});const result=await f.setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.deepEqual(f.configFor(f.folder),{sourceFormat:'jox'});assert.deepEqual(f.setup.configFor(f.folder),{sourceFormat:'jox'});});

test('an explicit project appearing during remembered runtime detection stops before Working',async t=>{const f=fixture(t);assert.equal((await f.setup.onboarding.setup(f.folder.uri)).completed,true);delete f.settings.installPath;delete f.settings.workingSeedDirectory;const before=f.calls.length,again=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:f.configFor});const setup=registerJoxProjectSetup(f.vscode,f.context,again,{client:f.client,configFor:f.configFor,detect:async()=>{fs.writeFileSync(f.projectFile,JSON.stringify({sourceFormat:'jox',workingMode:'source-backed'}));return{settings:{installPath:'C:/Licensed ANSI Jade',workingSeedDirectory:'C:/Private vendor seed'},commit:async()=>assert.fail('Staged settings must remain untouched'),rollback:async()=>{}};}});const result=await setup.onboarding.setup(f.folder.uri);assert.equal(result.completed,false);assert.equal(f.calls.slice(before).filter(row=>['working.initialize','working.prepare','sync'].includes(row.command)).length,0);});
