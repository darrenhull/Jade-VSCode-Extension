'use strict';
const path=require('node:path');
/** Disk JOX is authoritative unless the project explicitly opts into extraction. */
function checkoutRoute(machine,project,root){
 if(project.workingMode==='source-backed')return;
 const resolved=Object.fromEntries(Object.entries(machine).filter(([,value])=>value!==undefined&&value!==''));
 const result={...project,...resolved,sourceFormat:'jox',workingMode:'existing',workspaceRoots:project.workspaceRoots||[path.resolve(root)]};
 if(machine.connection||project.connection)result.connection=machine.connection||project.connection;
 for(const key of ['workingSeedDirectory','workingDatabaseDirectory','sourceDatabasePath','user','username','password'])delete result[key];
 return result;
}
async function selectCheckoutRoot(root,project,vscode,{repositoryRoot=root}={}){
 const fs=require('node:fs');
 if(project.schemaPath!==undefined){
  const schema=require('./schema-folder').resolveSchemaFolder(repositoryRoot,project.schemaPath);
  const found=await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(schema),'**/*.[jJ][oO][xX]'),'**/{.jade,.git,node_modules}/**',1);
  if(!found.some(file=>{const relative=path.relative(schema,file.fsPath);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)&&file.fsPath.toLowerCase().endsWith('.jox');}))throw Error('schemaPath must contain saved JOX before Working can be reviewed.');
  if(project.workspaceRoots!==undefined&&(!Array.isArray(project.workspaceRoots)||project.workspaceRoots.length!==1||typeof project.workspaceRoots[0]!=='string'))throw Error('Choose exactly one saved source root.');
  const selected=project.workspaceRoots?path.resolve(root,project.workspaceRoots[0]):root,relative=path.relative(selected,schema),rootRelative=path.relative(repositoryRoot,selected);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||rootRelative==='..'||rootRelative.startsWith('..'+path.sep)||path.isAbsolute(rootRelative))throw Error('schemaPath and its selected source root must remain inside the checkout.');
  return selected;
 }
 const hasSavedRoot=async candidate=>{
  const schemas=path.join(candidate,'schemas');
  try{if(!fs.statSync(schemas).isDirectory())return false;}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return false;throw error;}
  const files=await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(candidate),'schemas/**/*.[jJ][oO][xX]'),'**/{.jade,.git,node_modules}/**',1);
  return files.some(file=>{const relative=path.relative(schemas,file.fsPath);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)&&file.fsPath.toLowerCase().endsWith('.jox');});
 };
 if(project.workspaceRoots!==undefined){
  if(!Array.isArray(project.workspaceRoots)||project.workspaceRoots.length!==1||typeof project.workspaceRoots[0]!=='string')throw Error('Choose exactly one saved JOX source root in workspaceRoots.');
  const selected=path.resolve(root,project.workspaceRoots[0]);if(!await hasSavedRoot(selected))throw Error('The configured source root must contain saved JOX under schemas/.');return selected;
 }
 const roots=[root,path.join(root,'sources')],eligible=await Promise.all(roots.map(hasSavedRoot)),candidates=roots.filter((_value,index)=>eligible[index]);
 if(candidates.length===1)return candidates[0];
 let selected;
 if(candidates.length>1)selected=(await vscode.window.showQuickPick(candidates.map(value=>({label:value,description:'Contains saved JOX in schemas/',sourceRoot:value})),{title:'Choose the saved JOX source root',placeHolder:'Select the checkout to synchronize'}))?.sourceRoot;
 else selected=(await vscode.window.showOpenDialog({title:'Select the saved JOX root containing schemas/',defaultUri:vscode.Uri.file(root),canSelectFolders:true,canSelectFiles:false,canSelectMany:false}))?.[0]?.fsPath;
 if(!selected)throw Object.assign(Error('JOX source-root selection cancelled.'),{cancelled:true});
 if(!await hasSavedRoot(selected))throw Error('Choose the source root containing saved JOX under schemas/.');
 return selected;
}
module.exports={checkoutRoute,selectCheckoutRoot};