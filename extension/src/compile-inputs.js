'use strict';
const path=require('node:path');
const {isNestedSnapshot}=require('./source-snapshots');
const nativeSource=/\.(cls|scm|sec|ddx|jcf)$/i;
function inside(root,file){const relative=path.relative(root,path.resolve(file));return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
async function prepareCompileInputs(vscode,config){
 const workspace=vscode.workspace,root=path.resolve(config.workspaceRoots[0]);
 if(config.projectBuild&&workspace.workspaceFolders?.some(folder=>path.resolve(folder.uri.fsPath)!==root&&inside(root,folder.uri.fsPath)))throw Error('A project build cannot include another nested workspace folder. Open the projects separately or compile the current file.');
 const owned=uri=>{
  if(uri.scheme!=='file'||!inside(root,uri.fsPath)||isNestedSnapshot(uri,workspace))return false;
  const owner=workspace.getWorkspaceFolder?.(uri);return !owner||path.resolve(owner.uri.fsPath)===root;
 };
 const selected=workspace.textDocuments.find(document=>document.uri.scheme==='file'&&path.resolve(document.uri.fsPath)===path.resolve(config.program));
 if(selected?.isDirty&&!await selected.save())throw Error('Could not save '+selected.uri.fsPath);
 for(const document of workspace.textDocuments)if(document!==selected&&document.isDirty&&nativeSource.test(document.uri.fsPath||'')&&owned(document.uri)&&!await document.save())throw Error('Could not save '+document.uri.fsPath);
 const pattern=config.projectBuild?'**/*.{cls,scm,sec,ddx,jcf}':'**/*.cls';
 config.files=(await workspace.findFiles(pattern,'**/{node_modules,.git,dist}/**')).filter(owned).map(uri=>uri.fsPath);
 if(!config.files.includes(config.program))config.files.push(config.program);
}
module.exports={prepareCompileInputs};
