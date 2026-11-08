'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../../test/fixtures/object-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let resolve;return{promise:new Promise(done=>resolve=done),finish:()=>resolve()};}
test('rapid Connect clicks join one native preparation and one catalogue request',async()=>{
 const backup=gate();let prepares=0;
 const s=setup({resolveInspectionTarget:async config=>{prepares++;await backup.promise;return config;}});
 try{const connects=Array.from({length:3},()=>s.commands.get('jadeNative.connectObjects')());await turn();assert.equal(prepares,1);backup.finish();await Promise.all(connects);assert.equal(s.clients.length,1);assert.equal(s.clients[0].requests.filter(row=>row.command==='catalog').length,1);assert.deepEqual(s.errors,[]);}finally{backup.finish();await s.cleanup();}
});
test('Connect immediately reports progress and disables repeat UI activation before native backup finishes',async()=>{
 const backup=gate();const s=setup({resolveInspectionTarget:async(config,target,output)=>{output('Creating a consistent native backup for Working ...\n');await backup.promise;output('Restoring the working database ...\n');return config;}});
 try{const connect=s.commands.get('jadeNative.connectObjects')();await turn();assert.equal(s.progressOperations.length,1);assert.equal(s.contexts.get('jadeNative.connectingObjects'),true);assert.equal(s.progressOperations[0].options.cancellable,true);assert.ok(s.progressOperations[0].reports.some(row=>/backup/i.test(row.message)));backup.finish();await connect;assert.ok(s.progressOperations[0].reports.some(row=>/restor/i.test(row.message)));assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);}finally{backup.finish();await s.cleanup();}
});
test('cancellation keeps Connect busy until the original native backup reaches its safe boundary',async()=>{
 const backup=gate();let signal,prepares=0,restores=0,settled=false;
 const s=setup({resolveInspectionTarget:async(config)=>{prepares++;signal=config.signal;await backup.promise;if(signal.aborted)throw Error('Native preparation cancelled at the safe backup boundary.');restores++;return config;}});
 try{const pending=s.commands.get('jadeNative.connectObjects')().then(result=>{settled=true;return result;});await turn();s.progressOperations[0].cancel();await turn();assert.equal(signal.aborted,true);assert.equal(settled,false);assert.equal(s.contexts.get('jadeNative.connectingObjects'),true);assert.match(s.progressOperations[0].reports.at(-1).message,/finish safely/);
 const repeated=s.commands.get('jadeNative.connectObjects')();assert.equal(prepares,1);backup.finish();assert.deepEqual(await pending,{cancelled:true});assert.deepEqual(await repeated,{cancelled:true});assert.equal(restores,0);assert.equal(s.clients.length,0);assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);assert.deepEqual(s.errors,[]);
 }finally{backup.finish();await s.cleanup();}
});
test('a failed Connect reports its native cause once and a later retry starts cleanly',async()=>{
 const backup=gate();let prepares=0;const s=setup({resolveInspectionTarget:async config=>{if(++prepares===1){await backup.promise;throw Error('Native backup failed (3094): database requires recovery.');}return config;}});
 try{const pending=Array.from({length:3},()=>s.commands.get('jadeNative.connectObjects')());await turn();backup.finish();await Promise.all(pending);assert.equal(s.errors.length,1);assert.match(s.errors[0],/3094.*requires recovery/);assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);await s.commands.get('jadeNative.connectObjects')();assert.equal(prepares,2);assert.equal(s.clients.length,1);}finally{backup.finish();await s.cleanup();}
});
test('Source inspection labels progress as Source and does not claim to prepare Working',async()=>{
 const s=setup();try{await s.commands.get('jadeNative.selectInspectionDatabase')();await s.commands.get('jadeNative.connectObjects')();assert.match(s.progressOperations[0].options.title,/Source database/);assert.ok(s.progressOperations[0].reports.every(row=>!/Source backup|Working restore/.test(row.message)));}finally{await s.cleanup();}
});
test('completed connection progress ignores later output from the retained inspector',async()=>{
 const s=setup();try{await s.commands.get('jadeNative.connectObjects')();const reports=s.progressOperations[0].reports.length;s.clients[0].emit('output','Reading another object ...\n');assert.equal(s.progressOperations[0].reports.length,reports);}finally{await s.cleanup();}
});
test('settings changes cancel pending preparation and wait for it before clearing the connection operation',async()=>{
 const backup=gate();let signal,settled=false;const s=setup({resolveInspectionTarget:async config=>{signal=config.signal;await backup.promise;return config;}});
 try{const pending=s.commands.get('jadeNative.connectObjects')();await turn();const changed=s.changeConfiguration({affectsConfiguration:()=>true}).then(()=>{settled=true;});await turn();assert.equal(signal.aborted,true);assert.equal(settled,false);backup.finish();await Promise.all([pending,changed]);assert.equal(s.clients.length,0);assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);}finally{backup.finish();await s.cleanup();}
});
test('the existing database view replaces disconnected/Connect controls with pending connection state',async()=>{
 const backup=gate();const s=setup({resolveInspectionTarget:async config=>{await backup.promise;return config;}});
 try{const pending=s.commands.get('jadeNative.connectObjects')();await turn();const controls=await s.controller.provider.getChildren();assert.ok(controls.some(row=>row.name==='Cancel connection'));assert.ok(controls.every(row=>row.command!=='jadeNative.connectObjects'));assert.doesNotMatch(s.controller.view.message,/Disconnected/);assert.match(s.statuses[0].text,/Connecting/);backup.finish();await pending;assert.match(s.statuses[0].text,/Read-only/);}finally{backup.finish();await s.cleanup();}
});
test('closing the extension during pending preparation does not update disposed database controls',async()=>{
 const backup=gate();const s=setup({resolveInspectionTarget:async config=>{await backup.promise;return config;}});
 try{const pending=s.commands.get('jadeNative.connectObjects')();await turn();s.disposeExtension();Object.defineProperty(s.statuses[0],'text',{set(){throw Error('Status bar is disposed.');}});Object.defineProperty(s.controller.view,'description',{set(){throw Error('Tree view is disposed.');}});backup.finish();await pending;assert.deepEqual(s.errors,[]);assert.equal(s.clients.length,0);}finally{backup.finish();await s.cleanup();}
});
test('Browse Instances switches from pending Working preparation to a fresh Source connection',async()=>{
 const backup=gate();const targets=[];const s=setup({resolveInspectionTarget:async(config,target)=>{targets.push(target);if(target==='working')await backup.promise;return config;}});let pending,browse;
 try{pending=s.commands.get('jadeNative.connectObjects')();await turn();s.vscode.window.showQuickPick=async()=>({target:'source',label:'Source database'});browse=s.controller.browseInstances({schema:'Pets',className:'Fish',projectRoot:require('node:path').join(s.root,'source')});await turn();backup.finish();const [,result]=await Promise.all([pending,browse]);assert.equal(result.available,true);assert.equal(result.target,'source');assert.deepEqual(targets,['working','source']);assert.deepEqual(s.errors,[]);}finally{backup.finish();await Promise.allSettled([pending,browse]);await s.cleanup();}
});
for(const stage of ['username','password'])test('cancelling pending '+stage+' sign-on dismisses the prompt before operation handoff',async()=>{
 const input=gate();const s=setup({authentication:true});let seenToken,pending;
 s.vscode.window.showInputBox=async(options,token)=>{if((stage==='password')!==Boolean(options.password))return'developer';seenToken=token;token?.onCancellationRequested(()=>input.finish());return input.promise;};
 try{pending=s.commands.get('jadeNative.connectObjects')();await turn();assert.ok(seenToken,'The sign-on prompt needs the connection cancellation token');let released=false;const release=s.controller.releaseForOperation().then(()=>{released=true;});await turn();assert.equal(seenToken.isCancellationRequested,true);assert.equal(released,true);await release;assert.deepEqual(await pending,{cancelled:true});assert.equal(s.clients.length,1);assert.equal(s.controller.session.client,undefined);assert.deepEqual(s.errors,[]);}finally{input.finish();await pending;await s.cleanup();}
});
