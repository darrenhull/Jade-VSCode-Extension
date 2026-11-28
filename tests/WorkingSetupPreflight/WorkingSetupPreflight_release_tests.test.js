'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {releaseWorkingConsumers}=require('../../extension/src/working-setup-preflight');
test('setup awaits inspector cursors and retained native clients before touching policy',async()=>{const events=[];const release=name=>async()=>{await new Promise(r=>setImmediate(r));events.push(name);};await releaseWorkingConsumers({inspector:{releaseForOperation:release('inspection-closed')},client:{release:release('runtime-disconnected')},projects:[{provider:{snapshot:{},closeProject:release('source-project-closed')},ownedClient:{release:release('retained-client-disconnected')}}]});events.push('setup');assert.deepEqual(events,['inspection-closed','source-project-closed','retained-client-disconnected','runtime-disconnected','setup']);});
test('a failed owned closure stops setup and never kills external processes',async()=>{const events=[];await assert.rejects(releaseWorkingConsumers({inspector:{releaseForOperation:async()=>{throw Error('Owned inspection closure failed');}},client:{release:async()=>events.push('disconnected')},projects:[]}),/closure failed/);assert.deepEqual(events,[]);});
test('a cold source provider remains reconfigurable after setup preflight',async()=>{const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs'),{NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');const f=setup(),workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config}),project=workspace.project(f.folder);assert.equal(workspace.canReconfigure(project,{allowStoredProjections:true}),true);await releaseWorkingConsumers({projects:[project],client:{release:async()=>{}}});assert.equal(project.provider.sourceOperation,undefined);assert.equal(workspace.canReconfigure(project,{allowStoredProjections:true}),true);});

for(const conflict of ['none','another project','shared pending request','owned source operation','owner reconnect during inspector cleanup','provider reconnect during inspector cleanup','reconnect during source closure'])test('reviewed Working preflight with '+conflict,async()=>{
 const calls=[],record=name=>async()=>{calls.push(name);};
 const connection={},owner={client:connection,release:record('release accepted')};
 const project={provider:{snapshot:{},connection,async closeProject(){calls.push('close source');this.snapshot=undefined;
   if(conflict==='reconnect during source closure')this.connection=owner.client={};}},ownedClient:owner};
 const retainedWorking={project,owner,connection};
 const inspector={async releaseForOperation(){calls.push('close inspector');
   if(conflict==='owner reconnect during inspector cleanup')owner.client={};
   if(conflict==='provider reconnect during inspector cleanup')project.provider.connection={};
 }},client={release:record('release shared')},projects=[project];
 if(conflict==='another project')projects.push({ownedClient:{client:{},release:record('release other')}});
 if(conflict==='shared pending request')client.pending=new Map([[1,{}]]);
 if(conflict==='owned source operation')owner.activeSources=new Set([{}]);
 await releaseWorkingConsumers({inspector,client,projects,retainedWorking});
 assert.deepEqual(calls,conflict==='none'?['close inspector','close source']:
   ['close inspector','close source','release accepted',...(conflict==='another project'?['release other']:[]),'release shared']);
});
