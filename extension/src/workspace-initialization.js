'use strict';
const fs=require('node:fs'),path=require('node:path');
const {WorkspaceConnectionProfile}=require('./WorkspaceConnectionProfile');

// Native CLI owns Git/ignore and project/profile setup; this command presents progress.
function registerWorkspaceInitialization(vscode,context,services){
 const output=vscode.window.createOutputChannel('Jade Setup'),pending=new Map();
 async function initialize(resource,{notify=true}={}){
  let folder=resource&&vscode.workspace.getWorkspaceFolder(resource);
  if(resource&&!folder)throw Error('The selected project is not open in this workspace.');
  const folders=vscode.workspace.workspaceFolders||[];
  folder||=(folders.length===1?folders[0]:undefined);
  if(!folder&&folders.length)folder=(await vscode.window.showQuickPick(folders.map(folder=>({label:folder.name,description:folder.uri.fsPath,folder})),{title:'Choose Jade workspace to initialise'}))?.folder;
  if(!folder){if(!folders.length)void vscode.window.showInformationMessage('Create or open a source folder, then run Jade: Initialise Workspace.');return{cancelled:true};}
  const key=folder.uri.fsPath;if(pending.has(key))return pending.get(key);
  const profiles=new WorkspaceConnectionProfile(context.workspaceState,folder.uri.toString?.()||key,(...args)=>vscode.window.showQuickPick(...args));
  const sameFolder=()=>vscode.workspace.getWorkspaceFolder(folder.uri)?.uri.fsPath===key;
  const requireFolder=()=>{if(!sameFolder())throw Error('Workspace changed during setup.');};
  let runtimeDetected=false;
  async function runtimeConfig({detect=false,requireInstall=false}={}){
   requireFolder();let config;
   try{config={...services.configFor(folder)};}catch(error){
    if(error.code!=='JADE_RUNTIME_NOT_CONFIGURED')throw error;
    detect=true;
   }
   if(detect||requireInstall&&!config.installPath){
    const detected=await services.detect(folder.uri);
    requireFolder();if(!detected)return;
    config={...services.configFor(folder)};
    if(requireInstall&&!config.installPath)throw Error('Detect Runtime Settings did not provide a Jade installation. Run setup again after selecting runtime settings.');
    runtimeDetected=true;
   }
   return config;
  }
  const run=vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Initialising Jade workspace',cancellable:false},async progress=>{
   await services.validateRuntime?.(folder);requireFolder();
   if(services.isBusy())throw Error('Wait for the current Jade operation before initialising this workspace.');
   const configFile=path.join(key,'jade.json'),original=fs.existsSync(configFile)?fs.readFileSync(configFile):undefined;
   function requireUnchanged(){
    requireFolder();
    if(services.isBusy())throw Error('Wait for the current Jade operation before initialising this workspace.');
    const current=fs.existsSync(configFile)?fs.readFileSync(configFile):undefined;
    if(original?!current||!original.equals(current):current!==undefined)throw Error('jade.json changed during setup. Run Initialise Workspace again.');
    if(vscode.workspace.textDocuments?.some(document=>document.isDirty&&document.uri?.fsPath&&path.resolve(document.uri.fsPath).toLowerCase()===path.resolve(configFile).toLowerCase()))
     throw Error('Save the pending jade.json edits before initialising this workspace.');
   }
   const argumentsFor=config=>services.nativeDiscovery?Object.entries({install:config.installPath,database:config.databasePath,ini:config.iniPath,server:config.server}).filter(([,value])=>typeof value==='string'&&value).flatMap(([key,value])=>['--'+key,value]):['--install',config.installPath,'--database',config.databasePath,'--ini',config.iniPath,'--server',config.server];
   const argv=['--config',configFile];let initialConfig;
   if(!original){
    const config=await runtimeConfig();if(!config)return{cancelled:true};initialConfig=config;
    // Unique native profile avoids replacing another project's shared profile.
    if(!services.nativeDiscovery||config.installPath)argv.push('--profile',profiles.nameFor(config,{creating:true}),...argumentsFor(config));
   }
   output.show(true);output.appendLine('Initialising Git and configuration in '+key+'. This does not extract, back up, build or publish.');
   async function invoke(args,expectedConfig=initialConfig){
    requireUnchanged();
    if(expectedConfig){const current=services.configFor(folder);if(['installPath','databasePath','iniPath','server'].some(key=>current[key]!==expectedConfig[key]))throw Error('Jade runtime settings changed during setup. Run Initialise Workspace again.');}
    progress.report({message:'Initialising Git and native project configuration; existing files are preserved…'});
    let pendingOutput='';
    return services.client.request('cli',{operation:'init',argv:args,cwd:key},text=>{
     output.append(text);const lines=(pendingOutput+text).split(/\r?\n/);pendingOutput=lines.pop().slice(-4096);
     for(const line of lines)if(/^\[Setup\] Git ignore(?:\s|$)/.test(line))progress.report({message:'Ensuring managed .jade state is ignored by Git…'});else if(/^\[Setup\] Git(?:\s|$)/.test(line))progress.report({message:'Preparing the Git repository…'});
    }).promise;
   }
   let selectedProfile,selectedProfileStage,result=await invoke(argv);
   if(result?.passed!==true){
    const previous=profiles.current(),profile=await profiles.select(result?.report?.error,{persist:false});
    if(profile){selectedProfile=profile;selectedProfileStage=profiles.stage(profile,previous);result=await invoke([...argv,'--profile',profile]);}
   }
   const failure=value=>value?.report?.error||'Native workspace initialisation failed.';
   // Only the native missing-profile diagnosis enables repair. Other failures keep their cause.
   if(original&&result?.passed!==true&&result?.code===2&&result?.cancelled!==true&&/^Unknown Jade connection profile '/.test(failure(result))){
    output.appendLine(failure(result));
    const choice=await vscode.window.showWarningMessage('This project references a Jade connection profile that is missing on this machine.',{detail:failure(result)},'Configure This Machine');
    requireFolder();
    if(choice!=='Configure This Machine')throw Error(failure(result));
    const config=await runtimeConfig({requireInstall:true});if(!config)return{cancelled:true};
    const confirmed=await vscode.window.showWarningMessage('Create this project’s missing private connection profile?',{modal:true,detail:'Use the selected runtime and database on this machine:\nInstallation: '+config.installPath+'\nDatabase: '+(config.databasePath||'Native default')+'\nINI: '+(config.iniPath||'Native default')+'\nServer: '+(config.server||'Native default')+'\n\njade.json is preserved. Native ownership rules refuse changing an existing profile to another connection. No database is opened.'},'Create Machine Profile');
    requireFolder();if(confirmed!=='Create Machine Profile')return{cancelled:true};
    // Omitting --profile lets native init use the existing file's connection alias.
    result=await invoke(['--config',configFile,...argumentsFor(config)],config);
   }else if(services.nativeDiscovery&&result?.passed!==true&&result?.code===2&&result?.cancelled!==true&&[
    'Jade connection setup is required. Run jade-cli init --install <Jade folder> or choose --profile <name>; noninteractive commands never prompt.',
    'Jade connection is not configured. Run jade-cli init --install <Jade folder> or choose --profile <name>.'
   ].includes(failure(result))){
    // File/private-profile discovery runs first. Only these native diagnoses
    // request explicit settings; a second native failure is never retried here.
    output.appendLine(failure(result));
    const config=await runtimeConfig({detect:true,requireInstall:true});if(!config)return{cancelled:true};
    const retry=['--config',configFile];
    if(selectedProfile)retry.push('--profile',selectedProfile);else if(!original)retry.push('--profile',profiles.nameFor(config,{creating:true}));
    result=await invoke([...retry,...argumentsFor(config)],config);
   }
   if(result?.passed!==true||result.code!==0)throw Error(failure(result));
   if(selectedProfile&&result.connection!==selectedProfile)throw Error('Native initialization did not confirm the selected connection profile; no profile selection was saved.');
   const git=result.git,relative=typeof git?.root==='string'&&path.isAbsolute(git.root)?path.relative(git.root,key):undefined;
   if(!git||typeof git.initialized!=='boolean'||typeof git.reused!=='boolean'||git.initialized===git.reused||git.ignoreEnsured!==true||relative===undefined||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Native workspace initialization did not confirm Git setup. Update the Jade CLI bundle and run Initialise Workspace again.');
   if(selectedProfileStage&&services.isBusy())throw Error('Wait for the current Jade operation before accepting this profile selection.');
   try{await selectedProfileStage?.commit();}catch(error){try{await selectedProfileStage?.rollback();}catch(cleanup){error.message+=' Profile selection rollback failed: '+cleanup.message;}throw error;}
   if(runtimeDetected)await services.runtimeSettingsReady?.(folder);
   output.appendLine((git.initialized?'Initialised':'Reused')+' Git repository: '+git.root+'.');output.appendLine('Managed .jade state is ignored by Git.');
   progress.report({message:'Native project configuration is ready.'});
   output.appendLine((result.created?'Created ':'Preserved existing ')+configFile+'. Configuration step complete.');
   if(services.refreshSourceIndex){progress.report({message:'Initialising the shared Git source index…'});await services.refreshSourceIndex(folder);output.appendLine('Shared source index is ready.');}
   if(notify&&sameFolder())void vscode.window.showInformationMessage(services.nativeDiscovery?'Jade project configuration is ready. Use Set Up Project to synchronize saved source with Working.':'Jade workspace configuration is ready. Use Extract All Sources for missing source, then Connect Database Objects to prepare Working.');
   return result;
  }).finally(()=>{if(pending.get(key)===run)pending.delete(key);});
  pending.set(key,run);return run;
 }
 const command=vscode.commands.registerCommand('jadeNative.initializeWorkspace',resource=>initialize(resource).catch(error=>{output.appendLine(error.message);void vscode.window.showErrorMessage(error.message);return{passed:false,error:error.message};}));
 context.subscriptions.push(command,output);return{initialize};
}
module.exports={registerWorkspaceInitialization};
