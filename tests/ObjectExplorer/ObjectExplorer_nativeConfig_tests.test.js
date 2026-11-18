'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {setup}=require('../../test/fixtures/object-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('native source roots do not replace the inspection project scope or selected configuration watcher',async()=>{
 let selectedRoot,configFile;
 const f=setup({closeAutomatically:true,resolveConfig:(_document,folder,base)=>{
  selectedRoot=folder.uri.fsPath;configFile=path.join(selectedRoot,'custom-project.json');
  return{...base,cwd:selectedRoot,configFile,workspaceRoots:[path.join(selectedRoot,'sources')]};
 }});
 try{
  await f.commands.get('jadeNative.connectObjects')();assert.equal(f.clients.length,1);
  await f.controller.releaseForOperation();await f.commands.get('jadeNative.connectObjects')();
  assert.equal(f.configCalls.at(-1).folder.uri.fsPath,selectedRoot,'Reconnect replaced the project with its nested source root');
  const client=f.clients.at(-1);await f.saveConfiguration(configFile);
  assert.equal(client.stopCalled,true);assert.equal(f.controller.session.client,undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});
test('saving the selected native config while preparation is pending cancels that original connection',async()=>{
 let finish,signal,configFile;
 const gate=new Promise(resolve=>finish=resolve);
 const f=setup({closeAutomatically:true,resolveConfig:(_document,folder,base)=>{configFile=path.join(folder.uri.fsPath,'custom-project.json');return{...base,cwd:folder.uri.fsPath,configFile,workspaceRoots:[path.join(folder.uri.fsPath,'sources')]};},resolveInspectionTarget:async config=>{signal=config.signal;await gate;return config;}});
 let connection,save;
 try{
  connection=f.commands.get('jadeNative.connectObjects')();await turn();
  save=f.saveConfiguration(configFile);await turn();assert.equal(signal.aborted,true);
  finish();await Promise.all([connection,save]);assert.equal(f.clients.length,0);assert.deepEqual(f.errors,[]);
 }finally{finish();await Promise.allSettled([connection,save]);await f.cleanup();}
});

test('JOX anonymous sign-on remains explicit for native profile resolution on target and paged transport',async()=>{
 let targeted;
 const f=setup({closeAutomatically:true,resolveConfig:(_document,_folder,base)=>({...base,sourceFormat:'jox',connection:'private-profile'}),resolveInspectionTarget:async config=>{targeted=config;return config;}});
 f.vscode.window.showInputBox=async()=>'';
 try{
  await f.commands.get('jadeNative.connectObjects')();
  for(const config of [targeted,f.sessionData[0]]){assert.equal(config.user,'','Missing anonymous user lets native resolve restore private-profile credentials');assert.equal(config.password,'');assert.equal(config.connection,'private-profile');}
  assert.deepEqual(f.errors,[]);
 }finally{await f.cleanup();}
});