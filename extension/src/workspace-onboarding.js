'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const CONTINUATION='jadeNative.pendingProjectSetup';
const samePath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
/** Presents existing Git/native setup actions; never installs software or invents readiness. */
function registerWorkspaceOnboarding(vscode,context,services){
 const output=vscode.window.createOutputChannel('Jade Project Setup');let pending;
 const log=message=>{output.show(true);output.appendLine(message);};
 const openFolder=uri=>(vscode.workspace.workspaceFolders||[]).find(folder=>uri.scheme==='file'&&samePath(folder.uri.fsPath,uri.fsPath));
 const requireFolder=folder=>{if(!openFolder(folder.uri))throw Error('The selected project is no longer open. Run Set Up Project again.');};
 function markerPath(uri){
  const directory=path.join(uri.fsPath,'.jade');
  if(fs.existsSync(directory)){const stat=fs.lstatSync(directory);if(stat.isSymbolicLink()||!stat.isDirectory()||!samePath(fs.realpathSync(directory),directory))throw Error('The project .jade directory must be a local directory without links.');}
  return path.join(directory,'project-setup.pending');
 }
 function ownsMarker(intent,uri){
  const file=markerPath(uri);if(!fs.existsSync(file))return false;const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1024)return false;
  try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value.format==='jade-project-setup/1'&&value.nonce===intent.nonce&&Object.keys(value).sort().join(',')==='format,nonce';}catch{return false;}
 }
 async function clearContinuation(intent,uri){
  if(ownsMarker(intent,uri))fs.unlinkSync(markerPath(uri));
  const current=context.globalState.get(CONTINUATION);if(current?.nonce===intent.nonce&&current?.uri===intent.uri)await context.globalState.update(CONTINUATION,undefined);
 }
 async function continueAfterOpen(uri){
  const file=markerPath(uri),directory=path.dirname(file);if(!fs.existsSync(directory))fs.mkdirSync(directory);markerPath(uri);
  const intent={uri:uri.toString(),nonce:randomUUID()};
  try{fs.writeFileSync(file,JSON.stringify({format:'jade-project-setup/1',nonce:intent.nonce}),{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw Error('An existing project setup marker was preserved. Open this project and run Set Up Project explicitly to retry.');throw error;}
  try{await context.globalState.update(CONTINUATION,intent);await vscode.commands.executeCommand('vscode.openFolder',uri,{forceReuseWindow:true});}
  catch(error){try{await clearContinuation(intent,uri);}catch(cleanup){error.message+=' Setup marker cleanup could not be confirmed: '+cleanup.message;}throw error;}
  return{continuation:true,configurationReady:false,workingPrepared:false};
 }
 async function gitApi(){
  for(;;){
   try{const extension=vscode.extensions.getExtension('vscode.git'),exports=await extension?.activate();if(exports?.enabled){const api=exports.getAPI(1);if(api.git?.path)return api;}}catch{}
   const choice=await vscode.window.showWarningMessage('Git is unavailable or disabled. Install or enable Git, then retry project setup.','Retry','Open Git Settings','Open Installation Guidance');
   if(choice==='Retry')continue;
   if(choice==='Open Git Settings')await vscode.commands.executeCommand('workbench.action.openSettings','git.enabled');
   if(choice==='Open Installation Guidance')await vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/install/windows'));
   return undefined;
  }
 }
 async function selectProject(resource){
  if(resource){const folder=vscode.workspace.getWorkspaceFolder(resource);if(!folder)throw Error('Choose an open project folder.');return{uri:folder.uri};}
  const choices=(vscode.workspace.workspaceFolders||[]).map(folder=>({label:'Use '+folder.name,description:folder.uri.fsPath,kind:'folder',uri:folder.uri}));
  choices.push({label:'Create a new project folder',kind:'create'},{label:'Open an existing project folder',kind:'open'},{label:'Clone a Git repository',kind:'clone'});
  const choice=await vscode.window.showQuickPick(choices,{title:'Set up a Jade project · choose its source folder'});if(!choice)return;
  if(choice.kind==='folder')return{uri:choice.uri};
  if(choice.kind==='clone'){
   const api=await gitApi();if(!api)return{gitReady:false};
   const remote=await vscode.window.showInputBox({title:'Clone a Jade source repository',prompt:'Repository URL (HTTPS, SSH or file). Git handles authentication; do not include a password or token.'});if(!remote)return;
   let parsed;try{parsed=new URL(remote);}catch{throw Error('Use a complete HTTPS, SSH or file repository URL.');}
   if(!['https:','ssh:','file:'].includes(parsed.protocol)||parsed.password||(parsed.protocol==='https:'&&parsed.username)||parsed.search||parsed.hash)throw Error('Use a repository URL without embedded credentials, query parameters or fragments. Git handles authentication.');
   const parent=(await vscode.window.showOpenDialog({title:'Choose the parent folder for the clone',canSelectFolders:true,canSelectFiles:false,canSelectMany:false}))?.[0];if(!parent)return;
   if(parent.scheme!=='file')throw Error('Choose a local project folder.');
   log('Cloning through VS Code Git. Existing directories and Git authentication remain under Git control.');
   const uri=await api.clone(vscode.Uri.parse(remote),{parentPath:parent,postCloneAction:'none'});return uri?{uri,api}:undefined;
  }
  const parent=(await vscode.window.showOpenDialog({title:choice.kind==='create'?'Choose the parent for the new project folder':'Choose the project source folder',canSelectFolders:true,canSelectFiles:false,canSelectMany:false}))?.[0];if(!parent)return;
  if(parent.scheme!=='file')throw Error('Choose a local project folder.');
  if(choice.kind==='open')return{uri:parent};
  const validate=name=>!name||name!==name.trim()||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)||name==='.'||name==='..'?'Enter one valid new folder name.':undefined;
  const name=await vscode.window.showInputBox({title:'Name the new project folder',validateInput:validate});if(name===undefined)return;if(validate(name))throw Error(validate(name));
  const directory=path.join(parent.fsPath,name);await fs.promises.mkdir(directory);return{uri:vscode.Uri.file(directory)};
 }
 async function runJox(folder,repository){
  const status={gitReady:false,configurationReady:false,workingPrepared:false,sourceReady:false,viewsReady:false,completed:false};
  let stage='configuration';
  try{
   const checkout=await services.checkoutTargets?.(folder,{repository});requireFolder(folder);
   if(checkout){
    status.gitReady=true;status.configurationReady=true;stage='review';
    const creating=checkout.workingState==='new';
    const action=creating?'Create Working from checkout':'Sync checkout to Working';
    const savedRoot=require('node:url').fileURLToPath(checkout.sourceRoots[0]);
    const confirm=await vscode.window.showWarningMessage(action+'?',{modal:true,detail:'Jade installation: '+checkout.working.installPath+
     '\nWorking: '+checkout.working.databasePath+'\nSaved JOX: '+savedRoot+'\n\nNo application Source database is used. '+
     (creating?'Load the saved checkout, including saved edits. Unsaved editor buffers are not loaded.':'Connect to the accepted generation, then sync saved checkout changes before refreshing views.')},action);
    requireFolder(folder);if(confirm!==action)return{...status,passed:false,code:130,cancelled:true,stage};
    stage='working';let accepted;
    await services.activateCheckout?.(folder,checkout);
    if(creating){
     const result=await services.initializeCheckout(folder,checkout);requireFolder(folder);
     if(!result?.sourceSnapshot)throw Error('Native setup did not return its saved checkout snapshot.');
     status.workingPrepared=true;status.sourceReady=true;status.sourceSnapshot=result.sourceSnapshot;
     accepted=await services.commitCheckout?.(folder,checkout);
     stage='refresh';
     if(result.viewRefreshRequired)throw Object.assign(Error(result.warning||'Working was created, but its view connection changed.'),{result:{...result,passed:false,code:2}});
    }else{
     const result=await services.connectWorking(folder,checkout);
     if(result?.selection!=='working'||result?.readOnly!==true)throw Error('Native Git-first Working reopen was not confirmed.');
     status.workingPrepared=true;
     const synced=await services.syncCheckout(folder,checkout);requireFolder(folder);
     if(synced?.passed!==true||synced.code!==0)throw Object.assign(Error(synced?.report?.error||'Native checkout reconciliation failed.'),{result:synced});
     accepted=await services.commitCheckout?.(folder,checkout);
    }
    stage='refresh';requireFolder(folder);
    await services.refreshProject(folder,{prepared:accepted?.prepared!==false});requireFolder(folder);
    status.sourceReady=true;status.viewsReady=true;stage='explorer';
    await services.openExplorer(folder);requireFolder(folder);
    log(creating?'Git-first Working is ready for the saved checkout.':'Working is ready for the current saved checkout.');
    return{...status,passed:true,code:0,completed:true,stage:'complete',sourceChoice:'git-first'};
   }
   const initialized=await services.initialize(folder.uri);requireFolder(folder);
   if(initialized?.cancelled)return{...status,passed:false,code:130,cancelled:true,stage};
   if(initialized?.passed!==true||initialized.code!==0)throw Object.assign(Error(initialized?.report?.error||initialized?.error||'Native project configuration did not complete.'),{result:initialized});
   status.gitReady=true;status.configurationReady=true;stage='review';
   const target=await services.targets(folder,{initialization:true});requireFolder(folder);
   if(typeof target.destination!=='string'||!path.isAbsolute(target.destination))throw Error('Native setup did not return an absolute source destination.');
   let existing=false;
   try{
    const stat=fs.lstatSync(target.destination);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('The source destination must be an ordinary directory. Existing files were preserved.');
    const directory=fs.opendirSync(target.destination);try{existing=directory.readSync()!==null;}finally{directory.closeSync();}
   }catch(error){if(error.code!=='ENOENT')throw error;}
   const action=existing?'Prepare Working':'Create Working and extract',c=target.config;
   const confirm=await vscode.window.showWarningMessage(existing?'Prepare this project using its existing sources?':'Create Working copy and extract sources?',{modal:true,detail:'Project: '+folder.uri.fsPath+'\nJade installation: '+c.installPath+'\nSource: '+c.databasePath+'\nSource INI: '+c.iniPath+'\nServer: '+c.server+'\nWorking: '+target.working.databasePath+'\nSaved sources: '+target.destination+'\n\n'+(existing?'Existing source files are preserved. Native setup reuses an owned Working copy; it never resets or overwrites existing data.':'Native setup backs up Source, creates its private Working copy and extracts JOX sources once. Existing data and source files are preserved.')+' No test or Source publication is started.'},action);
   requireFolder(folder);if(confirm!==action)return{...status,passed:false,code:130,cancelled:true,stage};
   stage='working';
   if(existing){
    const connected=await services.connectWorking(folder,target);requireFolder(folder);
    if(connected?.cancelled)return{...status,cancelled:true,stage};
    if(connected?.selection!=='working'||connected?.readOnly!==true)throw Error(connected?.error||'Native Working preparation was not confirmed.');
    status.workingPrepared=true;
   }else{
    const extracted=await services.initializeWorkingSources(folder,target);
    if(extracted?.cancelled)return{...status,...extracted,passed:false,code:extracted.code||130,cancelled:true,completed:false,stage};
    if(!extracted?.sourceSnapshot)throw Error('Native setup did not return its saved source snapshot.');
    status.workingPrepared=true;status.sourceReady=true;status.sourceSnapshot=extracted.sourceSnapshot;
    stage='refresh';
    if(extracted.viewRefreshRequired)throw Object.assign(Error(extracted.warning||'Working and source files were created, but their view connection changed.'),{result:{...extracted,passed:false,code:2}});
    if(!openFolder(folder.uri))return{...status,passed:false,code:2,projectClosed:true,stage};
   }
   stage='refresh';requireFolder(folder);
   await services.refreshProject(folder,{prepared:!existing});requireFolder(folder);
   status.sourceReady=true;status.viewsReady=true;stage='explorer';
   await services.openExplorer(folder);requireFolder(folder);
   log('Jade project is ready. Working and saved sources are prepared; Object Explorer and tests are refreshed.');
   return{...status,passed:true,code:0,completed:true,stage:'complete',sourceChoice:existing?'existing':'extract'};
  }catch(error){
   try{await services.abortCheckout?.(folder);}catch(cleanup){error.message+=' Checkout cleanup failed: '+cleanup.message;}
   const native=error.result,cancelled=native?native.cancelled===true:error.cancelled===true;
   error.result={...status,...native,passed:false,completed:false,stage,code:native?.code??(cancelled?130:2),...(cancelled?{cancelled:true}:{})};
   error.message='Jade setup stopped during '+stage+': '+error.message;
   throw error;
  }
 }
 async function run(resource){
  const selected=await selectProject(resource);if(!selected)return{cancelled:true};if(selected.gitReady===false)return{gitReady:false,configurationReady:false,workingPrepared:false};
  const {uri}=selected;if(uri.scheme!=='file')throw Error('Choose a local project folder.');
  const api=selected.api||await gitApi();if(!api)return{gitReady:false,configurationReady:false,workingPrepared:false};
  const folder=openFolder(uri);
  if(!folder)return continueAfterOpen(uri);
  requireFolder(folder);const repository=await api.openRepository(folder.uri);requireFolder(folder);
  if(!services.jox&&repository?.state?.remotes?.length){const choice=await vscode.window.showQuickPick([{label:'Use the current checkout',kind:'current'},{label:'Pull changes with Git',kind:'pull'}],{title:'Repository sources · '+folder.name,placeHolder:repository.rootUri?.fsPath||folder.uri.fsPath});if(!choice)return{cancelled:true};if(choice.kind==='pull'){log('Pulling through VS Code Git; conflicts and local edits remain under Git control.');await repository.pull();requireFolder(folder);}}
  log('Initialising project configuration and Git ignore'+(services.jox?'':' and the shared source index')+' in '+folder.uri.fsPath+'.');
  if(services.jox)return runJox(folder,repository);
  const initialized=await services.initialize(folder.uri);requireFolder(folder);
  if(initialized?.cancelled)return{cancelled:true,configurationReady:false,workingPrepared:false};
  if(initialized?.passed!==true||initialized.code!==0)throw Error(initialized?.report?.error||initialized?.error||'Native workspace initialization did not complete.');
  const base={gitReady:true,configurationReady:true,workingPrepared:false};
  const source=await vscode.window.showQuickPick([{label:'Use existing source files',kind:'existing'},{label:services.jox?'Create Working copy and extract sources':'Extract sources from Source',kind:'extract'},{label:'Get sources later',kind:'later'}],{title:'Project source files · '+folder.name});if(!source)return{...base,cancelled:true};requireFolder(folder);
  const choice=await vscode.window.showQuickPick([{label:'Prepare Working database',description:'First use can back up Source and restore its private copy',kind:'working'},{label:'Prepare Working later',kind:'later'}],{title:'Private Working database · '+folder.name});if(!choice)return{...base,cancelled:true,sourceChoice:source.kind};requireFolder(folder);
  if(choice.kind==='working'){
   const targets=await services.targets(folder,{initialization:source.kind==='extract'});requireFolder(folder);const c=targets.config;
   const combinedJox=services.jox&&source.kind==='extract',action=combinedJox?'Create Working and extract':'Prepare Working';
   const confirm=await vscode.window.showWarningMessage(combinedJox?'Create Working copy and extract sources?':'Prepare the private Working database for this project?',{modal:true,detail:'Project: '+folder.uri.fsPath+'\nJade installation: '+c.installPath+'\nSource: '+c.databasePath+'\nSource INI: '+c.iniPath+'\nServer: '+c.server+'\nWorking: '+targets.working.databasePath+'\n\n'+(combinedJox?'Native setup restores a fresh private Working copy, then extracts JOX sources once from that copy. Existing Working data and source files are preserved.':source.kind==='extract'?'Native setup prepares owned Working and extracts from that same generation. Existing Working data is preserved.':'First use takes a consistent Source backup and restores its private copy. Existing valid Working state is reused.')+' Working is persistent; no build, test or publication is started.'},action);
   if(confirm!==action)return{...base,cancelled:true,sourceChoice:source.kind};requireFolder(folder);
   if(combinedJox){
    log('Creating Working and extracting its saved JOX sources. Existing data and files are preserved.');
    const extracted=await services.initializeWorkingSources(folder,targets);
    if(!extracted?.sourceSnapshot)throw Error('Native setup did not return its saved source snapshot.');
    base.workingPrepared=true;base.sourceSnapshot=extracted.sourceSnapshot;
    if(!openFolder(folder.uri))return{...base,projectClosed:true};
    requireFolder(folder);
   }else if(source.kind==='extract'){
    log('Preparing one owned Working generation and extracting its native source baseline. Local edits remain protected.');
    const extracted=await services.syncWorkingSources(folder,c);requireFolder(folder);
    if(extracted?.cancelled||extracted?.status==='cancelled')return{...base,cancelled:true,sourceChoice:source.kind,sourceResult:extracted};
    if(extracted?.passed!==true)return{...base,passed:false,code:extracted?.code??2,error:extracted?.report?.error||extracted?.error||'Working source sync did not complete.',sourceChoice:source.kind,sourceResult:extracted};
    if(extracted.workingBaseline?.status!=='verified'||extracted.workingBaseline.origin!=='same-generation-native-extraction')
     throw Error('Native Working source baseline was not verified. Review the native reconciliation action before continuing.');
    base.workingPrepared=true;base.workingBaseline=extracted.workingBaseline;
   }else{
    log('Preparing Working through the existing connection workflow. Its notification shows native progress, timeout and cancellation.');
    const connected=await services.connectWorking(folder,services.jox?targets:c);requireFolder(folder);
    if(connected?.cancelled)return{...base,cancelled:true,sourceChoice:source.kind};
    if(connected?.selection!=='working'||connected?.readOnly!==true)throw Error(connected?.error||'Working preparation was not confirmed by the native connection.');
    base.workingPrepared=true;
   }
  }
  if(services.jox&&source.kind==='extract'&&choice.kind!=='working'){
   log('Working setup was deferred. No sources were extracted.');return{...base,deferred:true,sourceChoice:'later'};
  }
  if(source.kind==='extract'&&choice.kind!=='working'){
   log('Opening the existing native Source extraction workflow. Local edits remain protected.');
   const extracted=await services.extract(folder.uri);requireFolder(folder);
   if(extracted?.cancelled||extracted?.status==='cancelled')return{...base,cancelled:true,sourceChoice:source.kind};
   if(extracted?.passed!==true)throw Error(extracted?.report?.error||extracted?.error||'Source extraction did not complete.');
  }
  const workingStatus=base.sourceSnapshot?'prepared with saved JOX sources.':base.workingBaseline?'prepared with its native source baseline.':base.workingPrepared?(services.jox?'prepared.':'prepared and connected.'):'not prepared.';
  const result={...base,sourceChoice:source.kind};log('Project configuration ready. Source route: '+source.kind+'. Working: '+workingStatus);
  void vscode.window.showInformationMessage('Jade project configuration is ready. Working '+(base.sourceSnapshot?'is prepared with saved JOX sources.':base.workingBaseline?'is prepared with its native source baseline.':base.workingPrepared?(services.jox?'is prepared.':'is prepared and connected.'):'has not been prepared.'));return result;
 }
 function setup(resource){if(pending)return pending;pending=run(resource).catch(error=>{log(error.message);if(!error.result?.cancelled)void vscode.window.showErrorMessage(error.message);return{...error.result,passed:false,error:error.message};}).finally(()=>{pending=undefined;});return pending;}
 async function resume(){
  const intent=context.globalState.get(CONTINUATION);if(intent===undefined)return;
  if(!intent||typeof intent.uri!=='string'||typeof intent.nonce!=='string'||!/^[0-9a-f-]{36}$/i.test(intent.nonce)){await context.globalState.update(CONTINUATION,undefined);return;}
  let uri;try{uri=vscode.Uri.parse(intent.uri);}catch{await context.globalState.update(CONTINUATION,undefined);return;}
  if(uri.scheme!=='file'){await context.globalState.update(CONTINUATION,undefined);return;}const folder=openFolder(uri);if(!folder)return;
  if(!ownsMarker(intent,uri)){await context.globalState.update(CONTINUATION,undefined);void vscode.window.showWarningMessage('The project setup continuation could not be verified. Existing files were preserved. Run Set Up Project explicitly to retry.');return{cancelled:true};}
  await clearContinuation(intent,uri);if(services.jox)return setup(uri);
  const choice=await vscode.window.showInformationMessage('Continue setting up Jade in '+folder.uri.fsPath+'?','Continue Project Setup');if(choice==='Continue Project Setup'&&openFolder(uri))return setup(uri);return{cancelled:true};
 }
 context.subscriptions.push(output,vscode.commands.registerCommand('jadeNative.setupProject',setup));return{setup,resume};
}
module.exports={registerWorkspaceOnboarding};
