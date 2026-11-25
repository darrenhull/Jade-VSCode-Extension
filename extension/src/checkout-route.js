'use strict';
const path=require('node:path');
/** Disk JOX is authoritative unless the project explicitly opts into extraction. */
function checkoutRoute(machine,project,root){
 if(project.workingMode==='source-backed')return;
 const result={...machine,...project,sourceFormat:'jox',workingMode:'existing',workspaceRoots:project.workspaceRoots||[path.resolve(root)]};
 for(const key of ['workingSeedDirectory','workingDatabaseDirectory','sourceDatabasePath','user','username','password'])delete result[key];
 return result;
}
async function selectCheckoutRoot(root,project,vscode){
 if(project.workspaceRoots!==undefined){
  if(!Array.isArray(project.workspaceRoots)||project.workspaceRoots.length!==1||typeof project.workspaceRoots[0]!=='string')throw Error('Choose exactly one saved JOX source root in workspaceRoots.');
  return path.resolve(root,project.workspaceRoots[0]);
 }
 const fs=require('node:fs'),candidates=[root,path.join(root,'sources')].filter(value=>{try{return fs.statSync(path.join(value,'schemas')).isDirectory();}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return false;throw error;}});
 if(candidates.length===1)return candidates[0];
 let selected;
 if(candidates.length>1)selected=(await vscode.window.showQuickPick(candidates.map(value=>({label:value,description:'Contains schemas/',sourceRoot:value})),{title:'Choose the saved JOX source root',placeHolder:'Select the checkout to synchronize'}))?.sourceRoot;
 else selected=(await vscode.window.showOpenDialog({title:'Select the saved JOX root containing schemas/',canSelectFolders:true,canSelectFiles:false,canSelectMany:false}))?.[0]?.fsPath;
 if(!selected)throw Object.assign(Error('JOX source-root selection cancelled.'),{cancelled:true});
 if(!fs.statSync(path.join(selected,'schemas')).isDirectory())throw Error('Choose the source root containing schemas/.');
 return selected;
}
module.exports={checkoutRoute,selectCheckoutRoot};