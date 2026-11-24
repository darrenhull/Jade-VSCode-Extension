"use strict";
const { registerWorkspaceInitialization }=require('./workspace-initialization');
const { registerWorkspaceOnboarding }=require('./workspace-onboarding');
const { NativeSourceProvider }=require('./NativeSourceProvider');
const { configDto }=require('./cli-client');
const path=require('node:path');
const fs=require('node:fs');
const {AsyncLocalStorage}=require('node:async_hooks');
const CHECKOUT_STATE='jadeNative.acceptedGitFirstCheckouts';
const { checkoutConfiguration }=require('./jox-checkout-config');
/** Presents native setup for a saved checkout or Source-backed extraction. */
function registerJoxProjectSetup(vscode,context,workspace,{client,configFor,detect}) {
  const output=vscode.window.createOutputChannel('Jade Working Setup');context.subscriptions.push(output);
  const state=context.workspaceState;
  const restored=state?.get(CHECKOUT_STATE,[]);
  const checkoutRoots=new Map((Array.isArray(restored)?restored:[]).filter(uri=>typeof uri==='string').map(uri=>[uri,true]));
  const pendingRoots=new Map(),reviewedRoots=new WeakMap(),setupScope=new AsyncLocalStorage();
  const configurationFor=folder=>{
    const configured=configFor(folder),selected=checkoutRoots.has(folder.uri.toString());
    return selected&&!fs.existsSync(path.join(folder.uri.fsPath,'jade.json'))&&(!configured.workingMode||configured.workingMode==='git-first')?checkoutConfiguration(configured,path.join(folder.uri.fsPath,'sources')):configured;
  };
  // All subsequent native providers use the same machine-scoped checkout config.
  workspace.configFor=folder=>setupScope.getStore()===folder.uri.toString()&&pendingRoots.has(folder.uri.toString())?checkoutConfiguration(configFor(folder),pendingRoots.get(folder.uri.toString())):configurationFor(folder);
  const projectFor=folder=>workspace.project(folder);
  const packageProbe=(folder,config=configurationFor(folder))=>new NativeSourceProvider({client,config:config.workingMode==='git-first'?configDto(config):{sourceFormat:'jox'},projectRoot:folder.uri.fsPath});
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
  async function checkoutTargets(folder) {
    let configured=configurationFor(folder),sourceRoot;
    if(configured.workingMode&&configured.workingMode!=='git-first')return;
    let explicitProject=fs.existsSync(path.join(folder.uri.fsPath,'jade.json'));
    let files=[];
    if(!configured.workingMode&&vscode.workspace.findFiles&&vscode.RelativePattern){
      files=await vscode.workspace.findFiles(new vscode.RelativePattern(folder.uri,'sources/**/*.[jJ][oO][xX]'),'**/{.jade,.git,node_modules}/**',1);
    }
    if(explicitProject||files.length){
      const discovered=await client.request('prepare',{operation:'inspect.target',cwd:folder.uri.fsPath,argv:[]}).promise;
      if(discovered?.passed!==true||discovered.code!==0||!discovered.prepared?.config)throw Error(discovered?.report?.error||'Native project configuration discovery failed.');
      explicitProject=typeof discovered.prepared.configFile==='string'&&discovered.prepared.configFile!=='';
      if(explicitProject){
        if(discovered.prepared.config.workingMode!=='git-first')return;
        configured={...discovered.prepared.config,...configFor(folder)};
      }
    }
    if(!configured.workingMode&&!explicitProject){
      if(files.length){
        configured=configFor(folder);
        if(!configured.installPath||!configured.workingSeedDirectory){
          const detected=await detect(folder.uri,undefined,{checkout:true});
          if(!detected)throw Object.assign(Error('Git-first runtime selection cancelled.'),{cancelled:true});
          configured=configFor(folder);
        }
        if(!configured.installPath||!configured.workingSeedDirectory)throw Error('Choose a Jade installation and approved vendor seed in runtime settings before setting up this checkout.');
        sourceRoot=path.join(folder.uri.fsPath,'sources');
        configured=checkoutConfiguration(configured,sourceRoot);
      }
    }
    if(configured.workingMode==='git-first'&&(!configured.installPath||!configured.workingSeedDirectory)){
      const detected=await detect(folder.uri,undefined,{checkout:true});
      if(!detected)throw Object.assign(Error('Git-first runtime selection cancelled.'),{cancelled:true});
      configured=sourceRoot?checkoutConfiguration(configFor(folder),sourceRoot):{...configured,...configurationFor(folder)};
      if(!configured.installPath||!configured.workingSeedDirectory)throw Error('Choose a Jade installation and approved vendor seed in runtime settings before setting up this checkout.');
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
    if(sourceRoot)reviewedRoots.set(target,sourceRoot);
    return target;
  }
  async function working(folder,title,operation) {
    return setupScope.run(folder.uri.toString(),async()=>{
    const project=workspace.project(folder,{allowColdConfiguration:pendingRoots.has(folder.uri.toString())});
    if(workspace.executing)throw Error('Another Jade Working operation is running.');
    workspace.executing=true;
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
      workspace.executing=false;
      for(const [changed,pending] of workspace.pendingChanges)workspace.scheduleRefresh(changed,!pending.needsPrepare);
    }
    });
  }
  const onboarding=registerWorkspaceOnboarding(vscode,context,{
    jox:true,initialize,targets,checkoutTargets,
    activateCheckout:(folder,reviewed)=>{
      if(!reviewedRoots.has(reviewed))return;
      const key=folder.uri.toString();pendingRoots.set(key,reviewedRoots.get(reviewed));
    },
    commitCheckout:async folder=>{
      const key=folder.uri.toString();if(!pendingRoots.has(key))return;
      await state?.update(CHECKOUT_STATE,[...new Set([...checkoutRoots.keys(),key])]);
      checkoutRoots.set(key,true);pendingRoots.delete(key);
    },
    abortCheckout:async folder=>{
      const key=folder.uri.toString();if(!pendingRoots.has(key))return;
      const project=workspace.projects.get(key);
      try{if(project)await project.provider.closeProject();}finally{
        pendingRoots.delete(key);
        if(project){for(const listener of workspace.forwarding.get(project)||[])listener.dispose();workspace.forwarding.delete(project);project.files.dispose();workspace.projects.delete(key);}
      }
    },
    initializeCheckout:(folder,reviewed)=>working(folder,'Creating Working from saved JOX',async(project,token,write)=>
      project.provider.initializeCheckout({expectedWorkingIdentity:reviewed.working.identity},token,write)),
    syncCheckout:folder=>setupScope.run(folder.uri.toString(),()=>vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Syncing saved checkout to Working',cancellable:true},
      async(progress,token)=>{output.show(true);return workspace.sync(projectFor(folder),{token,output:text=>output.append(text)});})),
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
