'use strict';
// Migrate only previews owned by the old member viewer; never close user edits.
function retireLegacyMemberTabs(vscode,context){
 const groups=vscode.window.tabGroups;if(!groups)return Promise.resolve();let closing;
 const close=()=>{
  if(closing)return closing;
  const tabs=groups.all.flatMap(group=>group.tabs).filter(tab=>tab.input?.uri?.scheme==='jade-member'&&!tab.isDirty);
  if(!tabs.length)return Promise.resolve();
  closing=Promise.resolve().then(()=>groups.close(tabs,true)).catch(()=>{}).finally(()=>{closing=undefined;});return closing;
 };
 if(groups.onDidChangeTabs)context.subscriptions.push(groups.onDidChangeTabs(close));
 return close();
}
module.exports={retireLegacyMemberTabs};
