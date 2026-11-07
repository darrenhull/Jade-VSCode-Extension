'use strict';
/** Resolve original source ownership without relying on a stale native editor. */
function jadeSourceUri(vscode,explicitUri){
  const native=vscode.window.activeTextEditor?.document,input=vscode.window.tabGroups?.activeTabGroup?.activeTab?.input;
  let uri=explicitUri?.uri||explicitUri;
  if(!uri){
    if(input?.viewType){if(input.viewType!=='jade.classWorkspace')return;uri=input.uri;}
    else uri=input?.uri||native?.uri;
  }
  return uri;
}
async function resolveJadeSource(vscode,explicitUri,{prepare}={}){
  const uri=jadeSourceUri(vscode,explicitUri),native=vscode.window.activeTextEditor?.document,input=vscode.window.tabGroups?.activeTabGroup?.activeTab?.input;
  if(!uri)return;
  if(prepare&&await prepare(uri)===false)throw Error('Resolve the method draft before running this Jade operation.');
  if(!explicitUri&&!input?.viewType&&native&&!native.isClosed&&(!input?.uri||native.uri.toString()===uri.toString()))return native;
  return vscode.workspace.openTextDocument(uri);
}
module.exports={resolveJadeSource,jadeSourceUri};
