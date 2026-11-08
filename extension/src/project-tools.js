'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scanProject,scaffoldSchema,hash}=require('./native-project');
const {nativeProcess}=require('./native-utility');
const {joinProject,loadProject}=require('./native-project-build');
const {resolveExtractConfig,startExtract}=require('./extract');
const {organizeSources}=require('./source-layout');
const {parseSource}=require('./source_symbols');
const {targetKey}=require('./publish-changes');
const {jadeSourceUri}=require('./active-jade-source');
const {applyRenames,planRenames,projectRenames,sourceClasses}=require('./native-renames');
const inside=(root,file)=>{const r=path.relative(root,file);return r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
function catalog(project){const values=new Map();for(const s of project.schemas)for(const c of s.classes)values.set(s.name+'::'+c.owner,c);return values;}
function reviewChanges(before,after,renames=[]){
 const old=catalog(before),current=catalog(after),rows=[];
 const renamedOld=new Set(renames.map(op=>op.old));
 for(const op of renames)rows.push('RENAME class '+op.old+' -> '+op.next+' (preserve instances)');
 for(const name of old.keys())if(!current.has(name)&&!renamedOld.has(name))rows.push('DELETE class/override '+name);
 for(const [name,cls] of current){const prior=old.get(name);if(!prior){rows.push('ADD class/type '+name);continue;}
  const members=new Set(cls.model.classes.flatMap(c=>c.members.map(m=>m.kind+' '+m.name)));
  for(const item of prior.model.classes.flatMap(c=>c.members))if(!members.has(item.kind+' '+item.name))rows.push('REMOVE '+item.kind+' '+name+'::'+item.name);
  if(prior.hash!==cls.hash)rows.push('UPDATE '+name);
 }
 for(const s of after.schemas)rows.push((before.schemas.some(p=>p.name===s.name)?'LOAD':'CREATE')+' schema/resources '+s.name);
 return rows;
}
function registerProjectTools(vscode,context,options){
 async function folder(uri){const active=jadeSourceUri(vscode,uri);const selected=active&&vscode.workspace.getWorkspaceFolder(active);if(selected)return selected;const list=vscode.workspace.workspaceFolders||[];if(list.length===1)return list[0];const choice=await vscode.window.showQuickPick(list.map(folder=>({label:folder.name,folder})),{title:'Choose Jade source workspace'});if(!choice)throw Error('Choose a workspace folder.');return choice.folder;}
 async function save(root){for(const document of vscode.workspace.textDocuments)if(document.isDirty&&document.uri.scheme==='file'&&inside(root,document.uri.fsPath)&&/\.(cls|scm|sec|ddx|jcf)$/i.test(document.uri.fsPath)&&!await document.save())throw Error('Could not save '+document.uri.fsPath);}
 async function publish(required=false,uri){
  const source=await options.resolveSource?.(uri),selected=await folder(source?.uri||jadeSourceUri(vscode,uri)),root=selected.uri.fsPath;
  await options.beforeOperation?.();
  await save(root);const project=await scanProject(root);
  if(!project.schemas.length){if(required||project.migrations?.length)throw Error('Create or pull native schema headers first.');return;}
  if(options.isBusy())throw Error('A Jade operation is already running.');await options.setBusy(true);
  const output=options.output;let temporary;
  try{
   const document=await vscode.workspace.openTextDocument(project.schemas[0].header.file),config=options.config(document),id=targetKey(config),saved=context.workspaceState.get('jadeNative.nativeProjectPublished',{});
   if(saved[id]===project.hash){output.appendLine('No workspace source changes to publish.');return {success:true,results:[]};}
   output.clear();output.show(true);output.appendLine('Preparing and compiling a frozen native project in the working database ...');
   const working=await options.prepareWorking(config,text=>output.append(text));await applyRenames(working,project,text=>output.append(text));const bundle=await joinProject(working,project,text=>output.append(text));
   const checked=await loadProject(working,bundle,text=>output.append(text));if(!checked.success)throw Error('Working-base validation failed. Nothing was published to the target.');
   temporary=fs.mkdtempSync(path.join(os.tmpdir(),'jade-publish-review-'));
   const extracted=await startExtract(resolveExtractConfig(config),path.join(temporary,'raw'),text=>output.append(text)).completion;
   if(!extracted.success)throw Error('Could not inspect the target for publish review. Nothing was published.');
   const organized=organizeSources(extracted.destination,path.join(temporary,'organized')),before=await scanProject(organized.directory),renames=planRenames(projectRenames(project),new Set(catalog(before).keys()),sourceClasses(project)),changes=reviewChanges(before,project,renames);
   // Schemas omitted from this source project are never implicitly dropped from
   // an arbitrary target. Explicitly owned schema removals are listed separately.
   output.appendLine(changes.join('\n'));
   const choice=await vscode.window.showWarningMessage('Publish the native Jade workspace?',{modal:true,detail:'Database: '+config.databasePath+'\n\n'+changes.slice(0,20).join('\n')+(changes.length>20?'\n... full list in Jade Publish output.':'')+'\n\nComplete schemas are authoritative. Native loading removes absent classes, methods, properties and resources within the listed schemas. Earlier successful schema loads can remain committed if a later load fails.'},'Update Jade Base');
   if(choice!=='Update Jade Base')return {success:false,cancelled:true};
   for(const entry of project.entries)if(hash(fs.readFileSync(entry.file))!==entry.hash)throw Error('Source changed after review. Publish again: '+entry.file);
   const target={...working,databasePath:config.databasePath,iniPath:config.iniPath,server:config.server};
   await applyRenames(target,project,text=>output.append(text),new Set(catalog(before).keys()));
   const result=await loadProject(target,bundle,text=>output.append(text));output.appendLine('LoaderExitCode='+result.code);
   if(result.success){saved[id]=project.hash;await context.workspaceState.update('jadeNative.nativeProjectPublished',saved);void vscode.window.showInformationMessage('Published native Jade schemas and resources.');}
   else void vscode.window.showErrorMessage('Native workspace publish failed. See Jade Publish output.');
   return result;
  }finally{if(temporary&&path.dirname(path.resolve(temporary))===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('jade-publish-review-'))fs.rmSync(temporary,{recursive:true,force:true});await options.setBusy(false);}
 }
 context.subscriptions.push(vscode.commands.registerCommand('jadeNative.publishWorkspace',uri=>publish(true,uri).catch(error=>{options.output.appendLine(error.message);options.output.show(true);void vscode.window.showErrorMessage(error.message);return {success:false,error:error.message};})),
 vscode.commands.registerCommand('jadeNative.createSchema',async(properties={})=>{
  try{
   const selected=await folder(),root=selected.uri.fsPath,project=await scanProject(root),name=properties.name||await vscode.window.showInputBox({title:'New Jade schema',prompt:'Schema name',validateInput:value=>/^[A-Za-z_]\w*$/.test(value)&&!['RootSchema','JadeSchema'].includes(value)?undefined:'Enter a valid user schema name.'});if(!name)return;
   const parent=properties.parent||await vscode.window.showQuickPick(['RootSchema',...project.schemas.map(s=>s.name)],{title:'Parent schema'});if(!parent)return;
   let version=properties.version||project.schemas.map(s=>/jadeVersionNumber\s+"([^"]+)"/.exec(s.header.text)?.[1]).find(Boolean);
   if(!version){const settings=options.settings(selected),install=settings.installPath||process.env.JADE_INSTALL;if(install){const result=await nativeProcess(path.join(install,'bin/jdbutilb.exe'),['help'],{timeoutMilliseconds:10000});const found=/Version\s+(\d+)\.(\d+)\.(\d+)/i.exec(result.output);if(found)version=found[1]+'.'+found[2]+'.'+found[3].padStart(2,'0');}}
   if(!version)version=await vscode.window.showInputBox({title:'Jade source version',prompt:'Version installed on the target, for example 25.0.02'});if(!version)return;
   const bases={app:'RootSchemaApp',global:'RootSchemaGlobal',session:'RootSchemaSession'},chain=[];let current=parent;
   while(current&&current!=='RootSchema'){const schema=project.schemas.find(s=>s.name===current);if(!schema)throw Error('Pull parent schema '+current+' before creating its child.');chain.unshift(schema);current=schema.parent;}
   for(const schema of chain)for(const role of Object.keys(bases)){const found=schema.classes.find(c=>c.model.classes.some(value=>value.parent===bases[role]));if(found)bases[role]=found.owner;}
   const directory=require('./extract').resolveExtractionDirectory(root,options.settings(selected).extractionDirectory||'.');
   const created=await scaffoldSchema(directory,name,parent,version,bases);await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(created.header));void vscode.window.showInformationMessage('Created '+name+'. F5 compiles in the working base; Shift+F5 publishes after review.');return created;
  }catch(error){void vscode.window.showErrorMessage(error.message);return {error:error.message};}
 }),vscode.commands.registerCommand('jadeNative.addClassRename',async(properties={})=>{
  try{
   const selected=await folder(),project=await scanProject(selected.uri.fsPath);if(!project.schemas.length)throw Error('Pull or create schema headers before adding a tracked class rename.');
   const schema=properties.schema||await vscode.window.showQuickPick(project.schemas.map(s=>s.name),{title:'Schema containing the class'});if(!schema)return;
   const validate=value=>/^[A-Za-z_]\w*$/.test(value)?undefined:'Enter a class name.';
   const oldName=properties.oldName||await vscode.window.showInputBox({title:'Native class rename',prompt:'Existing class name in the database',validateInput:validate});if(!oldName)return;
   const newName=properties.newName||await vscode.window.showInputBox({title:'Native class rename',prompt:'New class name in your source files',validateInput:validate});if(!newName)return;
   if(validate(schema)||validate(oldName)||validate(newName)||oldName===newName)throw Error('Enter distinct valid class names and a valid schema.');
   const version=/jadeVersionNumber\s+"([^"]+)"/.exec(project.schemas.find(s=>s.name===schema)?.header.text||'')?.[1];if(!version)throw Error('The schema header has no Jade version.');
   const directory=path.join(selected.uri.fsPath,'migrations');fs.mkdirSync(directory,{recursive:true});
   const file=path.join(directory,Date.now()+'-rename-'+oldName.slice(0,24)+'-'+newName.slice(0,24)+'.jcf');
   fs.writeFileSync(file,'JadeCommandFile\r\nJadeVersionNumber '+version+'\r\nCommands\r\nRename Class '+schema+'::'+oldName+' '+newName+'\r\n',{flag:'wx'});
   await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));void vscode.window.showInformationMessage('Update class declarations/references to '+newName+', then F5. Publishing includes the native rename in its review.');return {file};
  }catch(error){void vscode.window.showErrorMessage(error.message);return {error:error.message};}
 }));
 return {publish};
}
module.exports={registerProjectTools,reviewChanges};
