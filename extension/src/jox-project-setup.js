"use strict";
const { registerWorkspaceInitialization }=require('./workspace-initialization');
const { registerWorkspaceOnboarding }=require('./workspace-onboarding');
const { NativeSourceProvider }=require('./NativeSourceProvider');
const { configDto }=require('./cli-client');
const path=require('node:path');
const { checkoutConfiguration }=require('./jox-checkout-config');
/** Presents native setup for a saved checkout or Source-backed extraction. */
function registerJoxProjectSetup(vscode,context,workspace,{client,configFor,detect}) {
  const output=vscode.window.createOutputChannel('Jade Working Setup');context.subscriptions.push(output);
  const checkoutRoots=new Map();
  const configurationFor=folder=>{
    const configured=configFor(folder),root=checkoutRoots.get(folder.uri.toString());
    return root?checkoutConfiguration(configured,root):configured;
  };
  // All subsequent native providers use the same machine-scoped checkout config.
  workspace.configFor=configurationFor;
  const projectFor=folder=>workspace.project(folder);
  const packageProbe=folder=>new NativeSourceProvider({client,config:checkoutRoots.has(folder.uri.toString())?configDto(configurationFor(folder)):{sourceFormat:'jox'},projectRoot:folder.uri.fsPath});
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
    if(vscode.workspace.findFiles&&vscode.RelativePattern){
      const files=await vscode.workspace.findFiles(new vscode.RelativePattern(folder.uri,'sources/**/*.[jJ][oO][xX]'),'**/{.jade,.git,node_modules}/**',1);
      if(files.length){
        let configured=configFor(folder);
        if(!configured.installPath||!(configured.workingSeedDirectory||configured.databasePath)){
          const detected=await detect(folder.uri,undefined,{checkout:true});
          if(!detected)throw Object.assign(Error('Git-first runtime selection cancelled.'),{cancelled:true});
          configured=configFor(folder);
        }
        if(!configured.installPath||!(configured.workingSeedDirectory||configured.databasePath))throw Error('Choose a Jade installation and approved vendor seed in runtime settings before setting up this checkout.');
        checkoutRoots.set(folder.uri.toString(),path.join(folder.uri.fsPath,'sources'));
        workspace.project(folder,{allowColdConfiguration:true});
      }
    }
    const probe=packageProbe(folder);
    const capability=await probe.capability();
    if(!Object.hasOwn(capability,'checkoutInitialization')){
      if(checkoutRoots.has(folder.uri.toString()))throw Error('Update the Jade CLI: Git-first checkout setup is unavailable.');
      return;
    }
    const target=await probe.request('working.location',{
      cwd:probe.root,config:configDto(configurationFor(folder)),checkoutOnly:true
    });
    if(target.checkoutConfigured===false){
      if(checkoutRoots.has(folder.uri.toString()))throw Error('The CLI refused this saved checkout. Update the Jade CLI before setting up Git-first Working.');
      return;
    }
    if(target.checkoutConfigured!==true||target.workingMode!=='git-first'||target.source||!target.working?.identity||
        !target.working.databasePath||!target.working.installPath||!['new','existing'].includes(target.workingState)||
        !Array.isArray(target.sourceRoots)||target.sourceRoots.length!==1)
      throw Error('Native setup did not return the reviewed Git-first Working location.');
    if(capability.checkoutInitialization!==true)throw Error('Git-first Working setup is not available in this CLI package.');
    projectFor(folder);
    return target;
  }
  async function working(folder,title,operation) {
    const project=projectFor(folder);
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
  }
  const onboarding=registerWorkspaceOnboarding(vscode,context,{
    jox:true,initialize,targets,checkoutTargets,
    initializeCheckout:(folder,reviewed)=>working(folder,'Creating Working from saved JOX',async(project,token,write)=>
      project.provider.initializeCheckout({expectedWorkingIdentity:reviewed.working.identity},token,write)),
    syncCheckout:folder=>vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Syncing saved checkout to Working',cancellable:true},
      async(progress,token)=>{output.show(true);return workspace.sync(projectFor(folder),{token,output:text=>output.append(text)});}),
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
