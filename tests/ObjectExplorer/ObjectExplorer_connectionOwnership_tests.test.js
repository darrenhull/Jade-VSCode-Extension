'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {setup}=require('../../test/fixtures/object-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let finish;return{promise:new Promise(resolve=>finish=resolve),finish:()=>finish()};}
async function settings(s,config){Object.assign(s.config,config);const changed=s.changeConfiguration({affectsConfiguration:()=>true});await turn();for(const client of s.clients)if(client.stopCalled)client.finishClose();await changed;}
async function pair(options={}){
 const s=setup({closeAutomatically:true,resolveConfig:(_doc,_folder,config)=>({...config,workspaceRoots:[...config.workspaceRoots]}),...options}),a={databasePath:s.config.databasePath,iniPath:s.config.iniPath},b={databasePath:path.join(s.root,'database-b'),iniPath:path.join(s.root,'database-b','jade.ini')};
 try{await s.connect();const keyA=[...s.secretValues.keys()][0];await settings(s,b);await s.commands.get('jadeNative.connectObjects')();const keyB=[...s.secretValues.keys()].find(key=>key!==keyA);assert.ok(keyA&&keyB);return{s,a,b,keyA,keyB};}catch(error){await s.cleanup();throw error;}
}
const classIdentity=s=>({schema:'Pets',className:'Fish',projectRoot:s.config.workspaceRoots[0]});

test('Forget after B to A settings change resolves A before reconnect and preserves saved B',async()=>{
 const {s,a,keyA,keyB}=await pair();
 try{await settings(s,a);assert.equal(require('node:fs').existsSync(a.databasePath),false);assert.equal(require('node:fs').existsSync(a.iniPath),false);s.secretValues.set('unrelated-entry','keep unrelated saved entry');const result=await s.commands.get('jadeNative.forgetInspectionSignIn')();assert.equal(result.forgotten,true);assert.equal(s.secretValues.has(keyA),false,'The currently configured A sign-in must be removed');assert.equal(s.secretValues.has(keyB),true,'Previously connected B must be preserved');assert.equal(s.secretValues.get('unrelated-entry'),'keep unrelated saved entry');assert.equal(s.clients.length,2);}finally{await s.cleanup();}
});

test('Forget keeps the selected workspace when another workspace editor is active after settings change',async()=>{
 let other;const {s,a,keyA,keyB}=await pair({resolveConfig:(_doc,folder,config)=>other&&folder?.uri.fsPath===other.config.workspaceRoots[0]?other.config:config});
 try{other=setup({secretStorage:s.secrets});await other.connect();const otherKey=[...s.secretValues.keys()].find(key=>key!==keyA&&key!==keyB);assert.ok(otherKey);const selected={name:'Selected',uri:s.vscode.Uri.file(s.config.workspaceRoots[0])},unrelated={name:'Other',uri:s.vscode.Uri.file(other.config.workspaceRoots[0])};s.vscode.workspace.workspaceFolders=[selected,unrelated];s.vscode.workspace.getWorkspaceFolder=uri=>s.vscode.workspace.workspaceFolders.find(folder=>{const file=path.resolve(uri.fsPath).toLowerCase(),root=path.resolve(folder.uri.fsPath).toLowerCase();return file===root||file.startsWith(root+path.sep);});s.vscode.window.activeTextEditor={document:{uri:s.vscode.Uri.file(path.join(unrelated.uri.fsPath,'Other.cls'))}};await settings(s,a);const calls=s.configCalls.length;await s.commands.get('jadeNative.forgetInspectionSignIn')();assert.ok(s.configCalls.length>calls,'Forget must resolve current values instead of using cached runtime configuration');assert.equal(s.configCalls.at(-1).folder.uri.fsPath,selected.uri.fsPath);assert.equal(s.secretValues.has(keyA),false);assert.equal(s.secretValues.has(keyB),true);assert.equal(s.secretValues.has(otherKey),true);}finally{await other?.cleanup();await s.cleanup();}
});

test('Forget rejects a removed selected workspace without falling back to global or another folder',async()=>{
 const {s,a,keyA,keyB}=await pair();
 try{await settings(s,a);s.vscode.workspace.workspaceFolders=[];s.vscode.workspace.getWorkspaceFolder=()=>undefined;s.vscode.window.activeTextEditor=undefined;const result=await s.commands.get('jadeNative.forgetInspectionSignIn')();assert.match(result.error,/selected inspection workspace.*(?:available|open)/i);assert.equal(s.secretValues.has(keyA),true);assert.equal(s.secretValues.has(keyB),true);assert.equal(s.secretCalls.filter(row=>row.operation==='delete').length,0);}finally{await s.cleanup();}
});

test('a settings change while Forget resolves current configuration cannot delete a stale scope',async()=>{
 const resolving=gate();let hold=false,lookups=0;const {s,a,b,keyA,keyB}=await pair({resolveConfig:(_doc,_folder,config)=>{const snapshot={...config,workspaceRoots:[...config.workspaceRoots]};if(hold){lookups++;return resolving.promise.then(()=>snapshot);}return snapshot;}});let forgetting;
 try{await settings(s,a);hold=true;forgetting=s.commands.get('jadeNative.forgetInspectionSignIn')();await turn();assert.equal(lookups,1,'Forget must resolve fresh configuration');await settings(s,b);resolving.finish();const result=await forgetting;assert.equal(result.cancelled,true);assert.equal(s.secretValues.has(keyA),true);assert.equal(s.secretValues.has(keyB),true);}finally{resolving.finish();await forgetting;await s.cleanup();}
});

test('Forget during old B preparation cancellation uses fresh selected A settings at the safe boundary',async()=>{
 const preparation=gate();let hold=false;const {s,a,keyA,keyB}=await pair({resolveInspectionTarget:async config=>{if(hold){await preparation.promise;if(config.signal.aborted)throw Error('Native preparation cancelled after safe completion.');}return config;}});let connecting,changed,forgetting;
 try{const released=s.controller.releaseForOperation();s.clients.at(-1).finishClose();await released;hold=true;connecting=s.commands.get('jadeNative.connectObjects')();await turn();Object.assign(s.config,a);changed=s.changeConfiguration({affectsConfiguration:()=>true});await turn();forgetting=s.commands.get('jadeNative.forgetInspectionSignIn')();await turn();assert.equal(s.secretValues.has(keyA),true);assert.equal(s.secretValues.has(keyB),true);preparation.finish();await Promise.all([connecting,changed,forgetting]);assert.equal(s.secretValues.has(keyA),false);assert.equal(s.secretValues.has(keyB),true);assert.equal(s.clients.length,2);}finally{preparation.finish();await Promise.allSettled([connecting,changed,forgetting]);await s.cleanup();}
});

for(const finishesWithChooserOpen of [false,true])test('same Working browse joins one preparation'+(finishesWithChooserOpen?' even if preparation finishes while its chooser is open':''),async()=>{
 const preparation=gate(),choice=gate();let prepares=0;const s=setup({closeAutomatically:true,resolveInspectionTarget:async config=>{prepares++;await preparation.promise;return config;}});let connecting,browsing;
 s.vscode.window.showQuickPick=async()=>{if(finishesWithChooserOpen)await choice.promise;return{target:'working',label:'Working database'};};
 try{connecting=s.commands.get('jadeNative.connectObjects')();await turn();browsing=s.controller.browseInstances(classIdentity(s));await turn();assert.equal(prepares,1);preparation.finish();if(finishesWithChooserOpen){const connected=await connecting;assert.equal(connected?.readOnly,true,'The browse chooser must not cancel the owned connection');choice.finish();}const [connected,result]=await Promise.all([connecting,browsing]);assert.equal(connected?.readOnly,true);assert.equal(result.available,true);assert.equal(result.target,'working');assert.equal(prepares,1);assert.equal(s.clients.length,1);assert.equal(s.sessionData[0].target,'working');assert.deepEqual(s.errors,[]);}finally{preparation.finish();choice.finish();await Promise.allSettled([connecting,browsing]);await s.cleanup();}
});

for(const transition of ['opposite target','different project'])test(transition+' still cancels old preparation before opening the requested context',async()=>{
 const preparation=gate(),targets=[];let originalSignal;const s=setup({closeAutomatically:true,projectScopedConfig:true,resolveInspectionTarget:async(config,target)=>{targets.push({target,root:config.workspaceRoots[0]});if(targets.length===1){originalSignal=config.signal;await preparation.promise;if(config.signal.aborted)throw Error('Native preparation cancelled after safe completion.');}return config;}});let connecting,browsing;
 s.vscode.window.showQuickPick=async()=>({target:transition==='opposite target'?'source':'working',label:'Selected database'});
 try{connecting=s.commands.get('jadeNative.connectObjects')();await turn();const identity=classIdentity(s);if(transition==='different project')identity.projectRoot=path.join(s.root,'other-project');browsing=s.controller.browseInstances(identity);await turn();assert.equal(originalSignal.aborted,true);assert.equal(targets.length,1,'New native context must wait for the old safe boundary');preparation.finish();const [connected,result]=await Promise.all([connecting,browsing]);assert.equal(connected.cancelled,true);assert.equal(result.available,true);assert.equal(targets.length,2);assert.equal(s.clients.length,1);assert.equal(result.target,transition==='opposite target'?'source':'working');assert.equal(result.projectRoot,identity.projectRoot);assert.deepEqual(s.errors,[]);}finally{preparation.finish();await Promise.allSettled([connecting,browsing]);await s.cleanup();}
});

test('a real configuration change cancels a pending connection and does not save its stale sign-in',async()=>{
 const preparation=gate();let hold=true,signal;const s=setup({closeAutomatically:true,resolveInspectionTarget:async config=>{if(hold){signal=config.signal;await preparation.promise;if(config.signal.aborted)throw Error('Native preparation cancelled after safe completion.');}return config;}});let connecting,changed;
 try{connecting=s.commands.get('jadeNative.connectObjects')();await turn();s.config.databasePath=path.join(s.root,'new-source');changed=s.changeConfiguration({affectsConfiguration:()=>true});await turn();assert.equal(signal.aborted,true);preparation.finish();const [result]=await Promise.all([connecting,changed]);assert.equal(result.cancelled,true);assert.equal(s.clients.length,0);assert.equal(s.secretValues.size,0);hold=false;assert.equal((await s.commands.get('jadeNative.connectObjects')()).readOnly,true);assert.equal(s.sessionData[0].databasePath,s.config.databasePath);}finally{preparation.finish();await Promise.allSettled([connecting,changed]);await s.cleanup();}
});

test('opening the browse chooser while original configuration resolves does not cancel its owned connection',async()=>{
 const configuration=gate(),choice=gate();let lookups=0,prepares=0;const s=setup({closeAutomatically:true,resolveConfig:(_doc,_folder,config)=>{const snapshot={...config,workspaceRoots:[...config.workspaceRoots]};return ++lookups===1?configuration.promise.then(()=>snapshot):snapshot;},resolveInspectionTarget:async config=>{prepares++;return config;}});let connecting,browsing;s.vscode.window.showQuickPick=async()=>{await choice.promise;return{target:'working',label:'Working database'};};
 try{connecting=s.commands.get('jadeNative.connectObjects')();await turn();browsing=s.controller.browseInstances(classIdentity(s));await turn();configuration.finish();assert.equal((await connecting)?.readOnly,true);assert.equal(prepares,1);choice.finish();assert.equal((await browsing).available,true);assert.equal(prepares,1);assert.equal(s.clients.length,1);assert.deepEqual(s.errors,[]);}finally{configuration.finish();choice.finish();await Promise.allSettled([connecting,browsing]);await s.cleanup();}
});

test('Connect rejects a pinned selected workspace after it is removed instead of resolving global defaults',async()=>{
 const {s,a}=await pair();
 try{await settings(s,a);s.vscode.workspace.workspaceFolders=[];s.vscode.workspace.getWorkspaceFolder=()=>undefined;s.vscode.window.activeTextEditor=undefined;const result=await s.commands.get('jadeNative.connectObjects')();assert.match(result?.error,/selected inspection workspace.*(?:available|open)/i);assert.equal(s.clients.length,2);assert.equal(s.secretValues.size,2);}finally{await s.cleanup();}
});
