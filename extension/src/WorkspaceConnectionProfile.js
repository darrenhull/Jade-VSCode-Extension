'use strict';
const {createHash}=require('node:crypto');
/** Retains a reviewed machine profile for one workspace; never deletes shared profiles. */
class WorkspaceConnectionProfile{
 constructor(state,folder,pick){this.state=state;this.folder=folder;this.pick=pick;this.key='jadeNative.connectionProfile:'+folder;}
 current(){const saved=this.state?.get(this.key);return typeof saved==='string'&&saved?saved:undefined;}
 nameFor(config){return config.connection||this.current()||'vscode-'+createHash('sha256').update(this.folder).digest('hex').slice(0,24);}
 async select(message){
  const match=/^Multiple Jade connection profiles are available \(([^\r\n]+)\)\. Choose --profile <name>; no interactive prompt is available\.$/.exec(message||'');
  if(!match)return;
  const names=match[1].split(', ').filter(name=>/^[A-Za-z0-9_.-]+$/.test(name));
  if(!names.length||names.join(', ')!==match[1])throw Error('Native connection profile list is invalid.');
  const previous=this.current();if(previous&&names.includes(previous))return previous;
  const selected=await this.pick(names.map(name=>({label:name,profile:name})),{title:'Choose the Jade connection for this workspace',placeHolder:'Select a connection profile'});
  if(!selected||!names.includes(selected.profile))throw Object.assign(Error('Jade connection selection cancelled.'),{cancelled:true});
  await this.state?.update(this.key,selected.profile);return selected.profile;
 }
}
module.exports={WorkspaceConnectionProfile};