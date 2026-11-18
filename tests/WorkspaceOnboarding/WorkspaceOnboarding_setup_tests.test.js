'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerWorkspaceOnboarding}=require('../../extension/src/workspace-onboarding');
function fixture(t,{picks=[],warnings=[],inputs=[],folderOpen=true,git=true,initialize={passed:true,code:0}}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-onboarding-')),uri=file=>({scheme:'file',fsPath:file,toString:()=>require('node:url').pathToFileURL(file).href}),folder={name:'Project',uri:uri(root)},calls=[],logs=[],commands=new Map(),state=new Map();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const api={git:{path:'C:/Git/git.exe'},openRepository:async value=>{calls.push(['repository',value.fsPath]);return{pull:async()=>calls.push(['pull'])};},clone:async(value,options)=>{calls.push(['clone',value.toString(),options]);fs.mkdirSync(path.join(root,'cloned'));return uri(path.join(root,'cloned'));}};
 const vscode={Uri:{file:uri,parse:value=>{const parsed=new URL(value);return{scheme:parsed.protocol.slice(0,-1),fsPath:parsed.protocol==='file:'?require('node:url').fileURLToPath(parsed):'',authority:parsed.host,toString:()=>value};}},ProgressLocation:{Notification:15},commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return{dispose(){}};},executeCommand:async(...args)=>{calls.push(['command',...args]);}},extensions:{getExtension:()=>git?{activate:async()=>({enabled:true,getAPI:()=>api})}:undefined},env:{openExternal:async value=>{calls.push(['external',value.toString()]);return true;}},workspace:{workspaceFolders:folderOpen?[folder]:[],getWorkspaceFolder:value=>folderOpen&&path.resolve(value.fsPath)===root?folder:undefined},window:{createOutputChannel:()=>({show(){},appendLine:line=>logs.push(line),dispose(){}}),showQuickPick:async(rows,options)=>{calls.push(['pick',options?.title]);const selected=picks.shift();return typeof selected==='string'?rows.find(row=>row.kind===selected||row.label===selected):selected;},showInputBox:async()=>inputs.shift(),showOpenDialog:async()=>[uri(root)],showWarningMessage:async(message,...actions)=>{calls.push(['warning',message,actions]);return warnings.shift();},showInformationMessage:async(message,...actions)=>{calls.push(['info',message,actions]);return warnings.shift();},showErrorMessage:async message=>calls.push(['error',message])}};
 const context={subscriptions:[],globalState:{get:key=>state.get(key),update:async(key,value)=>{value===undefined?state.delete(key):state.set(key,value);}}};
 const services={initialize:async value=>{calls.push(['initialize',value.fsPath]);return initialize;},targets:async value=>({config:{installPath:'C:/Jade',databasePath:'C:/Source/system',iniPath:'C:/Source/jade.ini',server:'singleUser',workspaceRoots:[value.uri.fsPath]},working:{databasePath:path.join(root,'.jade/working/system'),identity:'native-working'},destination:path.join(root,'sources')}),connectWorking:async(value,config)=>{calls.push(['working',value.uri.fsPath,config]);return{selection:'working',readOnly:true};},extract:async value=>{calls.push(['extract',value.fsPath]);return{passed:true};}};
 const controller=registerWorkspaceOnboarding(vscode,context,services);return{root,folder,uri,vscode,context,api,services,controller,calls,logs,state,commands};
}
test('existing project delegates initialization and reports Working not prepared',async t=>{const f=fixture(t,{picks:['folder','existing','later']});const result=await f.controller.setup();assert.equal(result.configurationReady,true);assert.equal(result.workingPrepared,false);assert.equal(f.calls.filter(c=>c[0]==='initialize').length,1);assert.equal(f.calls.filter(c=>['working','extract','pull'].includes(c[0])).length,0);});
test('explicit Working preparation reviews exact targets and uses the existing scoped connection',async t=>{const f=fixture(t,{picks:['folder','existing','working'],warnings:['Prepare Working']});const result=await f.controller.setup();assert.equal(result.workingPrepared,true);assert.equal(f.calls.find(c=>c[0]==='working')[1],f.root);assert.ok(f.calls.findIndex(c=>c[0]==='initialize')<f.calls.findIndex(c=>c[0]==='working'));assert.ok(f.calls.some(c=>c[0]==='warning'&&c[1].includes('Working')));});
test('failed initialization retains its error and cannot start extraction or Working',async t=>{const f=fixture(t,{picks:['folder'],initialize:{passed:false,code:2,error:'Native profile conflict'}});const result=await f.controller.setup();assert.equal(result.passed,false);assert.match(result.error,/Native profile conflict/);assert.ok(!f.calls.some(c=>['working','extract'].includes(c[0])));});
test('cancelled initial choice starts no Git or native operation',async t=>{const f=fixture(t);assert.equal((await f.controller.setup()).cancelled,true);assert.ok(!f.calls.some(c=>['repository','initialize','working'].includes(c[0])));});
test('clone uses the supported Git API and stores only a continuation folder URI before opening',async t=>{const f=fixture(t,{picks:['clone'],inputs:['https://example.test/project.git']});const result=await f.controller.setup();const clone=f.calls.find(c=>c[0]==='clone');assert.equal(clone[2].postCloneAction,'none');assert.equal(result.continuation,true);assert.ok(f.calls.some(c=>c[0]==='command'&&c[1]==='vscode.openFolder'));assert.ok(!f.calls.some(c=>c[0]==='initialize'));const intent=[...f.state.values()][0];assert.ok(intent.uri.startsWith('file:'));assert.match(intent.nonce,/^[0-9a-f-]{36}$/);assert.deepEqual(Object.keys(intent).sort(),['nonce','uri']);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'cloned/.jade/project-setup.pending'),'utf8')).nonce,intent.nonce);assert.doesNotMatch(f.logs.join(''),/example.test/);});
test('missing Git only opens user-selected standard installation guidance',async t=>{const f=fixture(t,{picks:['folder'],git:false,warnings:['Open Installation Guidance']});const result=await f.controller.setup();assert.equal(result.gitReady,false);assert.ok(f.calls.some(c=>c[0]==='external'&&c[1]==='https://git-scm.com/install/windows'));assert.ok(!f.calls.some(c=>c[0]==='initialize'));});
test('creating a colliding directory preserves existing files and does not initialize it',async t=>{const f=fixture(t,{picks:['create'],inputs:['kept']});fs.mkdirSync(path.join(f.root,'kept'));fs.writeFileSync(path.join(f.root,'kept/local.txt'),'keep');const result=await f.controller.setup();assert.equal(result.passed,false);assert.equal(fs.readFileSync(path.join(f.root,'kept/local.txt'),'utf8'),'keep');assert.ok(!f.calls.some(c=>c[0]==='initialize'));});

test('a new directory is exclusive and continuation remains only its URI',async t=>{const f=fixture(t,{picks:['create'],inputs:['fresh-project']});const result=await f.controller.setup();assert.equal(result.continuation,true);assert.ok(fs.statSync(path.join(f.root,'fresh-project')).isDirectory());assert.ok(!f.calls.some(c=>c[0]==='initialize'));});
for(const invalid of ['../outside','CON','NUL.txt','trailing.','bad\u0001name'])test('invalid new folder '+JSON.stringify(invalid)+' cannot create or initialize a project',async t=>{const f=fixture(t,{picks:['create'],inputs:[invalid]});const result=await f.controller.setup();assert.equal(result.passed,false);assert.ok(!f.calls.some(c=>c[0]==='initialize'));assert.deepEqual(fs.readdirSync(f.root),[]);});
test('embedded credentials are rejected before Git clone or continuation storage',async t=>{const f=fixture(t,{picks:['clone'],inputs:['https://user:token@example.test/project.git']});assert.equal((await f.controller.setup()).passed,false);assert.ok(!f.calls.some(c=>c[0]==='clone'));assert.equal(f.state.size,0);assert.doesNotMatch(f.logs.join(''),/user:token/);});
test('continuation matches the opened folder and requires a fresh user Continue choice',async t=>{const f=fixture(t,{picks:['existing','later'],warnings:['Continue Project Setup']});const nonce=require('node:crypto').randomUUID();fs.mkdirSync(path.join(f.root,'.jade'));fs.writeFileSync(path.join(f.root,'.jade/project-setup.pending'),JSON.stringify({format:'jade-project-setup/1',nonce}));f.state.set('jadeNative.pendingProjectSetup',{uri:f.folder.uri.toString(),nonce});const result=await f.controller.resume();assert.equal(result.configurationReady,true);assert.equal(result.workingPrepared,false);assert.equal(f.state.size,0);assert.equal(f.calls.filter(c=>c[0]==='initialize').length,1);});
test('a continuation for another project performs no initialization and is not consumed',async t=>{const f=fixture(t);f.state.set('jadeNative.pendingProjectSetup',{uri:f.uri(path.join(f.root,'another')).toString(),nonce:require('node:crypto').randomUUID()});assert.equal(await f.controller.resume(),undefined);assert.equal(f.state.size,1);assert.ok(!f.calls.some(c=>c[0]==='initialize'));});
test('declining target review cannot prepare or connect Working',async t=>{const f=fixture(t,{picks:['folder','existing','working']});const result=await f.controller.setup();assert.equal(result.cancelled,true);assert.equal(result.workingPrepared,false);assert.ok(!f.calls.some(c=>c[0]==='working'));});
test('existing checkout pull is explicit and precedes initialization',async t=>{const f=fixture(t,{picks:['folder','pull','existing','later']});f.api.openRepository=async()=>({state:{remotes:[{name:'origin'}]},pull:async()=>f.calls.push(['pull'])});const result=await f.controller.setup();assert.equal(result.configurationReady,true);assert.ok(f.calls.findIndex(c=>c[0]==='pull')<f.calls.findIndex(c=>c[0]==='initialize'));});
test('Working cancellation remains incomplete and does not report setup success',async t=>{const f=fixture(t,{picks:['folder','existing','working'],warnings:['Prepare Working']});f.services.connectWorking=async()=>({cancelled:true});const result=await f.controller.setup();assert.equal(result.cancelled,true);assert.equal(result.workingPrepared,false);assert.ok(!f.logs.some(line=>line.includes('Working: prepared')));});

test('Set Up Project is contributed and actual activation wires existing initialization and scoped Working services',async t=>{
 const manifest=require('../../extension/package.json');assert.ok(manifest.contributes.commands.some(command=>command.command==='jadeNative.setupProject'&&command.title==='Set Up Project'));
 const f=fixture(t,{picks:['folder','existing','working'],warnings:['Prepare Working']});const source=fs.readFileSync(path.join(__dirname,'../../extension/src/extension.js'),'utf8'),start=source.indexOf('  const onboarding='),end=source.indexOf('  const workspaceOperationGuard=',start);assert.ok(start>=0&&end>start,'Actual activation must register onboarding');
 const config={installPath:'C:/Jade',databasePath:'C:/Source/system',iniPath:'C:/Source/jade.ini',server:'singleUser',workspaceRoots:[f.root]};let working=0,initialized=0;
 require('node:vm').runInNewContext(source.slice(start,end),{require:name=>require(path.join(__dirname,'../../extension/src',name)),vscode:f.vscode,context:f.context,workspaceInitialization:{initialize:async value=>{initialized++;return f.services.initialize(value);}},inspectionConfig:()=>config,nativeTests:{workingLocation:async()=>({databasePath:path.join(f.root,'.jade/working/system')})},objectExplorer:{connectWorkingProject:async(root,reviewed)=>{working++;assert.equal(root,f.root);assert.equal(reviewed,config);return{selection:'working',readOnly:true};}}});
 const result=await f.commands.get('jadeNative.setupProject')();assert.equal(result.workingPrepared,true);assert.equal(initialized,1);assert.equal(working,1);
});

test('empty project continuation has a scoped activation event and mismatched marker is preserved',async t=>{const f=fixture(t,{warnings:['Continue Project Setup']});const manifest=require('../../extension/package.json');assert.ok(manifest.activationEvents.includes('workspaceContains:.jade/project-setup.pending'));const nonce=require('node:crypto').randomUUID();fs.mkdirSync(path.join(f.root,'.jade'));const marker=path.join(f.root,'.jade/project-setup.pending'),original=JSON.stringify({format:'jade-project-setup/1',nonce:'different-owner'});fs.writeFileSync(marker,original);f.state.set('jadeNative.pendingProjectSetup',{uri:f.folder.uri.toString(),nonce});const result=await f.controller.resume();assert.equal(result.cancelled,true);assert.equal(fs.readFileSync(marker,'utf8'),original);assert.equal(f.state.size,0);assert.ok(!f.calls.some(c=>c[0]==='initialize'));});
test('failed folder opening removes only its matching owned marker and intent',async t=>{const f=fixture(t,{picks:['create'],inputs:['fresh']});let ownedMarkerPresent=false;f.vscode.commands.executeCommand=async()=>{ownedMarkerPresent=fs.existsSync(path.join(f.root,'fresh/.jade/project-setup.pending'));throw Error('Controlled open failure');};const result=await f.controller.setup();assert.equal(result.passed,false);assert.equal(ownedMarkerPresent,true);assert.equal(f.state.size,0);assert.ok(fs.existsSync(path.join(f.root,'fresh')));assert.ok(!fs.existsSync(path.join(f.root,'fresh/.jade/project-setup.pending')));});

test('an existing unknown activation marker is preserved without opening or replacing the project',async t=>{const f=fixture(t,{picks:['open'],folderOpen:false});fs.mkdirSync(path.join(f.root,'.jade'));const marker=path.join(f.root,'.jade/project-setup.pending');fs.writeFileSync(marker,'user-owned');const result=await f.controller.setup();assert.equal(result.passed,false);assert.equal(fs.readFileSync(marker,'utf8'),'user-owned');assert.equal(f.state.size,0);assert.ok(!f.calls.some(c=>c[0]==='command'&&c[1]==='vscode.openFolder'));});
test('a .jade directory link cannot receive a setup marker',async t=>{const f=fixture(t,{picks:['open'],folderOpen:false}),outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.root,'.jade'),'junction');const result=await f.controller.setup();assert.equal(result.passed,false);assert.deepEqual(fs.readdirSync(outside),[]);assert.equal(f.state.size,0);});
test('failed opening preserves a marker whose owner changed before cleanup',async t=>{const f=fixture(t,{picks:['create'],inputs:['fresh']});let marker;f.vscode.commands.executeCommand=async()=>{marker=path.join(f.root,'fresh/.jade/project-setup.pending');fs.writeFileSync(marker,JSON.stringify({format:'jade-project-setup/1',nonce:'another-owner'}));throw Error('Controlled open failure');};assert.equal((await f.controller.setup()).passed,false);assert.equal(JSON.parse(fs.readFileSync(marker)).nonce,'another-owner');assert.equal(f.state.size,0);});
test('declining resume removes only the owned marker and intent',async t=>{const f=fixture(t),nonce=require('node:crypto').randomUUID(),managed=path.join(f.root,'.jade');fs.mkdirSync(managed);fs.writeFileSync(path.join(managed,'project-setup.pending'),JSON.stringify({format:'jade-project-setup/1',nonce}));fs.writeFileSync(path.join(managed,'keep.txt'),'keep');f.state.set('jadeNative.pendingProjectSetup',{uri:f.folder.uri.toString(),nonce});assert.equal((await f.controller.resume()).cancelled,true);assert.equal(f.state.size,0);assert.deepEqual(fs.readdirSync(managed),['keep.txt']);assert.ok(!f.calls.some(c=>c[0]==='initialize'));});
test('repeated setup clicks join the same initialization attempt',async t=>{const f=fixture(t,{picks:['folder','existing','later']});let release,initializations=0;const gate=new Promise(resolve=>release=resolve);f.services.initialize=async()=>{initializations++;await gate;return{passed:true,code:0};};const first=f.controller.setup(),second=f.controller.setup();assert.equal(first,second);await new Promise(resolve=>setImmediate(resolve));assert.equal(initializations,1);release();assert.equal((await first).configurationReady,true);});
test('removing the reviewed folder cancels before Working connection',async t=>{const f=fixture(t,{picks:['folder','existing','working']});f.vscode.window.showWarningMessage=async()=>{f.vscode.workspace.workspaceFolders=[];return'Prepare Working';};assert.equal((await f.controller.setup()).passed,false);assert.ok(!f.calls.some(c=>c[0]==='working'));});


const verifiedWorkingBaseline={status:'verified',origin:'same-generation-native-extraction',scope:'all',identity:{binding:'opaque-native-proof'}};
test('combined setup uses one reviewed Working sync without separate export or connect',async t=>{
 const f=fixture(t,{picks:['folder','extract','working'],warnings:['Prepare Working']});
 f.services.syncWorkingSources=async(folder,config)=>{f.calls.push(['sync',folder.uri.fsPath,config]);return{passed:true,code:0,workingBaseline:verifiedWorkingBaseline};};
 const value=await f.controller.setup();
 assert.equal(f.calls.filter(c=>c[0]==='sync').length,1,'Combined setup omitted the single native sync');
 assert.equal(f.calls.filter(c=>['extract','working'].includes(c[0])).length,0,'Combined setup repeated Source export or Working connection');
 assert.equal(value.workingPrepared,true);assert.deepEqual(value.workingBaseline,verifiedWorkingBaseline);
 assert.ok(!f.logs.some(x=>x.includes('prepared and connected')),'Native baseline does not establish inspection connection');
});
test('combined setup decline happens before any extraction or Working side effects',async t=>{
 const f=fixture(t,{picks:['folder','extract','working']});await f.controller.setup();
 assert.ok(!f.calls.some(c=>['extract','working','sync'].includes(c[0])),'Declined combined review already extracted sources');
});
test('combined setup preserves native cancellation evidence and incomplete Working state',async t=>{
 const f=fixture(t,{picks:['folder','extract','working'],warnings:['Prepare Working']});
 const native={passed:false,code:130,status:'cancelled',partial:true,completedFiles:1,counts:{added:1}};
 f.services.syncWorkingSources=async()=>native;const value=await f.controller.setup();
 assert.equal(value.cancelled,true);assert.equal(value.workingPrepared,false);assert.deepEqual(value.sourceResult,native);
 assert.ok(!f.calls.some(c=>['extract','working'].includes(c[0])));
});
test('combined setup cannot claim readiness from an unverified native summary',async t=>{
 const f=fixture(t,{picks:['folder','extract','working'],warnings:['Prepare Working']});
 f.services.syncWorkingSources=async()=>({passed:true,code:0,workingBaseline:{status:'reconciliation-required'}});
 const value=await f.controller.setup();assert.equal(value.passed,false);assert.notEqual(value.workingPrepared,true);assert.match(value.error,/baseline|verified|reconcil/i);
});
test('ordinary Source-only setup remains extraction only and has no Working baseline',async t=>{
 const f=fixture(t,{picks:['folder','extract','later']});const value=await f.controller.setup();
 assert.equal(f.calls.filter(c=>c[0]==='extract').length,1);assert.equal(value.workingPrepared,false);assert.equal(value.workingBaseline,undefined);
});


test('combined setup activation delegates to the one shared SourcePull Working sync adapter',async t=>{
 const f=fixture(t,{picks:['folder','extract','working'],warnings:['Prepare Working']});
 const source=fs.readFileSync(path.join(__dirname,'../../extension/src/extension.js'),'utf8'),start=source.indexOf('  const onboarding='),end=source.indexOf('  const workspaceOperationGuard=',start);
 const config={installPath:'C:/Jade',databasePath:'C:/Source/system',iniPath:'C:/Source/jade.ini',server:'singleUser',workspaceRoots:[f.root]};let synced=0;
 require('node:vm').runInNewContext(source.slice(start,end),{require:name=>require(path.join(__dirname,'../../extension/src',name)),vscode:f.vscode,context:f.context,workspaceInitialization:{initialize:f.services.initialize},inspectionConfig:()=>config,nativeTests:{workingLocation:async()=>({databasePath:path.join(f.root,'.jade/working/system')})},sourcePull:{runWorkingSync:async(folder,reviewed)=>{synced++;assert.equal(folder,f.folder);assert.equal(reviewed,config);return{passed:true,code:0,workingBaseline:verifiedWorkingBaseline};}},objectExplorer:{connectWorkingProject:async()=>assert.fail('Combined sync must not connect/export again')}});
 const value=await f.commands.get('jadeNative.setupProject')();assert.equal(synced,1);assert.equal(value.workingPrepared,true);assert.equal(f.calls.filter(c=>c[0]==='command'&&c[1]==='jadeNative.extractAllSources').length,0);
});

test('JOX setup creates Working and extracts once without legacy baseline or a second connection',async t=>{
 const f=fixture(t,{picks:['folder','extract','working'],warnings:['Create Working and extract']});f.services.jox=true;
 const target={config:{installPath:'C:/Runtime',databasePath:'C:/Source',iniPath:'C:/Source/source.ini',server:'singleUser'},working:{databasePath:path.join(f.root,'.jade/working/system'),identity:'native-target'},destination:path.join(f.root,'sources')};
 f.services.targets=async()=>target;
 const snapshot={provider:'jox',projectId:'opaque-project',generation:'native-generation',snapshotHash:'native-hash'};
 f.services.initializeWorkingSources=async(folder,reviewed)=>{assert.equal(reviewed,target);f.calls.push(['joxInitialize']);return{sourceSnapshot:snapshot,extractedFiles:7};};
 f.services.refreshProject=async()=>f.calls.push(['refresh']);f.services.openExplorer=async()=>f.calls.push(['reveal']);
 const value=await f.controller.setup();assert.equal(value.workingPrepared,true);assert.deepEqual(value.sourceSnapshot,snapshot);
 assert.equal(f.calls.filter(c=>c[0]==='joxInitialize').length,1);assert.ok(!f.calls.some(c=>['extract','working','sync'].includes(c[0])));
 assert.ok(!f.logs.some(line=>/source index|verified|baseline|connected\./i.test(line)));
});
test('JOX setup declined at target review never starts restore or export',async t=>{
 const f=fixture(t,{picks:['folder','extract','working']});f.services.jox=true;
 f.services.initializeWorkingSources=async()=>{f.calls.push(['joxInitialize']);};
 assert.equal((await f.controller.setup()).cancelled,true);assert.ok(!f.calls.some(c=>['extract','working','sync','joxInitialize'].includes(c[0])));
});
test('JOX single-command target cancellation never falls back to Source export',async t=>{
 const f=fixture(t,{picks:['folder','extract','later']});f.services.jox=true;
 const value=await f.controller.setup();assert.equal(value.cancelled,true);assert.equal(value.completed,false);assert.equal(value.stage,'review');assert.equal(value.workingPrepared,false);
 assert.ok(!f.calls.some(c=>['extract','working','sync'].includes(c[0])));
});

test('JOX native commit remains visible when awaited view refresh fails',async t=>{
 const f=completeJoxFixture(t,{configured:true});f.workspace.onDidChangeSource(async()=>{throw Error('synthetic view refresh failure after native commit');});
 const result=await f.run();assert.equal(result.workingPrepared,true);assert.equal(result.sourceReady,true);assert.equal(result.completed,false);assert.equal(result.viewsReady,false);assert.equal(result.stage,'refresh');assert.equal(result.passed,false);assert.match(result.error,/synthetic view refresh failure/);
 const start=f.requests.find(row=>row.command==='working.initialize');assert.deepEqual(start.args.destination,f.destination);assert.equal(start.args.expectedWorkingIdentity,'native-reviewed-target');
 assert.equal(f.requests.filter(row=>row.command==='working.initialize').length,1);assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,0);assert.ok(!f.calls.some(row=>row[0]==='command'&&row[1]==='jadeNative.classes.focus'));
});

test('JOX connection replacement after accepted extraction never reconnects or claims complete views',async t=>{
 const f=completeJoxFixture(t,{configured:true,replaceAfterExtraction:true});const result=await f.run();
 assert.equal(result.workingPrepared,true);assert.ok(result.sourceSnapshot);assert.equal(result.viewRefreshRequired,true);assert.equal(result.completed,false);assert.equal(result.passed,false);assert.equal(result.stage,'refresh');
 assert.equal(f.explorerRefreshes(),0);assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare'||row.command==='source.semantic.query').length,0);
});

test('JOX setup preserves committed native outcome when its project closes after extraction',async t=>{
 const f=fixture(t,{picks:['folder','extract','working'],warnings:['Create Working and extract']});f.services.jox=true;
 const snapshot={provider:'jox',projectId:'native',generation:'g',snapshotHash:'h'};
 f.services.initializeWorkingSources=async()=>{f.vscode.workspace.workspaceFolders=[];return{sourceSnapshot:snapshot};};
 const value=await f.controller.setup();assert.equal(value.workingPrepared,true);assert.deepEqual(value.sourceSnapshot,snapshot);assert.equal(value.projectClosed,true);
});


test('real JOX setup defers its project binding until native-first runtime detection has settled',async t=>{
 const f=fixture(t,{picks:['existing','later']}),{NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
 f.vscode.EventEmitter=class{constructor(){this.event=()=>({dispose(){}});}fire(){}dispose(){}};
 f.vscode.window.withProgress=async(_options,run)=>run({report(){}});
 let selected=false,detects=0,initializations=0;
 const settings={installPath:'C:/Chosen Jade',databasePath:'C:/Chosen Source/system',iniPath:'C:/Chosen Source/source.ini',server:'singleUser'};
 const configFor=()=>({sourceFormat:'jox',...(selected?settings:{})});
 const client={client:{closed:false},connect(){return this.client;},sourceCapabilities:async()=>({sourceSemantic:{format:1,providers:[{id:'jox',catalogue:true,initialization:true}]}}),request(command,args){
  assert.equal(command,'cli');assert.equal(args.operation,'init');initializations++;
  if(initializations===1){assert.deepEqual(args.argv,['--config',path.join(f.root,'jade.json')]);return{promise:Promise.resolve({passed:false,code:2,report:{error:'Jade connection setup is required. Run jade-cli init --install <Jade folder> or choose --profile <name>; noninteractive commands never prompt.'}})};}
  assert.equal(args.argv[args.argv.indexOf('--install')+1],settings.installPath);
  return{promise:Promise.resolve({passed:true,code:0,created:true,git:{root:f.root,initialized:true,reused:false,ignoreEnsured:true}})};
 }};
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client,configFor});
 const setup=require('../../extension/src/jox-project-setup').registerJoxProjectSetup(f.vscode,f.context,workspace,{client,configFor,detect:async()=>{detects++;selected=true;return settings;}});
 const result=await setup.initialization.initialize(f.folder.uri);assert.equal(result.passed,true,JSON.stringify(result));
 assert.equal(detects,1);assert.equal(initializations,2);
 const project=workspace.project(f.folder);assert.equal(project.provider.config.installPath,settings.installPath);
 assert.equal(workspace.projects.size,1);assert.equal(project.files.documents.size,0);
 // A later unrelated settings change must still refuse rebinding this project.
 project.files.documents.set('owned-editor',{document:{entityId:'opaque'},dirty:true});selected=false;
 assert.throws(()=>workspace.project(f.folder),/settings changed/);assert.equal(workspace.projects.get(f.folder.uri.toString()),project);assert.equal(project.files.documents.size,1);
});


test('Explorer-enumerated cold project survives Detect handoff and reaches native target review',async t=>{
 const f=fixture(t,{picks:['existing','working']}),{NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
 f.vscode.EventEmitter=class{constructor(){this.event=()=>({dispose(){}});}fire(){}dispose(){}};
 f.vscode.window.createTreeView=()=>({dispose(){}});f.vscode.window.withProgress=async(_options,run)=>run({report(){}});
 let selected=false,initializations=0,targets=0;
 const settings={installPath:'C:/Chosen Jade',databasePath:'C:/Chosen Source/system',iniPath:'C:/Chosen Source/source.ini',server:'singleUser'};
 const configFor=()=>({sourceFormat:'jox',...(selected?settings:{})});
 const client={client:{closed:false},connect(){return this.client;},sourceCapabilities:async()=>({sourceSemantic:{format:1,providers:[{id:'jox',catalogue:true,initialization:true}]}}),request(command,args){
  if(command==='cli'){
   assert.equal(args.operation,'init');initializations++;
   if(initializations===1)return{promise:Promise.resolve({passed:false,code:2,report:{error:'Jade connection setup is required. Run jade-cli init --install <Jade folder> or choose --profile <name>; noninteractive commands never prompt.'}})};
   return{promise:Promise.resolve({passed:true,code:0,created:true,git:{root:f.root,initialized:true,reused:false,ignoreEnsured:true}})};
  }
  assert.equal(command,'working.location');targets++;assert.equal(args.config.installPath,settings.installPath);
  return{promise:Promise.resolve({passed:true,code:0,body:{working:{databasePath:path.join(f.root,'.jade/working/system'),installPath:settings.installPath,identity:'native-target'},source:{databasePath:settings.databasePath,iniPath:settings.iniPath,server:settings.server},initialization:{destination:path.join(f.root,'sources')}}})};
 }};
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client,configFor});
 const explorer=require('../../extension/src/native-source-explorer').registerNativeSourceExplorer(f.vscode,f.context,workspace,{});
 const [row]=await explorer.provider.getChildren();assert.equal(workspace.projects.size,1);assert.equal(initializations,0);assert.equal(row.project.provider.connection,undefined);
 const setup=require('../../extension/src/jox-project-setup').registerJoxProjectSetup(f.vscode,f.context,workspace,{client,configFor,detect:async()=>{selected=true;return settings;}});
 const result=await setup.onboarding.setup(f.folder.uri);
 assert.equal(result.configurationReady,true,JSON.stringify(result));assert.equal(result.cancelled,true,'Target review was deliberately declined');
 assert.equal(initializations,2);assert.equal(targets,1);assert.equal(workspace.project(f.folder),row.project,'Explorer root identity must remain valid');
 assert.equal(row.project.provider.config.installPath,settings.installPath);assert.equal(row.project.files.documents.size,0);
});


function coldSetupProject(t){
 const f=fixture(t),{NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
 f.vscode.EventEmitter=class{constructor(){this.event=()=>({dispose(){}});}fire(){}dispose(){}};
 let changed=false;
 const client={client:{closed:false},connect(){return this.client;},sourceCapabilities:async()=>({sourceSemantic:{format:1,providers:[{id:'jox',catalogue:true}]}})};
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client,configFor:()=>({sourceFormat:'jox',...(changed?{installPath:'C:/Chosen Jade'}:{})})});
 const project=workspace.project(f.folder);return{...f,workspace,project,client,select:()=>{changed=true;}};
}
test('explicit setup cannot rebind an in-flight or settled capability-probed project',async t=>{
 const f=coldSetupProject(t);let release;f.client.sourceCapabilities=()=>new Promise(resolve=>release=resolve);
 const probe=f.project.provider.capability();f.select();
 assert.throws(()=>f.workspace.project(f.folder,{allowColdConfiguration:true}),/settings changed/);
 release({sourceSemantic:{format:1,providers:[{id:'jox',catalogue:true}]}});await probe;
 assert.throws(()=>f.workspace.project(f.folder,{allowColdConfiguration:true}),/settings changed/);assert.equal(f.project.provider.config.installPath,undefined);
});
test('explicit setup cannot rebind a queued source operation',async t=>{
 const f=coldSetupProject(t);let release;const held=new Promise(resolve=>release=resolve);
 const operation=f.project.provider.serializeSource(()=>held);f.select();
 assert.throws(()=>f.workspace.project(f.folder,{allowColdConfiguration:true}),/settings changed/);
 release();await operation;assert.equal(f.project.provider.config.installPath,undefined);
});
test('explicit setup cannot rebind a prepared snapshot or a live editor',async t=>{
 const f=coldSetupProject(t),uri=f.uri(f.root).toString();
 f.project.provider.adoptSnapshot({provider:'jox',projectId:'opaque-project',generation:'opaque-generation',snapshotHash:'1'.repeat(64),projectRoot:uri,sourceRoots:[f.uri(path.join(f.root,'sources')).toString()]},{});
 f.project.files.documents.set('owned-editor',{document:{entityId:'opaque-member'},dirty:true});f.select();
 assert.throws(()=>f.workspace.project(f.folder,{allowColdConfiguration:true}),/settings changed/);
 assert.equal(f.project.files.documents.size,1);assert.equal(f.project.provider.snapshot.projectId,'opaque-project');assert.equal(f.project.provider.config.installPath,undefined);
});
test('restored dirty native URI blocks setup rebinding before editor maps are recovered',t=>{
 const f=coldSetupProject(t);f.vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'jade-source',query:new URLSearchParams({project:f.folder.uri.toString(),binding:'old-native-project'}).toString()}}];
 assert.equal(f.project.files.documents.size,0);f.select();assert.throws(()=>f.workspace.project(f.folder,{allowColdConfiguration:true}),/settings changed/);
 assert.equal(f.project.provider.config.installPath,undefined);assert.equal(f.vscode.workspace.textDocuments[0].isDirty,true);
});
test('persisted native projection recovery state blocks cold handoff without parsing or modifying it',t=>{
 const f=coldSetupProject(t),directory=path.join(f.root,'.jade/projections/old-project/open');fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'retained.json'),bytes=Buffer.from('{"retained":"native-owned recovery state"}\n');fs.writeFileSync(file,bytes);f.select();
 assert.equal(f.project.files.documents.size,0);assert.throws(()=>f.workspace.project(f.folder,{allowColdConfiguration:true}),/settings changed/);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(f.project.provider.config.installPath,undefined);
});
test('ordinary callers retain the cold configuration guard and unrelated recovered tabs remain separate',t=>{
 const f=coldSetupProject(t);f.vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'jade-source',query:new URLSearchParams({project:f.uri(path.join(f.root,'other')).toString(),binding:'other-native-project'}).toString()}}];f.select();
 assert.throws(()=>f.workspace.project(f.folder),/settings changed/);
 assert.equal(f.workspace.project(f.folder,{allowColdConfiguration:true}),f.project);assert.equal(f.project.provider.config.installPath,'C:/Chosen Jade');
});


function completeJoxFixture(t,{configured=false,cancelDetect=false,cancelReview=false,cancelWorking=false,failInitialization=false,replaceAfterExtraction=false,failReuse=false}={}){
 const f=fixture(t,{warnings:cancelReview?[]:['Create Working and extract']}),{NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
 const requests=[],connection={closed:false},destination=path.join(f.root,'sources');let detected=configured,detects=0,failed=false,explorerRefreshes=0;
 class Emitter{constructor(){this.listeners=new Set();this.event=listener=>{this.listeners.add(listener);return{dispose:()=>this.listeners.delete(listener)};};}fire(value){for(const listener of this.listeners)listener(value);}dispose(){this.listeners.clear();}}
 const collection=()=>{const values=new Map();return{add:item=>values.set(item.id,item),replace:items=>{values.clear();for(const item of items)values.set(item.id,item);},forEach:fn=>values.forEach(fn),get:id=>values.get(id),get size(){return values.size;}};};
 const controller={items:collection(),createTestItem:(id,label)=>({id,label,children:collection()}),createRunProfile(){},dispose(){}};
 f.vscode.EventEmitter=Emitter;f.vscode.TestRunProfileKind={Run:1};f.vscode.tests={createTestController:()=>controller};f.vscode.window.createTreeView=()=>({dispose(){}});
 f.vscode.window.withProgress=async(options,run)=>run({report(){}},{isCancellationRequested:cancelWorking&&/Creating Working/.test(options.title),onCancellationRequested:()=>({dispose(){}})});
 const settings={installPath:'C:/Chosen Jade',databasePath:'C:/Chosen Source/system',iniPath:'C:/Chosen Source/source.ini',server:'singleUser'};
 const capabilities={id:'jox',catalogue:true,initialization:true,nativeTests:true,projectionRead:true,projectionEdit:true,documentReopen:true};
 const snapshot={provider:'jox',projectId:'native-project',generation:'native-generation',snapshotHash:'a'.repeat(64)};
 const bound={...snapshot,projectRoot:f.folder.uri.toString(),sourceRoots:[f.uri(destination).toString()],capabilities};
 const working={root:path.join(f.root,'.jade/working'),databasePath:path.join(f.root,'.jade/working/system'),installPath:settings.installPath,identity:'native-reviewed-target'};
 const reply=body=>({promise:Promise.resolve({passed:true,code:0,body})});
 const client={client:connection,connect:()=>connection,sourceCapabilities:async()=>({sourceSemantic:{format:1,providers:[capabilities]}}),request(command,args){
  requests.push({command,args});
  if(command==='cli'){
   assert.equal(args.operation,'init');
   if(!detected)return{promise:Promise.resolve({passed:false,code:2,report:{error:'Jade connection setup is required. Run jade-cli init --install <Jade folder> or choose --profile <name>; noninteractive commands never prompt.'}})};
   fs.writeFileSync(path.join(f.root,'jade.json'),'{"connection":"native-profile","sourceFormat":"jox"}');
   return{promise:Promise.resolve({passed:true,code:0,created:true,git:{root:f.root,initialized:true,reused:false,ignoreEnsured:true}})};
  }
  if(command==='working.location')return reply({working,source:{databasePath:settings.databasePath,iniPath:settings.iniPath,server:settings.server},initialization:{destination}});
  if(command==='working.initialize'){
   if(failInitialization&&!failed){failed=true;return{promise:Promise.resolve({passed:false,code:6295,report:{error:'Native restore stopped; existing owned outputs preserved'}})};}
   fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'saved-origin.jox'),'native saved source');
   if(replaceAfterExtraction)client.client={closed:false};
   return reply({...bound,sourceSnapshot:snapshot,working,extractedFiles:1});
  }
  if(command==='working.prepare'){if(failReuse)return{promise:Promise.resolve({passed:false,code:2,report:{error:'Initialize the owned JOX Working copy before execution; no database was created'}})};return reply({working});}
  if(command==='source.semantic.prepare')return reply(bound);
  if(command==='source.semantic.query')return reply({...snapshot,items:[{id:'native-test',kind:'method',name:'checkValue',testIdentity:{schema:'NativeSchema',class:'NativeTests',method:'checkValue'}}],offset:args.offset,limit:args.limit,total:1,nextOffset:null});
  assert.fail('Unexpected native request '+command);
 }};
 const configFor=()=>({sourceFormat:'jox',...(detected&&!configured?settings:{})});
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client,configFor});
 const explorer=require('../../extension/src/native-source-explorer').registerNativeSourceExplorer(f.vscode,f.context,workspace,{refresh:async()=>{explorerRefreshes++;}});
 const testing=require('../../extension/src/native-source-testing').registerNativeSourceTesting(f.vscode,f.context,workspace);
 workspace.onDidChangeSource(project=>Promise.all([explorer.changed(project),testing.refreshProject(project)]));
 const setup=require('../../extension/src/jox-project-setup').registerJoxProjectSetup(f.vscode,f.context,workspace,{client,configFor,detect:async()=>{detects++;if(cancelDetect)return;detected=true;return settings;}});
 return{...f,workspace,explorer,testing,requests,controller,destination,resume:()=>setup.onboarding.resume(),run:()=>f.commands.get('jadeNative.setupProject')(f.folder.uri),detects:()=>detects,explorerRefreshes:()=>explorerRefreshes};
}
for(const configured of [false,true])test('one registered Set Up Project completes native configuration, extraction, Explorer and tests: profile='+configured,async t=>{
 const f=completeJoxFixture(t,{configured});await f.explorer.provider.getChildren();
 const result=await f.run();assert.equal(result.completed,true,JSON.stringify(result));assert.equal(result.workingPrepared,true);assert.equal(result.viewsReady,true);assert.equal(result.stage,'complete');
 assert.equal(f.detects(),configured?0:1);assert.equal(f.requests.filter(row=>row.command==='working.initialize').length,1);
 const review=f.calls.find(row=>row[0]==='warning'&&row[2][0]?.modal);assert.match(review[2][0].detail,/\nServer: singleUser\n/);
 assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,0,'Accepted initialization snapshot must not be prepared again');
 assert.equal(f.explorerRefreshes(),1);assert.equal(f.controller.items.get(f.folder.uri.toString()).children.size,1);
 assert.ok(f.calls.some(row=>row[0]==='command'&&row[1]==='jadeNative.classes.focus'));
 assert.ok(!f.calls.some(row=>row[0]==='pick'),'Already-open folder needs no source/Working command-hop choices');
});
for(const stop of ['detect','review','working'])test('single-command cancellation stops at '+stop+' before later native work',async t=>{
 const f=completeJoxFixture(t,{cancelDetect:stop==='detect',cancelReview:stop==='review',cancelWorking:stop==='working'});
 const result=await f.run();assert.equal(result.cancelled,true,JSON.stringify(result));assert.equal(result.completed,false);assert.equal(result.stage,stop==='detect'?'configuration':stop==='review'?'review':'working');
 assert.equal(f.requests.filter(row=>row.command==='working.initialize').length,0);assert.equal(f.explorerRefreshes(),0);assert.equal(f.controller.items.size,0);
});
test('single-command retry preserves native failure then reuses completed sources and Working',async t=>{
 const f=completeJoxFixture(t,{configured:true,failInitialization:true});
 const first=await f.run();assert.equal(first.passed,false);assert.equal(first.code,6295);assert.equal(first.stage,'working');assert.equal(first.completed,false);assert.equal(f.explorerRefreshes(),0);
 f.vscode.window.showWarningMessage=async()=> 'Create Working and extract';const second=await f.run();assert.equal(second.completed,true,JSON.stringify(second));
 const saved=fs.readFileSync(path.join(f.destination,'saved-origin.jox'));f.vscode.window.showWarningMessage=async()=> 'Prepare Working';
 const third=await f.run();assert.equal(third.completed,true,JSON.stringify(third));assert.deepEqual(fs.readFileSync(path.join(f.destination,'saved-origin.jox')),saved);
 assert.equal(f.requests.filter(row=>row.command==='working.initialize').length,2,'Retry must never re-extract completed sources');assert.equal(f.requests.filter(row=>row.command==='working.prepare').length,1);
 assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,1,'Existing sources need one normal native capture');
});

test('verified JOX folder continuation automatically completes once without a second command',async t=>{
 const f=completeJoxFixture(t,{configured:true}),nonce=require('node:crypto').randomUUID();fs.mkdirSync(path.join(f.root,'.jade'));
 const marker=path.join(f.root,'.jade/project-setup.pending');fs.writeFileSync(marker,JSON.stringify({format:'jade-project-setup/1',nonce}));f.state.set('jadeNative.pendingProjectSetup',{uri:f.folder.uri.toString(),nonce});
 const result=await f.resume();assert.equal(result.completed,true,JSON.stringify(result));assert.equal(f.state.size,0);assert.equal(fs.existsSync(marker),false);
 assert.equal(f.requests.filter(row=>row.command==='working.initialize').length,1);assert.ok(!f.calls.some(row=>row[0]==='info'&&row[2]?.includes('Continue Project Setup')));
 const requests=f.requests.length;assert.equal(await f.resume(),undefined);assert.equal(f.requests.length,requests);
});
test('existing sources without native-owned Working stop safely and never fall back to re-extraction',async t=>{
 const f=completeJoxFixture(t,{configured:true,failReuse:true});fs.mkdirSync(f.destination);const file=path.join(f.destination,'user-source.jox'),bytes=Buffer.from('existing saved user bytes');fs.writeFileSync(file,bytes);
 f.vscode.window.showWarningMessage=async()=> 'Prepare Working';const result=await f.run();
 assert.equal(result.passed,false);assert.equal(result.code,2);assert.equal(result.completed,false);assert.equal(result.stage,'working');assert.match(result.error,/Initialize the owned JOX Working copy/);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(f.requests.filter(row=>row.command==='working.initialize').length,0);assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,0);assert.equal(f.explorerRefreshes(),0);
});
