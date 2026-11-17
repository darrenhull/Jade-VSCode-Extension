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
 async function run(resource){
  const selected=await selectProject(resource);if(!selected)return{cancelled:true};if(selected.gitReady===false)return{gitReady:false,configurationReady:false,workingPrepared:false};
  const {uri}=selected;if(uri.scheme!=='file')throw Error('Choose a local project folder.');
  const api=selected.api||await gitApi();if(!api)return{gitReady:false,configurationReady:false,workingPrepared:false};
  const folder=openFolder(uri);
  if(!folder)return continueAfterOpen(uri);
  requireFolder(folder);const repository=await api.openRepository(folder.uri);requireFolder(folder);
  if(repository?.state?.remotes?.length){const choice=await vscode.window.showQuickPick([{label:'Use the current checkout',kind:'current'},{label:'Pull changes with Git',kind:'pull'}],{title:'Repository sources · '+folder.name,placeHolder:repository.rootUri?.fsPath||folder.uri.fsPath});if(!choice)return{cancelled:true};if(choice.kind==='pull'){log('Pulling through VS Code Git; conflicts and local edits remain under Git control.');await repository.pull();requireFolder(folder);}}
  log('Initialising project configuration, Git ignore and the shared source index in '+folder.uri.fsPath+'.');
  const initialized=await services.initialize(folder.uri);requireFolder(folder);
  if(initialized?.cancelled)return{cancelled:true,configurationReady:false,workingPrepared:false};
  if(initialized?.passed!==true||initialized.code!==0)throw Error(initialized?.report?.error||initialized?.error||'Native workspace initialization did not complete.');
  const base={gitReady:true,configurationReady:true,workingPrepared:false};
  const source=await vscode.window.showQuickPick([{label:'Use existing source files',kind:'existing'},{label:'Extract sources from Source',kind:'extract'},{label:'Get sources later',kind:'later'}],{title:'Project source files · '+folder.name});if(!source)return{...base,cancelled:true};requireFolder(folder);
  const choice=await vscode.window.showQuickPick([{label:'Prepare Working database',description:'First use can back up Source and restore its private copy',kind:'working'},{label:'Prepare Working later',kind:'later'}],{title:'Private Working database · '+folder.name});if(!choice)return{...base,cancelled:true,sourceChoice:source.kind};requireFolder(folder);
  if(choice.kind==='working'){
   const targets=await services.targets(folder);requireFolder(folder);const c=targets.config;
   const confirm=await vscode.window.showWarningMessage('Prepare the private Working database for this project?',{modal:true,detail:'Project: '+folder.uri.fsPath+'\nJade installation: '+c.installPath+'\nSource: '+c.databasePath+'\nSource INI: '+c.iniPath+'\nServer: '+c.server+'\nWorking: '+targets.working.databasePath+'\n\n'+(source.kind==='extract'?'Native setup prepares owned Working and extracts from that same generation. Existing Working data is preserved.':'First use takes a consistent Source backup and restores its private copy. Existing valid Working state is reused.')+' Working is persistent; no build, test or publication is started.'},'Prepare Working');
   if(confirm!=='Prepare Working')return{...base,cancelled:true,sourceChoice:source.kind};requireFolder(folder);
   if(source.kind==='extract'){
    log('Preparing one owned Working generation and extracting its native source baseline. Local edits remain protected.');
    const extracted=await services.syncWorkingSources(folder,c);requireFolder(folder);
    if(extracted?.cancelled||extracted?.status==='cancelled')return{...base,cancelled:true,sourceChoice:source.kind,sourceResult:extracted};
    if(extracted?.passed!==true)return{...base,passed:false,code:extracted?.code??2,error:extracted?.report?.error||extracted?.error||'Working source sync did not complete.',sourceChoice:source.kind,sourceResult:extracted};
    if(extracted.workingBaseline?.status!=='verified'||extracted.workingBaseline.origin!=='same-generation-native-extraction')
     throw Error('Native Working source baseline was not verified. Review the native reconciliation action before continuing.');
    base.workingPrepared=true;base.workingBaseline=extracted.workingBaseline;
   }else{
    log('Preparing Working through the existing connection workflow. Its notification shows native progress, timeout and cancellation.');
    const connected=await services.connectWorking(folder,c);requireFolder(folder);
    if(connected?.cancelled)return{...base,cancelled:true,sourceChoice:source.kind};
    if(connected?.selection!=='working'||connected?.readOnly!==true)throw Error(connected?.error||'Working preparation was not confirmed by the native connection.');
    base.workingPrepared=true;
   }
  }
  if(source.kind==='extract'&&choice.kind!=='working'){
   log('Opening the existing native Source extraction workflow. Local edits remain protected.');
   const extracted=await services.extract(folder.uri);requireFolder(folder);
   if(extracted?.cancelled||extracted?.status==='cancelled')return{...base,cancelled:true,sourceChoice:source.kind};
   if(extracted?.passed!==true)throw Error(extracted?.report?.error||extracted?.error||'Source extraction did not complete.');
  }
  const workingStatus=base.workingBaseline?'prepared with its native source baseline.':base.workingPrepared?'prepared and connected.':'not prepared.';
  const result={...base,sourceChoice:source.kind};log('Project configuration ready. Source route: '+source.kind+'. Working: '+workingStatus);
  void vscode.window.showInformationMessage('Jade project configuration is ready. Working '+(base.workingBaseline?'is prepared with its native source baseline.':base.workingPrepared?'is prepared and connected.':'has not been prepared.'));return result;
 }
 function setup(resource){if(pending)return pending;pending=run(resource).catch(error=>{log(error.message);void vscode.window.showErrorMessage(error.message);return{passed:false,error:error.message};}).finally(()=>{pending=undefined;});return pending;}
 async function resume(){
  const intent=context.globalState.get(CONTINUATION);if(intent===undefined)return;
  if(!intent||typeof intent.uri!=='string'||typeof intent.nonce!=='string'||!/^[0-9a-f-]{36}$/i.test(intent.nonce)){await context.globalState.update(CONTINUATION,undefined);return;}
  let uri;try{uri=vscode.Uri.parse(intent.uri);}catch{await context.globalState.update(CONTINUATION,undefined);return;}
  if(uri.scheme!=='file'){await context.globalState.update(CONTINUATION,undefined);return;}const folder=openFolder(uri);if(!folder)return;
  if(!ownsMarker(intent,uri)){await context.globalState.update(CONTINUATION,undefined);void vscode.window.showWarningMessage('The project setup continuation could not be verified. Existing files were preserved. Run Set Up Project explicitly to retry.');return{cancelled:true};}
  await clearContinuation(intent,uri);const choice=await vscode.window.showInformationMessage('Continue setting up Jade in '+folder.uri.fsPath+'?','Continue Project Setup');if(choice==='Continue Project Setup'&&openFolder(uri))return setup(uri);return{cancelled:true};
 }
 context.subscriptions.push(output,vscode.commands.registerCommand('jadeNative.setupProject',setup));return{setup,resume};
}
module.exports={registerWorkspaceOnboarding};
