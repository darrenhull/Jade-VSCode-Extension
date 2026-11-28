"use strict";
const { registerWorkspaceInitialization }=require('./workspace-initialization');
const { registerWorkspaceOnboarding }=require('./workspace-onboarding');
const { NativeSourceProvider }=require('./NativeSourceProvider');
const { configDto }=require('./cli-client');
const path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const fs=require('node:fs');
const {NativeSourceWorkspace}=require('./NativeSourceWorkspace');
const {PrivateRuntimeSettings}=require('./PrivateRuntimeSettings');
const CHECKOUT_STATE='jadeNative.acceptedGitFirstCheckouts';
const CHECKOUT_FILES='jadeNative.acceptedGitFirstProjectFiles';
const DIRECT_WORKING_DEFAULTS=['installPath','databasePath','iniPath','connection','workingMode','sourceFormat','server','characterSet','schemaPath','workspaceRoots','storagePath'];
const CHECKOUT_DEFAULTS=[...DIRECT_WORKING_DEFAULTS,'workingSeedDirectory'];
const { checkoutConfiguration }=require('./jox-checkout-config');
const {checkoutRoute}=require('./checkout-route');
const {WorkspaceConnectionProfile}=require('./WorkspaceConnectionProfile');
function projectFile(folder){
  let directory=path.resolve(folder.uri.fsPath);
  for(;;){const file=path.join(directory,'jade.json');if(fs.existsSync(file))return file;const parent=path.dirname(directory);if(parent===directory)return null;directory=parent;}
}
const sameFile=(left,right)=>left===null||right===null?left===right:typeof left==='string'&&typeof right==='string'&&path.resolve(left).toLowerCase()===path.resolve(right).toLowerCase();
/** Presents native setup for a saved checkout or Source-backed extraction. */
function registerJoxProjectSetup(vscode,context,workspace,{client,configFor,detect}) {
  const output=vscode.window.createOutputChannel('Jade Working Setup');context.subscriptions.push(output);
  const state=context.workspaceState;
  const explicitConfigFor=configFor,pendingProfiles=new Map();
  const profilesFor=folder=>new WorkspaceConnectionProfile(state,folder.uri.toString(),(...args)=>vscode.window.showQuickPick(...args));
  const discoveredFor=async (folder,overrides={})=>{
    const file=projectFile(folder),project=file?JSON.parse(fs.readFileSync(file,'utf8')):{};
    const profiles=profilesFor(folder),configured={...configFor(folder),...overrides},profile=explicitConfigFor(folder).connection||project.connection||overrides.connection||pendingProfiles.get(folder.uri.toString())?.name||profiles.current();
    const runtime=Object.entries({install:overrides.installPath,database:overrides.databasePath,ini:overrides.iniPath,server:overrides.server}).filter(([,value])=>typeof value==='string'&&value).flatMap(([name,value])=>['--'+name,value]);
    const request=name=>client.request('prepare',{operation:'inspect.target',cwd:folder.uri.fsPath,argv:[...(name?['--profile',name]:[]),...runtime]}).promise;
    const priorProfile=profiles.current();
    let result=await request(profile);
    if(result?.passed!==true&&/^Unknown Jade connection profile /i.test(result?.report?.error||'')&&profile===profiles.current()&&!explicitConfigFor(folder).connection&&!project.connection&&!overrides.connection&&!pendingProfiles.has(folder.uri.toString())){
      const previous=profiles.current();result=await request(undefined);
      const replacement=result?.prepared?.config?.connection;
      if(result?.passed===true&&typeof replacement==='string'&&replacement)pendingProfiles.set(folder.uri.toString(),{name:replacement,previous});
    }
    if(result?.passed!==true){const previous=profiles.current(),selected=await profiles.select(result?.report?.error,{persist:false});if(selected){pendingProfiles.set(folder.uri.toString(),{name:selected,previous});result=await request(selected);}}
    const resolvedProfile=result?.prepared?.config?.connection;
    if(result?.passed===true&&typeof resolvedProfile==='string'&&resolvedProfile&&!explicitConfigFor(folder).connection&&!project.connection&&!overrides.connection&&!pendingProfiles.has(folder.uri.toString()))pendingProfiles.set(folder.uri.toString(),{name:resolvedProfile,previous:priorProfile});
    return result;
  };
  const privateRuntime=folder=>new PrivateRuntimeSettings(state,folder.uri.toString());
  const transientRuntime={values:()=>({}),stage:(_values,{validate=()=>{}}={})=>({commit:validate,rollback:async()=>{}})};
  const savedFiles=state?.get(CHECKOUT_FILES,{});
  const acceptedFiles=new Map(Object.entries(savedFiles&&typeof savedFiles==='object'&&!Array.isArray(savedFiles)?savedFiles:{}).filter(([,entry])=>entry&&(entry.file===null||typeof entry.file==='string')&&(entry.fingerprint===null||/^[a-f0-9]{64}$/.test(entry.fingerprint))&&entry.defaults&&Object.entries(entry.defaults).every(([key,value])=>CHECKOUT_DEFAULTS.includes(key)&&(typeof value==='string'||key==='workspaceRoots'&&Array.isArray(value)&&value.every(root=>typeof root==='string')))));
  const projectBytes=(folder,file=projectFile(folder))=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const restored=state?.get(CHECKOUT_STATE,[]);
  const checkoutRoots=new Map((Array.isArray(restored)?restored:[]).filter(uri=>typeof uri==='string').map(uri=>[uri,true]));
  const reviewedRoots=new WeakMap(),setupBindings=new Map(),acceptedWorkingSessions=new WeakMap();
  const flushRefreshes=()=>{for(const [changed,pending] of workspace.pendingChanges)workspace.scheduleRefresh(changed,!pending.needsPrepare);};
  const configurationFor=(folder,{reviewedSetup=false}={})=>{
    const binding=setupBindings.get(folder.uri.toString());
    if(binding&&!binding.publishing)return binding.originalConfig;
    const currentFile=projectFile(folder);let project;
    try{project=currentFile?JSON.parse(fs.readFileSync(currentFile,'utf8')):{};if(!project||typeof project!=='object'||Array.isArray(project))throw Error('Project configuration must be an object.');}catch(cause){if(acceptedFiles.get(folder.uri.toString())?.defaults.workingMode==='existing')throw Error('Cannot read Jade project configuration '+currentFile+'. Fix the file and run Set Up Project to review Working again.',{cause});return {...explicitConfigFor(folder)};}
    const profile=project.connection?undefined:profilesFor(folder).current();
    const configured={...(profile?{connection:profile}:{}),...explicitConfigFor(folder)},selected=checkoutRoots.has(folder.uri.toString());
    const acceptedDirect=acceptedFiles.get(folder.uri.toString());
    const effectiveMode=project.workingMode==='source-backed'?'source-backed':configured.workingMode||project.workingMode;
    if(acceptedDirect?.defaults.workingMode==='existing'&&effectiveMode&&effectiveMode!=='existing')return {...configured,workingMode:effectiveMode};
    const targetKeys=['installPath','databasePath','iniPath','server','characterSet','schemaPath','workspaceRoots'];
    if(acceptedDirect?.defaults.storagePath!==undefined)targetKeys.push('storagePath');
    const targetChanged=acceptedDirect&&targetKeys.some(key=>configured[key]!==undefined&&configured[key]!==''&&!isDeepStrictEqual(configured[key],acceptedDirect.defaults[key]));
    if(!reviewedSetup&&acceptedDirect?.defaults.workingMode==='existing'&&(!configured.workingMode||configured.workingMode==='existing')&&(targetChanged||(configured.connection||project.connection)!==acceptedDirect.defaults.connection||!sameFile(acceptedDirect.file,currentFile)||acceptedDirect.fingerprint!==(currentFile?projectBytes(folder,currentFile):null)))throw Error('Project configuration changed after Working acceptance. Run Set Up Project to review its Working target again.');
    if((!configured.workingMode||configured.workingMode==='existing')&&acceptedDirect?.defaults.workingMode==='existing'&&(!(configured.connection||project.connection)||(configured.connection||project.connection)===acceptedDirect.defaults.connection)&&sameFile(acceptedDirect.file,currentFile)&&acceptedDirect.fingerprint===(currentFile?projectBytes(folder,currentFile):null)){
      const replay={...acceptedDirect.defaults,...configured};
      if(configured.storagePath===undefined||configured.storagePath==='')replay.storagePath=acceptedDirect.defaults.storagePath;
      return checkoutRoute(replay,project,acceptedDirect.defaults.workspaceRoots?.[0]||folder.uri.fsPath);
    }
    if(project.workingMode==='existing'&&(!configured.workingMode||configured.workingMode==='existing'))return checkoutRoute(configured,project,folder.uri.fsPath);
    if(projectFile(folder)){const accepted=acceptedFiles.get(folder.uri.toString());return accepted&&accepted.defaults.workingMode!=='existing'&&sameFile(accepted.file,projectFile(folder))&&accepted.fingerprint===projectBytes(folder)?{...accepted.defaults,...configured}:configured;}
    return selected&&(!configured.workingMode||configured.workingMode==='git-first')?checkoutConfiguration({...privateRuntime(folder).values(),...configured},path.join(folder.uri.fsPath,'sources')):configured;
  };
  // All subsequent native providers use the same machine-scoped checkout config.
  workspace.configFor=configurationFor;
  const projectFor=folder=>(setupBindings.get(folder.uri.toString())?.workspace||workspace).project(folder);
  const packageProbe=(folder,config=configurationFor(folder))=>new NativeSourceProvider({client,config:['git-first','existing'].includes(config.workingMode)?configDto(config):{sourceFormat:'jox'},projectRoot:folder.uri.fsPath});
  async function requireReviewedDiscovery(folder,record){
    const check=()=>{const file=projectFile(folder),actual=file?projectBytes(folder,file):null;if(record.fingerprint!==undefined&&(!sameFile(record.projectFile,file)||record.fingerprint!==actual))throw Error('Project configuration changed after review (file contents or absence). Run Set Up Project again.');};
    check();
    if(!record.discovery)return;
    const discovery=await discoveredFor(folder,record.discoveryConfig);
    if(discovery?.passed!==true||discovery.code!==0||!discovery.prepared?.config||JSON.stringify({file:discovery.prepared.configFile||null,config:discovery.prepared.config})!==record.discovery)
      throw Error('Project configuration changed after Working review. Run Set Up Project again.');
    check();
  }
  function requireSavedCheckout(folder){
    const project=workspace.projects.get(folder.uri.toString());
    if(project&&(vscode.workspace.textDocuments||[]).some(document=>document.isDirty&&document.uri.scheme==='jade-source'&&project.files.documents.has(document.uri.toString())))
      throw Error('Save or close modified Jade source editors before reviewing the saved checkout.');
  }
  async function requireReviewedCheckout(folder,record){
    requireSavedCheckout(folder);
    await requireReviewedDiscovery(folder,record);
    if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed before the reviewed Working operation. Run Set Up Project again.');
    requireSavedCheckout(folder);
    record.profileStage?.validate();
  }
  const initialization=registerWorkspaceInitialization(vscode,context,{
    nativeDiscovery:true,client,isBusy:()=>workspace.executing,configFor,detect,
    runtimeSettingsReady:folder=>{
      if(workspace.projects.has(folder.uri.toString()))workspace.project(folder,{allowColdConfiguration:true});
    },
    validateRuntime:async folder=>{
      if(workspace.disposed)throw Error('The native source workspace is closed.');
      if(workspace.projects.has(folder.uri.toString()))projectFor(folder);
      // Probe without attaching a native connection to an Explorer-only row.
      await packageProbe(folder).capability();
      if(workspace.disposed)throw Error('The native source workspace is closed.');
      if(workspace.projects.has(folder.uri.toString()))projectFor(folder);
    }
  });
  const initialize=async resource=>{
    const folder=vscode.workspace.getWorkspaceFolder(resource);
    if(!folder)throw Error('Choose an open Jade project.');
    if(workspace.projects.has(folder.uri.toString()))projectFor(folder);
    return initialization.initialize(resource,{notify:false});
  };
  async function targets(folder,{initialization:creating=false}={}) {
    const project=projectFor(folder),capability=await project.provider.capability();projectFor(folder);
    if(creating&&capability.initialization!==true)throw Error('Update the Jade CLI: creating Working and extracting JOX sources is unavailable.');
    const target=await project.provider.request('working.location',{
      cwd:project.provider.root,config:{...project.provider.config},initialization:creating
    });
    projectFor(folder);
    if(!target.working?.identity||!target.source?.databasePath||!target.source?.iniPath||
        creating&&typeof target.initialization?.destination!=='string')
      throw Error('Native setup did not return the reviewed Source and Working locations.');
    return {...target,destination:target.initialization?.destination,config:{installPath:target.working.installPath,
      databasePath:target.source.databasePath,iniPath:target.source.iniPath,server:target.source.server}};
  }
  async function directCheckoutTargets(folder,{configured,settingsBaseline,reviewedFile,reviewedFingerprint,sourceRoot,schemaPath,schemaFolder}) {
    const original=reviewedFile?JSON.parse(fs.readFileSync(reviewedFile,'utf8')):{};
    if(original.workingMode==='source-backed')return;
    const present=values=>Object.fromEntries(Object.entries(values).filter(([,value])=>value!==undefined&&value!==''));
    configured=present(configured);
    let discoveryOverrides={...configured};
    let runtime,discovery=await discoveredFor(folder,discoveryOverrides);
    if(discovery?.passed!==true&&reviewedFile&&/^Unknown Jade connection profile /i.test(discovery?.report?.error||'')){
      const override=explicitConfigFor(folder).connection;
      if(override&&override!==original.connection)throw Error(discovery.report.error+' The configured VS Code profile override is missing. Select an available connection or configure that profile before setup; the different project-file alias was not repaired.');
      const originalFailure=discovery.report.error,repaired=await initialize(folder.uri);
      if(repaired?.cancelled)throw Object.assign(Error('Project connection repair cancelled.'),{cancelled:true});
      if(repaired?.passed!==true||repaired.code!==0)throw Error(originalFailure+' Project connection repair did not complete.');
      discovery=await discoveredFor(folder,configured);
    }
    if(discovery?.passed===true&&discovery.code===0&&discovery.prepared?.config)
      configured=checkoutRoute({...discovery.prepared.config,...present(configured)},original,sourceRoot);
    if(!configured.installPath||!configured.databasePath){
      const reason=discovery?.report?.error||'';
      if(discovery?.passed!==true&&!/connection.*(?:required|not configured)|No Jade installation|installPath|databasePath/i.test(reason))throw Error(reason||'Native Working configuration discovery failed.');
      runtime=await detect(folder.uri,undefined,{existingWorking:true,deferSave:true});
      if(!runtime)throw Object.assign(Error('Working connection selection cancelled.'),{cancelled:true});
      discoveryOverrides={...discoveryOverrides,...present(runtime.settings||runtime)};
      discovery=await discoveredFor(folder,discoveryOverrides);
    }
    if(discovery?.passed!==true||discovery.code!==0||!discovery.prepared?.config)
      throw Error(discovery?.report?.error||'Native Working configuration discovery failed.');
    configured=checkoutRoute({...discovery.prepared.config,...discoveryOverrides},original,sourceRoot);
    configured.schemaPath=schemaPath;
    configured.workspaceRoots=[sourceRoot];
    if(!configured.installPath||!configured.databasePath)throw Error('Detect Runtime Settings and select the existing Working database before setup.');
    for(const value of [folder.uri.fsPath,configured.databasePath]){const extendedLocal=value.startsWith('\\\\?\\')&&/^[A-Za-z]:[\\/]/.test(value.slice(4));if(!extendedLocal&&(value.startsWith(path.win32.sep.repeat(2))||value.startsWith('//')))throw Error('Use locally available storage for the checkout and Working database. Network path: '+value);}
    let capability,target;
    try{
      const probe=packageProbe(folder,configured);capability=await probe.capability();
      target=await probe.request('working.location',{cwd:probe.root,config:configDto(configured),checkoutOnly:true});
    }catch(cause){if(/local.*storage|materialized|path.*unavailable|network/i.test(cause.message))throw Error('The checkout and Working database must be locally available. Checkout: '+folder.uri.fsPath+'; Working: '+configured.databasePath+'. Move network locations to a local drive or make cloud files available offline. '+cause.message,{cause});if(/workingMode must be|unsupported.*workingMode|checkout.*not available|Unknown.*working/i.test(cause.message))throw Error('This checkout requires a Jade CLI supporting direct existing Working setup. Update Jade Tools before continuing. No backup or extraction was started. '+cause.message,{cause});throw Error('Cannot review the configured Working checkout: '+cause.message+' No backup or extraction was started.',{cause});}
    if(target.checkoutConfigured!==true||target.workingMode!=='existing'||target.source||!target.working?.identity||
      !target.working.databasePath||!['new','existing'].includes(target.workingState)||!Array.isArray(target.sourceRoots)||target.sourceRoots.length!==1)
      throw Error('Update Jade Tools: native setup did not confirm the direct Working database and disk checkout. No backup or extraction was started.');
    if(capability.initialization!==true||capability.sync!==true||capability.reviewedWorkingSync!==true)
      throw Error('Update Jade Tools: direct Working initialization and reviewed sync are not available in this CLI package.');
    target.schemaFolder=schemaFolder;
    requireSavedCheckout(folder);
    const selectedProfile=pendingProfiles.get(folder.uri.toString());
    reviewedRoots.set(target,{sourceRoot,configured,runtime,profileStage:selectedProfile?profilesFor(folder).stage(selectedProfile.name,selectedProfile.previous):undefined,baseline:settingsBaseline,
      discoveryConfig:{...discoveryOverrides,...(configured.connection?{connection:configured.connection}:{})},discovery:JSON.stringify({file:discovery.prepared.configFile||null,config:discovery.prepared.config}),
      providerConfig:configured,runtimeDefaults:Object.fromEntries(Object.entries(configured).filter(([key])=>DIRECT_WORKING_DEFAULTS.includes(key))),explicitProject:!!reviewedFile,
      fingerprint:reviewedFile?reviewedFingerprint:null,projectFile:reviewedFile||null});
    return target;
  }
  async function checkoutTargets(folder,{repository,profileRepaired=false}={}) {
    pendingProfiles.delete(folder.uri.toString());
    const settingsBaseline=JSON.stringify(configDto(configFor(folder)));
    let configured=configurationFor(folder,{reviewedSetup:true}),sourceRoot,runtime,discoveredState;
    if(configured.workingMode&&!['git-first','existing'].includes(configured.workingMode))return;
    let detectedDefaults=checkoutRoots.has(folder.uri.toString())?privateRuntime(folder).values():{};
    const reviewedFile=projectFile(folder);
    let explicitProject=reviewedFile!==null;
    const reviewedFingerprint=explicitProject?projectBytes(folder,reviewedFile):undefined;
    let projectDeclaration;
    try{projectDeclaration=reviewedFile?JSON.parse(fs.readFileSync(reviewedFile,'utf8')):{};if(!projectDeclaration||typeof projectDeclaration!=='object'||Array.isArray(projectDeclaration))throw Error('Project configuration must be an object.');}catch(cause){throw Error('Cannot read Jade project configuration '+reviewedFile+': '+cause.message,{cause});}
    const declaredSource=Object.hasOwn(projectDeclaration,'schemaPath')||Object.hasOwn(projectDeclaration,'workspaceRoots');
    if(!repository&&declaredSource&&(!projectDeclaration.workingMode||projectDeclaration.workingMode==='existing'))throw Error('Initialize Git for this project with Initialise Workspace, then retry Set Up Project. No database was prepared.');
    let files=[];
    if(!declaredSource&&repository&&vscode.workspace.findFiles&&vscode.RelativePattern){
      const scanRoot=repository.rootUri?.fsPath||(reviewedFile?path.dirname(reviewedFile):folder.uri.fsPath);
      files=await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(scanRoot),'**/*.[jJ][oO][xX]'),'**/{.jade,.git,node_modules}/**',1);
    }
    if(explicitConfigFor(folder).workingMode!=='git-first'&&(declaredSource||files.length)&&(!projectDeclaration.workingMode||projectDeclaration.workingMode==='existing')){
      const original=projectDeclaration;
      const repositoryRoot=repository?.rootUri?.fsPath||folder.uri.fsPath,layoutRoot=original.workspaceRoots!==undefined&&reviewedFile?path.dirname(reviewedFile):repositoryRoot;
      const sourceRoot=await require('./checkout-route').selectCheckoutRoot(layoutRoot,original,vscode,{repositoryRoot});
      const schemaPath=original.schemaPath??path.relative(repositoryRoot,path.join(sourceRoot,'schemas')).split(path.sep).join('/');
      const schemaFolder=require('./schema-folder').resolveSchemaFolder(repositoryRoot,schemaPath);
      return directCheckoutTargets(folder,{configured:{...explicitConfigFor(folder)},settingsBaseline,reviewedFile,reviewedFingerprint,sourceRoot,schemaPath,schemaFolder});
    }
    if(explicitProject||files.length){
      let discovered=await discoveredFor(folder);
      if(discovered?.passed!==true&&/Unknown Jade connection profile/i.test(discovered?.report?.error||'')&&explicitProject&&!profileRepaired){
        const original=discovered;
        let repaired;
        try{repaired=await initialize(folder.uri);}catch(cause){throw Error(original.report.error+' Project connection repair failed: '+cause.message,{cause});}
        if(repaired?.cancelled)throw Object.assign(Error('Project connection repair cancelled.'),{cancelled:true});
        if(repaired?.passed!==true||repaired.code!==0)throw Error(original.report.error+' Repair the project connection and retry Set Up Project.');
        return checkoutTargets(folder,{repository,profileRepaired:true});
      }
      if(discovered?.passed!==true||discovered.code!==0||!discovered.prepared?.config){
        throw Error(discovered?.report?.error||'Native project configuration discovery failed.');
      }
      discoveredState=discovered.prepared;
      explicitProject=typeof discovered.prepared.configFile==='string'&&discovered.prepared.configFile!=='';
      if(explicitProject){
        if(discovered.prepared.config.workingMode!=='git-first')return;
        const accepted=acceptedFiles.get(folder.uri.toString());
        if(!reviewedFingerprint||!sameFile(reviewedFile,projectFile(folder))||reviewedFingerprint!==projectBytes(folder))throw Error('Project configuration file changed during preview. Run Set Up Project again.');
        detectedDefaults=accepted&&sameFile(accepted.file,reviewedFile)&&accepted.fingerprint===reviewedFingerprint?accepted.defaults:{};
        configured={...detectedDefaults,...discovered.prepared.config,...explicitConfigFor(folder)};
      }
    }
    if(!configured.workingMode&&!explicitProject){
      if(files.length){
        configured={...detectedDefaults,...configFor(folder)};
        if(!configured.installPath||!configured.workingSeedDirectory){
          const detected=await detect(folder.uri,undefined,{checkout:true,deferSave:true,privateRuntime:explicitProject?transientRuntime:privateRuntime(folder),resolved:{installPath:configured.installPath,workingSeedDirectory:configured.workingSeedDirectory}});
          if(!detected)throw Object.assign(Error('Git-first runtime selection cancelled.'),{cancelled:true});
          runtime=detected.settings?detected:undefined;
          configured={...configured,...(runtime?.settings||detected)};
        }
        if(!configured.installPath||!configured.workingSeedDirectory)throw Error('Choose a Jade installation and approved vendor seed in runtime settings before setting up this checkout.');
        sourceRoot=path.join(folder.uri.fsPath,'sources');
        configured=checkoutConfiguration(configured,sourceRoot);
      }
    }
    if(configured.workingMode==='git-first'&&(!configured.installPath||!configured.workingSeedDirectory)){
      const detected=await detect(folder.uri,undefined,{checkout:true,deferSave:true,privateRuntime:explicitProject?transientRuntime:privateRuntime(folder),resolved:{installPath:configured.installPath,workingSeedDirectory:configured.workingSeedDirectory}});
      if(!detected)throw Object.assign(Error('Git-first runtime selection cancelled.'),{cancelled:true});
      runtime=detected.settings?detected:undefined;
      configured=sourceRoot?checkoutConfiguration({...configured,...(runtime?.settings||detected)},sourceRoot):{...configured,...(runtime?.settings||detected)};
      if(!configured.installPath||!configured.workingSeedDirectory)throw Error('Choose a Jade installation and approved vendor seed in runtime settings before setting up this checkout.');
    }
    if(configured.workingMode==='git-first'&&(!discoveredState||runtime)){
      const discovery=await discoveredFor(folder);
      if(discovery?.passed!==true||discovery.code!==0||!discovery.prepared?.config)throw Error(discovery?.report?.error||'Native project configuration discovery failed.');
      if(discoveredState?JSON.stringify({file:discoveredState.configFile||null,config:discoveredState.config})!==JSON.stringify({file:discovery.prepared.configFile||null,config:discovery.prepared.config}):!!discovery.prepared.configFile)throw Error('Project configuration changed while choosing runtime settings. Run Set Up Project again.');
      discoveredState=discovery.prepared;
    }
    const probe=packageProbe(folder,configured);
    const capability=await probe.capability();
    if(!Object.hasOwn(capability,'checkoutInitialization')){
      if(sourceRoot||configured.workingMode==='git-first')throw Error('Update the Jade CLI: Git-first checkout setup is unavailable.');
      return;
    }
    const target=await probe.request('working.location',{
      cwd:probe.root,config:configDto(configured),checkoutOnly:true
    });
    if(target.checkoutConfigured===false){
      if(sourceRoot||configured.workingMode==='git-first')throw Error('The CLI refused this saved checkout. Update the Jade CLI before setting up Git-first Working.');
      return;
    }
    if(target.checkoutConfigured!==true||target.workingMode!=='git-first'||target.source||!target.working?.identity||
        !target.working.databasePath||!target.working.installPath||!['new','existing'].includes(target.workingState)||
        !Array.isArray(target.sourceRoots)||target.sourceRoots.length!==1)
      throw Error('Native setup did not return the reviewed Git-first Working location.');
    if(capability.checkoutInitialization!==true)throw Error('Git-first Working setup is not available in this CLI package.');
    if(target.workingState==='existing'&&(capability.sync!==true||capability.reviewedWorkingSync!==true))throw Error('Update the Jade CLI: reviewed Working target enforcement for sync is unavailable.');
    requireSavedCheckout(folder);
    const runtimeDefaults={...Object.fromEntries(Object.entries(detectedDefaults).filter(([key])=>!discoveredState?.config[key])),...(runtime?.settings||{})};
    const selectedProfile=pendingProfiles.get(folder.uri.toString());
    reviewedRoots.set(target,{sourceRoot,configured,runtime,profileStage:selectedProfile?profilesFor(folder).stage(selectedProfile.name,selectedProfile.previous):undefined,baseline:settingsBaseline,discovery:discoveredState?JSON.stringify({file:discoveredState.configFile||null,config:discoveredState.config}):undefined,
      providerConfig:explicitProject?{...runtimeDefaults,...explicitConfigFor(folder),...(configured.connection?{connection:configured.connection}:{})}:configured,runtimeDefaults,explicitProject,fingerprint:explicitProject?reviewedFingerprint:null,projectFile:explicitProject?reviewedFile:null});
    return target;
  }
  async function working(folder,title,operation,reviewedTarget) {
    const binding=setupBindings.get(folder.uri.toString()),project=projectFor(folder);
    if(workspace.executing&&!binding)throw Error('Another Jade Working operation is running.');
    if(!binding)workspace.executing=true;
    try {
      await workspace.changing.get(binding?.previous||project)?.promise;
      if(binding){await binding.workspace.changing.get(project)?.promise;await requireReviewedCheckout(folder,binding.record);projectFor(folder);}
      if(workspace.beforeSetup)await workspace.beforeSetup(binding?.retainedWorking);else await workspace.beforeOperation?.();projectFor(folder);
      return await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title,cancellable:true},
        async(progress,token)=>{
          if(token?.isCancellationRequested)throw Object.assign(Error('Working setup cancelled.'),{cancelled:true});
          projectFor(folder);output.show(true);progress.report({message:title});
          const {WorkingSetupProgress}=require('./WorkingSetupProgress');
          const target=reviewedTarget;
          return new WorkingSetupProgress({output,operation:title,target,progress}).run(write=>operation(project,token,write),token);
        });
    } finally {
      if(!binding){workspace.executing=false;flushRefreshes();}
    }
  }
  const onboarding=registerWorkspaceOnboarding(vscode,context,{
    jox:true,initialize,targets,checkoutTargets,
    activateCheckout:async(folder,reviewed)=>{
      const key=folder.uri.toString();
      if(workspace.executing)throw Error('Another Jade Working operation is running. Wait for it to finish before setup.');
      workspace.executing=true;
      try{
      await workspace.changing?.get(workspace.projects.get(key))?.promise;
      const record=reviewedRoots.get(reviewed);if(!record)return;
      if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed after Working review. Run Set Up Project again.');
      await requireReviewedDiscovery(folder,record);
      if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed during native preflight. Run Set Up Project again.');
      const previous=workspace.projects.get(key);
      const same=previous&&isDeepStrictEqual(previous.provider.config,workspace.projectConfiguration(folder,record.providerConfig));
      const accepted=previous&&acceptedWorkingSessions.get(previous);
      const retainedWorking=same&&reviewed.workingMode==='existing'&&accepted&&accepted.identity===reviewed.working.identity&&
        previous.ownedClient?.client===accepted.connection&&previous.provider.connection===accepted.connection&&
        !accepted.connection.closed?{project:previous,owner:previous.ownedClient,connection:accepted.connection}:undefined;
      await workspace.beforeSetup?.(retainedWorking);
      if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed during native cleanup. Run Set Up Project again.');
      if(previous&&!workspace.canReconfigure(previous,{allowExecuting:true,allowStoredProjections:true})&&!same)throw Error('Jade project settings changed. Close its source editors and reload the window before continuing.');
      if(!workspace.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
      let stageClient,owner;
      try{
        stageClient=client.fork();owner=new NativeSourceWorkspace({vscode,client:stageClient,configFor:()=>record.providerConfig,watchSources:false});
        owner.beforeOperation=()=>workspace.beforeOperation?.();
        const project=owner.project(folder);setupBindings.set(key,{workspace:owner,client:stageClient,project,previous,retainedWorking,originalConfig:configurationFor(folder,{reviewedSetup:true}),record});workspace.executing=true;
      }catch(error){
        const failures=[];for(const cleanup of [()=>owner?.dispose(),()=>stageClient?.dispose()]){try{await cleanup();}catch(failure){failures.push(failure.message);}}
        if(failures.length)error.message+=' Temporary setup cleanup failed: '+failures.join('; ');
        throw error;
      }
      }finally{if(!setupBindings.has(key)){workspace.executing=false;flushRefreshes();}}
    },
    commitCheckout:async(folder,reviewed)=>{
      const key=folder.uri.toString(),binding=setupBindings.get(key),record=binding?.record||reviewedRoots.get(reviewed);
      if(!record)return;
      if(!binding){
        await requireReviewedDiscovery(folder,record);
        if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed during Working setup. Run Set Up Project again.');
        return;
      }
      const previous=[...checkoutRoots.keys()],previousFiles=new Map(acceptedFiles);
      if(!workspace.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
      if(JSON.stringify(configDto(configFor(folder)))!==binding.record.baseline)throw Error('Runtime settings changed during setup; no settings were saved.');
      await requireReviewedDiscovery(folder,binding.record);
      if(JSON.stringify(configDto(configFor(folder)))!==binding.record.baseline)throw Error('Runtime settings changed during acceptance; restart setup.');
      await binding.record.runtime?.commit();
      await binding.record.profileStage?.commit();
      const acceptedSettings=JSON.stringify(configDto(configFor(folder)));
      try{
        await state?.update(CHECKOUT_STATE,binding.record.configured?.workingMode==='existing'?previous.filter(value=>value!==key):binding.record.sourceRoot?[...new Set([...previous,key])]:previous);
        await requireReviewedDiscovery(folder,binding.record);
        if(binding.record.explicitProject||binding.record.configured?.workingMode==='existing'){acceptedFiles.set(key,{file:binding.record.projectFile,fingerprint:binding.record.fingerprint,defaults:binding.record.runtimeDefaults});await state?.update(CHECKOUT_FILES,Object.fromEntries(acceptedFiles));}
        await requireReviewedDiscovery(folder,binding.record);
        if(JSON.stringify(configDto(configFor(folder)))!==acceptedSettings)throw Error('Runtime settings changed during private acceptance; restart setup.');
        if(!workspace.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
        binding.publishing=true;
        if(binding.record.configured?.workingMode==='existing')checkoutRoots.delete(key);else if(binding.record.sourceRoot)checkoutRoots.set(key,true);
        if(workspace.projects.get(key)!==binding.previous)throw Error('The shared source project changed during setup.');
        if(binding.previous&&!workspace.canReconfigure(binding.previous,{allowExecuting:true,allowStoredProjections:true})){
          if(!isDeepStrictEqual(binding.previous.provider.config,workspace.projectConfiguration(folder)))throw Error('The shared source configuration changed during setup.');
          binding.retained=true;
        }else{const adopted=workspace.adoptProject(folder,binding.workspace,binding.previous);adopted.ownedClient=binding.client;}
        if(binding.retained){await binding.project.provider.closeProject();await binding.client.dispose();await requireReviewedDiscovery(folder,binding.record);if(JSON.stringify(configDto(configFor(folder)))!==acceptedSettings)throw Error('Runtime settings changed during setup cleanup; restart setup.');}
        if(!workspace.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
      }catch(error){
        binding.publishing=false;
        acceptedFiles.clear();for(const [folderKey,entry]of previousFiles)acceptedFiles.set(folderKey,entry);
        if(previous.includes(key))checkoutRoots.set(key,true);else checkoutRoots.delete(key);
        const failures=[];
        for(const [stateKey,value]of [[CHECKOUT_STATE,previous],...(binding.record.explicitProject||binding.record.configured?.workingMode==='existing'?[[CHECKOUT_FILES,Object.fromEntries(previousFiles)]]:[])]){try{await state?.update(stateKey,value);}catch(cleanup){failures.push(cleanup.message);}}
        if(failures.length)error.message+=' Private selection rollback failed: '+failures.join('; ');
        throw error;
      }
      const project=workspace.project(folder);
      if(binding.project.provider.semanticPreparationRequired===true)workspace.invalidateSources(project);
      if(reviewed.workingMode==='existing'&&project.ownedClient?.client&&!project.ownedClient.client.closed)
        acceptedWorkingSessions.set(project,{identity:reviewed.working.identity,connection:project.ownedClient.client});
      binding.workspace.dispose();setupBindings.delete(key);pendingProfiles.delete(key);workspace.executing=false;flushRefreshes();
      return {prepared:!binding.retained,semanticPreparationRequired:binding.project.provider.semanticPreparationRequired===true};
    },
    abortCheckout:async folder=>{
      const key=folder.uri.toString(),binding=setupBindings.get(key);pendingProfiles.delete(key);if(!binding)return;
      const failures=[];
      for(const cleanup of [()=>binding.project.provider.closeProject(),()=>binding.record.runtime?.rollback(),()=>binding.record.profileStage?.rollback(),()=>binding.workspace.dispose(),()=>binding.client.dispose()]){try{await cleanup();}catch(error){failures.push(error);}}
      setupBindings.delete(key);workspace.executing=false;
      try{flushRefreshes();}catch(error){failures.push(error);}
      if(failures.length)throw new AggregateError(failures,'Setup cleanup failed: '+failures.map(error=>error.message).join('; '));
    },
    initializeCheckout:(folder,reviewed)=>working(folder,reviewed.workingMode==='existing'?'Reconciling saved checkout with existing Working':'Creating Working from saved JOX',async(project,token,write)=>{
      await requireReviewedCheckout(folder,reviewedRoots.get(reviewed));
      return project.provider.initializeCheckout({expectedWorkingIdentity:reviewed.working.identity,...(reviewed.workingMode==='existing'?{overwriteWorkingChanges:true}:{})},token,write);
    },reviewed.working.databasePath),
    syncCheckout:(folder,reviewed)=>vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Syncing saved checkout to Working',cancellable:true},
      async(progress,token)=>{
        output.show(true);const binding=setupBindings.get(folder.uri.toString()),record=reviewedRoots.get(reviewed);
        const revalidate=()=>requireReviewedCheckout(folder,record);
        await revalidate();
        return (binding?.workspace||workspace).sync(projectFor(folder),{token,expectedWorkingIdentity:reviewed.working.identity,beforeRequest:revalidate,output:text=>output.append(text)});
      }),
    initializeWorkingSources:(folder,reviewed)=>working(folder,'Creating Working and extracting sources',async(project,token,write)=>
      project.provider.initialize({destination:reviewed.destination,expectedWorkingIdentity:reviewed.working.identity},token,write)),
    refreshProject:async(folder,{prepared})=>{
      const project=projectFor(folder);
      await workspace.refresh(folder,undefined,{prepared});
      projectFor(folder);workspace.observeSources(project);
    },
    openExplorer:()=>vscode.commands.executeCommand('jadeNative.classes.focus'),
    connectWorking:(folder,reviewed)=>working(folder,'Preparing the private Working copy',async(project,token,write)=>{
      await project.provider.capability();projectFor(folder);
      const binding=setupBindings.get(folder.uri.toString());if(binding)await requireReviewedCheckout(folder,binding.record);
      await project.provider.request('working.prepare',{cwd:project.provider.root,config:{...project.provider.config},expectedWorkingIdentity:reviewed.working.identity},token,write);
      return{selection:'working',readOnly:true};
    })
  });
  return{initialization,onboarding,configFor:configurationFor};
}
module.exports={registerJoxProjectSetup};
