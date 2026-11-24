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
const { checkoutConfiguration }=require('./jox-checkout-config');
/** Presents native setup for a saved checkout or Source-backed extraction. */
function registerJoxProjectSetup(vscode,context,workspace,{client,configFor,detect}) {
  const output=vscode.window.createOutputChannel('Jade Working Setup');context.subscriptions.push(output);
  const state=context.workspaceState;
  const explicitConfigFor=configFor;
  const privateRuntime=folder=>new PrivateRuntimeSettings(state,folder.uri.toString());
  const savedFiles=state?.get(CHECKOUT_FILES,{});
  const acceptedFiles=new Map(Object.entries(savedFiles&&typeof savedFiles==='object'&&!Array.isArray(savedFiles)?savedFiles:{}).filter(([,entry])=>entry&&/^[a-f0-9]{64}$/.test(entry.fingerprint)&&entry.defaults&&Object.entries(entry.defaults).every(([key,value])=>['installPath','workingSeedDirectory'].includes(key)&&typeof value==='string')));
  const projectBytes=folder=>require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(folder.uri.fsPath,'jade.json'))).digest('hex');
  const restored=state?.get(CHECKOUT_STATE,[]);
  const checkoutRoots=new Map((Array.isArray(restored)?restored:[]).filter(uri=>typeof uri==='string').map(uri=>[uri,true]));
  const reviewedRoots=new WeakMap(),setupBindings=new Map();
  const flushRefreshes=()=>{for(const [changed,pending] of workspace.pendingChanges)workspace.scheduleRefresh(changed,!pending.needsPrepare);};
  const configurationFor=folder=>{
    const binding=setupBindings.get(folder.uri.toString());
    if(binding&&!binding.publishing)return binding.originalConfig;
    const configured=explicitConfigFor(folder),selected=checkoutRoots.has(folder.uri.toString());
    if(fs.existsSync(path.join(folder.uri.fsPath,'jade.json'))){const accepted=acceptedFiles.get(folder.uri.toString());return accepted&&accepted.fingerprint===projectBytes(folder)?{...accepted.defaults,...configured}:configured;}
    return selected&&(!configured.workingMode||configured.workingMode==='git-first')?checkoutConfiguration({...privateRuntime(folder).values(),...configured},path.join(folder.uri.fsPath,'sources')):configured;
  };
  // All subsequent native providers use the same machine-scoped checkout config.
  workspace.configFor=configurationFor;
  const projectFor=folder=>(setupBindings.get(folder.uri.toString())?.workspace||workspace).project(folder);
  const packageProbe=(folder,config=configurationFor(folder))=>new NativeSourceProvider({client,config:config.workingMode==='git-first'?configDto(config):{sourceFormat:'jox'},projectRoot:folder.uri.fsPath});
  async function requireReviewedDiscovery(folder,record){
    if(!record.discovery)return;
    const discovery=await client.request('prepare',{operation:'inspect.target',cwd:folder.uri.fsPath,argv:[]}).promise;
    if(discovery?.passed!==true||discovery.code!==0||!discovery.prepared?.config||JSON.stringify({file:discovery.prepared.configFile||null,config:discovery.prepared.config})!==record.discovery)
      throw Error('Project configuration changed after Working review. Run Set Up Project again.');
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
  async function checkoutTargets(folder,{repository}={}) {
    const settingsBaseline=JSON.stringify(configDto(configFor(folder)));
    let configured=configurationFor(folder),sourceRoot,runtime,discoveredState;
    if(configured.workingMode&&configured.workingMode!=='git-first')return;
    let detectedDefaults=privateRuntime(folder).values();
    let explicitProject=fs.existsSync(path.join(folder.uri.fsPath,'jade.json'));
    let files=[];
    if(!configured.workingMode&&repository&&vscode.workspace.findFiles&&vscode.RelativePattern){
      files=await vscode.workspace.findFiles(new vscode.RelativePattern(folder.uri,'sources/**/*.[jJ][oO][xX]'),'**/{.jade,.git,node_modules}/**',1);
    }
    if(explicitProject||files.length){
      const discovered=await client.request('prepare',{operation:'inspect.target',cwd:folder.uri.fsPath,argv:[]}).promise;
      if(discovered?.passed!==true||discovered.code!==0||!discovered.prepared?.config){
        if(/Unknown Jade connection profile/i.test(discovered?.report?.error||''))return;
        throw Error(discovered?.report?.error||'Native project configuration discovery failed.');
      }
      discoveredState=discovered.prepared;
      explicitProject=typeof discovered.prepared.configFile==='string'&&discovered.prepared.configFile!=='';
      if(explicitProject){
        if(discovered.prepared.config.workingMode!=='git-first')return;
        const accepted=acceptedFiles.get(folder.uri.toString());
        if(accepted)detectedDefaults=accepted.fingerprint===projectBytes(folder)?accepted.defaults:{};
        configured={...detectedDefaults,...discovered.prepared.config,...explicitConfigFor(folder)};
      }
    }
    if(!configured.workingMode&&!explicitProject){
      if(files.length){
        configured={...privateRuntime(folder).values(),...configFor(folder)};
        if(!configured.installPath||!configured.workingSeedDirectory){
          const detected=await detect(folder.uri,undefined,{checkout:true,deferSave:true,privateRuntime:privateRuntime(folder),resolved:{installPath:configured.installPath,workingSeedDirectory:configured.workingSeedDirectory}});
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
      const detected=await detect(folder.uri,undefined,{checkout:true,deferSave:true,privateRuntime:privateRuntime(folder),resolved:{installPath:configured.installPath,workingSeedDirectory:configured.workingSeedDirectory}});
      if(!detected)throw Object.assign(Error('Git-first runtime selection cancelled.'),{cancelled:true});
      runtime=detected.settings?detected:undefined;
      configured=sourceRoot?checkoutConfiguration({...configured,...(runtime?.settings||detected)},sourceRoot):{...configured,...(runtime?.settings||detected)};
      if(!configured.installPath||!configured.workingSeedDirectory)throw Error('Choose a Jade installation and approved vendor seed in runtime settings before setting up this checkout.');
    }
    if(configured.workingMode==='git-first'&&(!discoveredState||runtime)){
      const discovery=await client.request('prepare',{operation:'inspect.target',cwd:folder.uri.fsPath,argv:[]}).promise;
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
    if(target.workingState==='existing'&&capability.reviewedWorkingSync!==true)throw Error('Update the Jade CLI: reviewed Working target enforcement for sync is unavailable.');
    requireSavedCheckout(folder);
    const runtimeDefaults={...Object.fromEntries(Object.entries(detectedDefaults).filter(([key])=>!discoveredState?.config[key])),...(runtime?.settings||{})};
    reviewedRoots.set(target,{sourceRoot,configured,runtime,baseline:settingsBaseline,discovery:discoveredState?JSON.stringify({file:discoveredState.configFile||null,config:discoveredState.config}):undefined,
      providerConfig:explicitProject?{...runtimeDefaults,...explicitConfigFor(folder)}:configured,runtimeDefaults,explicitProject});
    return target;
  }
  async function working(folder,title,operation) {
    const binding=setupBindings.get(folder.uri.toString()),project=projectFor(folder);
    if(workspace.executing&&!binding)throw Error('Another Jade Working operation is running.');
    if(!binding)workspace.executing=true;
    try {
      await workspace.changing.get(project)?.promise;
      await workspace.beforeOperation?.();projectFor(folder);
      return await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title,cancellable:true},
        async(progress,token)=>{
          if(token?.isCancellationRequested)throw Object.assign(Error('Working setup cancelled.'),{cancelled:true});
          projectFor(folder);output.show(true);progress.report({message:title});
          return operation(project,token,text=>output.append(text));
        });
    } finally {
      if(!binding){workspace.executing=false;flushRefreshes();}
    }
  }
  const onboarding=registerWorkspaceOnboarding(vscode,context,{
    jox:true,initialize,targets,checkoutTargets,
    activateCheckout:async(folder,reviewed)=>{
      const record=reviewedRoots.get(reviewed);if(!record)return;
      if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed after Working review. Run Set Up Project again.');
      await requireReviewedDiscovery(folder,record);
      if(JSON.stringify(configDto(configFor(folder)))!==record.baseline)throw Error('Project settings changed during native preflight. Run Set Up Project again.');
      const key=folder.uri.toString(),previous=workspace.projects.get(key);
      const same=previous&&isDeepStrictEqual(previous.provider.config,workspace.projectConfiguration(folder,record.providerConfig));
      if(workspace.executing||previous&&!workspace.canReconfigure(previous)&&!same)throw Error('Jade project settings changed. Close its source editors and reload the window before continuing.');
      const stageClient=client.fork();
      const owner=new NativeSourceWorkspace({vscode,client:stageClient,configFor:()=>record.providerConfig,watchSources:false});
      const project=owner.project(folder);setupBindings.set(key,{workspace:owner,client:stageClient,project,previous,originalConfig:configurationFor(folder),record});workspace.executing=true;
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
      const acceptedSettings=JSON.stringify(configDto(configFor(folder)));
      try{
        await state?.update(CHECKOUT_STATE,binding.record.sourceRoot?[...new Set([...previous,key])]:previous);
        await requireReviewedDiscovery(folder,binding.record);
        if(binding.record.explicitProject){acceptedFiles.set(key,{fingerprint:projectBytes(folder),defaults:binding.record.runtimeDefaults});await state?.update(CHECKOUT_FILES,Object.fromEntries(acceptedFiles));}
        await requireReviewedDiscovery(folder,binding.record);
        if(JSON.stringify(configDto(configFor(folder)))!==acceptedSettings)throw Error('Runtime settings changed during private acceptance; restart setup.');
        if(!workspace.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
        binding.publishing=true;
        if(binding.record.sourceRoot)checkoutRoots.set(key,true);
        if(workspace.projects.get(key)!==binding.previous)throw Error('The shared source project changed during setup.');
        if(binding.previous&&!workspace.canReconfigure(binding.previous,{allowExecuting:true})){
          if(!isDeepStrictEqual(binding.previous.provider.config,workspace.projectConfiguration(folder)))throw Error('The shared source configuration changed during setup.');
          binding.retained=true;
        }else workspace.adoptProject(folder,binding.workspace,binding.previous);
        if(binding.retained){await binding.project.provider.closeProject();await binding.client.dispose();await requireReviewedDiscovery(folder,binding.record);if(JSON.stringify(configDto(configFor(folder)))!==acceptedSettings)throw Error('Runtime settings changed during setup cleanup; restart setup.');}
        if(!workspace.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
      }catch(error){
        binding.publishing=false;
        acceptedFiles.clear();for(const [folderKey,entry]of previousFiles)acceptedFiles.set(folderKey,entry);
        if(!previous.includes(key))checkoutRoots.delete(key);
        const failures=[];
        for(const [stateKey,value]of [[CHECKOUT_STATE,previous],...(binding.record.explicitProject?[[CHECKOUT_FILES,Object.fromEntries(previousFiles)]]:[])]){try{await state?.update(stateKey,value);}catch(cleanup){failures.push(cleanup.message);}}
        if(failures.length)error.message+=' Private selection rollback failed: '+failures.join('; ');
        throw error;
      }
      binding.workspace.dispose();setupBindings.delete(key);workspace.executing=false;flushRefreshes();
      return {prepared:!binding.retained};
    },
    abortCheckout:async folder=>{
      const key=folder.uri.toString(),binding=setupBindings.get(key);if(!binding)return;
      try{await binding.project.provider.closeProject();}finally{
        try{await binding.record.runtime?.rollback();}finally{try{binding.workspace.dispose();await binding.client.dispose();}finally{setupBindings.delete(key);workspace.executing=false;flushRefreshes();}}
      }
    },
    initializeCheckout:(folder,reviewed)=>working(folder,'Creating Working from saved JOX',async(project,token,write)=>{
      await requireReviewedCheckout(folder,reviewedRoots.get(reviewed));
      return project.provider.initializeCheckout({expectedWorkingIdentity:reviewed.working.identity},token,write);
    }),
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
      await project.provider.request('working.prepare',{cwd:project.provider.root,config:{...project.provider.config},expectedWorkingIdentity:reviewed.working.identity},token,write);
      return{selection:'working',readOnly:true};
    })
  });
  return{initialization,onboarding,configFor:configurationFor};
}
module.exports={registerJoxProjectSetup};
