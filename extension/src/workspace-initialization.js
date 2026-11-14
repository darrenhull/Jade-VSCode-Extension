'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');

// Configuration only. Native CLI owns project/profile creation and existing-file preservation.
function registerWorkspaceInitialization(vscode,context,services){
 const output=vscode.window.createOutputChannel('Jade Setup'),pending=new Map();
 async function initialize(resource){
  let folder=resource&&vscode.workspace.getWorkspaceFolder(resource);
  if(resource&&!folder)throw Error('The selected project is not open in this workspace.');
  const folders=vscode.workspace.workspaceFolders||[];
  folder||=(folders.length===1?folders[0]:undefined);
  if(!folder&&folders.length)folder=(await vscode.window.showQuickPick(folders.map(folder=>({label:folder.name,description:folder.uri.fsPath,folder})),{title:'Choose Jade workspace to initialise'}))?.folder;
  if(!folder){if(!folders.length)void vscode.window.showInformationMessage('Create or open a source folder, then run Jade: Initialise Workspace.');return{cancelled:true};}
  const key=folder.uri.fsPath;if(pending.has(key))return pending.get(key);
  const sameFolder=()=>vscode.workspace.getWorkspaceFolder(folder.uri)?.uri.fsPath===key;
  const requireFolder=()=>{if(!sameFolder())throw Error('Workspace changed during setup.');};
  async function runtimeConfig(){
   requireFolder();
   try{return {...services.configFor(folder)};}catch(error){
    if(error.code!=='JADE_RUNTIME_NOT_CONFIGURED')throw error;
    const detected=await services.detect(folder.uri);
    requireFolder();
    return detected?{...services.configFor(folder)}:undefined;
   }
  }
  const run=vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Initialising Jade workspace',cancellable:false},async progress=>{
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
   const argumentsFor=config=>['--install',config.installPath,'--database',config.databasePath,'--ini',config.iniPath,'--server',config.server];
   const argv=['--config',configFile];let initialConfig;
   if(!original){
    const config=await runtimeConfig();if(!config)return{cancelled:true};initialConfig=config;
    // Unique native profile avoids replacing another project's shared profile.
    argv.push('--profile','vscode-'+randomUUID(),...argumentsFor(config));
   }
   output.show(true);output.appendLine('Initialising configuration in '+key+'. This does not extract, back up, build or publish.');
   async function invoke(args,expectedConfig=initialConfig){
    requireUnchanged();
    if(expectedConfig){const current=services.configFor(folder);if(['installPath','databasePath','iniPath','server'].some(key=>current[key]!==expectedConfig[key]))throw Error('Jade runtime settings changed during setup. Run Initialise Workspace again.');}
    progress.report({message:'Writing native project configuration; existing files are preserved…'});
    return services.client.request('cli',{operation:'init',argv:args,cwd:key},text=>output.append(text)).promise;
   }
   let result=await invoke(argv);
   const failure=value=>value?.report?.error||'Native workspace initialisation failed.';
   // Only the native missing-profile diagnosis enables repair. Other failures keep their cause.
   if(original&&result?.passed!==true&&/^Unknown Jade connection profile '/.test(failure(result))){
    output.appendLine(failure(result));
    const choice=await vscode.window.showWarningMessage('This project references a Jade connection profile that is missing on this machine.',{detail:failure(result)},'Configure This Machine');
    requireFolder();
    if(choice!=='Configure This Machine')throw Error(failure(result));
    const config=await runtimeConfig();if(!config)return{cancelled:true};
    const confirmed=await vscode.window.showWarningMessage('Create this project’s missing private connection profile?',{modal:true,detail:'Use the selected runtime and Source on this machine:\nInstallation: '+config.installPath+'\nSource: '+config.databasePath+'\nINI: '+config.iniPath+'\nServer: '+config.server+'\n\njade.json is preserved. Native ownership rules refuse changing an existing profile to another connection. No database is opened.'},'Create Machine Profile');
    requireFolder();if(confirmed!=='Create Machine Profile')return{cancelled:true};
    // Omitting --profile lets native init use the existing file's connection alias.
    result=await invoke(['--config',configFile,...argumentsFor(config)],config);
   }
   if(result?.passed!==true||result.code!==0)throw Error(failure(result));
   output.appendLine((result.created?'Created ':'Preserved existing ')+configFile+'. Configuration step complete.');
   if(sameFolder())void vscode.window.showInformationMessage('Jade workspace configuration is ready. Use Extract All Sources for missing source, then Connect Database Objects to prepare Working.');
   return result;
  }).finally(()=>{if(pending.get(key)===run)pending.delete(key);});
  pending.set(key,run);return run;
 }
 const command=vscode.commands.registerCommand('jadeNative.initializeWorkspace',resource=>initialize(resource).catch(error=>{output.appendLine(error.message);void vscode.window.showErrorMessage(error.message);return{passed:false,error:error.message};}));
 context.subscriptions.push(command,output);return{initialize};
}
module.exports={registerWorkspaceInitialization};
