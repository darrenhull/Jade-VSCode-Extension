'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../../test/fixtures/object-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('Connect offers inspection sign-on before an otherwise anonymous catalogue succeeds',async()=>{
 const s=setup();
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,2);assert.equal(s.prompts[1].password,true);assert.equal(s.sessionData[0].user,'developer');assert.equal(s.sessionData[0].password,'private-password');assert.ok(s.outputLines.every(text=>!text.includes('private-password')));}finally{await s.cleanup();}
});
test('explicit empty inspection user connects anonymously without asking for a password',async()=>{
 const s=setup();s.vscode.window.showInputBox=async options=>{s.prompts.push(options);return '';};
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,1);assert.match(s.prompts[0].prompt,/leave blank.*anonymous/i);assert.equal(s.sessionData[0].user,undefined);assert.equal(s.sessionData[0].password,undefined);}finally{await s.cleanup();}
});
test('cancelled startup sign-on never starts database preparation or opens a native session',async()=>{
 let prepares=0;const s=setup({resolveInspectionTarget:async config=>{prepares++;return config;}});s.vscode.window.showInputBox=async()=>undefined;
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(prepares,0);assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);}finally{await s.cleanup();}
});
test('a policy denial under a class offers explicit Sign In instead of a refresh loop',async()=>{
 const s=setup();
 try{await s.connect();const schema=(await s.controller.provider.getChildren()).find(row=>row.kind==='schema');const cls=(await s.controller.provider.getChildren(schema))[0];s.clients[0].request=async()=>{throw Error('Application inspection policy denied this object.');};const rows=await s.controller.provider.getChildren(cls);assert.equal(rows[0].command,'jadeNative.signInObjects');assert.match(rows[0].name,/Sign in/);assert.equal(rows[0].description,"Access denied");assert.match(rows[0].tooltip,/application.*credentials/i);assert.equal(s.prompts.length,2);}finally{await s.cleanup();}
});

test('explicit Sign In reconnects once and never reuses the prior connection credentials',async()=>{
 const s=setup();
 try{await s.connect();const first=s.clients[0];s.vscode.window.showInputBox=async options=>options.password?'replacement-password':'replacement-user';const a=s.commands.get('jadeNative.signInObjects')(),b=s.commands.get('jadeNative.signInObjects')();await turn();assert.equal(first.stopCalled,true);first.finishClose();await Promise.all([a,b]);assert.equal(s.clients.length,2);assert.equal(s.sessionData[1].user,'replacement-user');assert.equal(s.sessionData[1].password,'replacement-password');assert.equal(s.sessionData[0].user,'developer');assert.ok(s.outputLines.every(text=>!text.includes('replacement-password')));}finally{await s.cleanup();}
});
test('a native policy rejection is retained and offers a user-started sign-in action without automatic retry',async()=>{
 const s=setup({authentication:true});s.vscode.window.showInputBox=async()=>'';const errors=[];s.vscode.window.showErrorMessage=async(message,...actions)=>{errors.push({message,actions});};
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(s.clients.length,1);assert.equal(s.prompts.length,0);assert.equal(errors.length,1);assert.deepEqual(errors[0].actions,['Sign In…']);assert.match(errors[0].message,/Access denied/);}finally{await s.cleanup();}
});

test('changing database while inspection password is pending discards the late secret',async()=>{
 const s=setup();let resolvePassword,token;const password=new Promise(resolve=>resolvePassword=resolve);s.vscode.window.showInputBox=async(options,cancellation)=>{if(!options.password)return'developer';token=cancellation;return password;};let pending;
 try{pending=s.commands.get('jadeNative.connectObjects')();await turn();assert.ok(token);await s.commands.get('jadeNative.selectInspectionDatabase')();assert.equal(token.isCancellationRequested,true);resolvePassword('late-password');await pending;assert.equal(s.clients.length,0);assert.equal(s.controller.session.target,'source');assert.deepEqual(s.errors,[]);}finally{resolvePassword?.('late-password');await pending;await s.cleanup();}
});
test('accepted credentials are reused across Source and Working for the same configured Source',async()=>{
 const s=setup();
 try{await s.connect();assert.equal(s.prompts.length,2);const first=s.clients[0],switching=s.controller.session.select('working');first.finishClose();await switching;s.vscode.window.showInputBox=async()=>{throw Error('Do not prompt again for the same connection');};await s.commands.get('jadeNative.connectObjects')();assert.equal(s.sessionData.length,2);assert.equal(s.sessionData[1].user,'developer');assert.equal(s.sessionData[1].password,'private-password');assert.equal(s.configFiles.length,0);}finally{await s.cleanup();}
});

test('a stale policy notification cannot sign in to a newly selected target',async()=>{
 const s=setup({authentication:true});s.vscode.window.showInputBox=async()=>'';let choose;const notification=new Promise(resolve=>choose=resolve);let notifications=0;s.vscode.window.showErrorMessage=async()=>notifications++===0?notification:undefined;
 try{await s.commands.get('jadeNative.connectObjects')();await s.commands.get('jadeNative.selectInspectionDatabase')();assert.equal(s.controller.session.target,'source');choose('Sign In…');await turn();assert.equal(s.clients.length,1);assert.equal(s.progressOperations.length,1);}finally{choose?.(undefined);await s.cleanup();}
});
test('target selection cancels a password pending during explicit Sign In without a transition deadlock',async()=>{
 const s=setup({closeSubsequentAutomatically:true});let finishPassword,seenToken;const password=new Promise(resolve=>finishPassword=resolve);let signing,changing;
 try{await s.connect();const first=s.clients[0];s.vscode.window.showInputBox=async(options,token)=>{if(!options.password)return'developer';seenToken=token;return password;};signing=s.commands.get('jadeNative.signInObjects')();await turn();first.finishClose();await turn();assert.ok(seenToken);s.vscode.window.showQuickPick=async()=>({target:'working'});changing=s.commands.get('jadeNative.selectInspectionDatabase')();await turn();assert.equal(seenToken.isCancellationRequested,true);finishPassword('discarded-password');await Promise.all([signing,changing]);assert.equal(s.controller.session.target,'working');assert.equal(s.clients.length,1);assert.deepEqual(s.errors,[]);}finally{finishPassword?.('discarded-password');await Promise.allSettled([signing,changing]);await s.cleanup();}
});

test('a build handoff and later native reconnect reuse accepted window-session credentials',async()=>{
 const s=setup();
 try{await s.connect();const releasing=s.controller.releaseForOperation();s.clients[0].finishClose();await releasing;await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,2);assert.equal(s.sessionData[1].user,'developer');assert.equal(s.sessionData[1].password,'private-password');}finally{await s.cleanup();}
});
test('a nonempty inspection user accepts and reuses an empty password',async()=>{
 const s=setup();let prompts=0;s.vscode.window.showInputBox=async options=>{prompts++;return options.password?'':'blank-password-user';};
 try{await s.connect();const releasing=s.controller.releaseForOperation();s.clients[0].finishClose();await releasing;await s.commands.get('jadeNative.connectObjects')();assert.equal(prompts,2);assert.equal(s.sessionData[0].password,'');assert.equal(s.sessionData[1].user,'blank-password-user');assert.equal(s.sessionData[1].password,'');}finally{await s.cleanup();}
});
test('explicit anonymous access is remembered for this configured window connection',async()=>{
 const s=setup();let prompts=0;s.vscode.window.showInputBox=async()=>{prompts++;return '';};
 try{await s.connect();const releasing=s.controller.releaseForOperation();s.clients[0].finishClose();await releasing;await s.commands.get('jadeNative.connectObjects')();assert.equal(prompts,1);assert.equal(s.sessionData[1].user,undefined);assert.equal(s.sessionData[1].password,undefined);}finally{await s.cleanup();}
});
for(const changed of ['unrelated timeout','Source identity'])test('a '+changed+' setting change '+(changed==='Source identity'?'invalidates':'retains')+' accepted inspection credentials',async()=>{
 const s=setup();
 try{await s.connect();if(changed==='Source identity')s.config.databasePath=require('node:path').join(s.root,'different-source');else s.config.testTimeoutSeconds=900;const changing=s.changeConfiguration({affectsConfiguration:()=>true});s.clients[0].finishClose();await changing;await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,changed==='Source identity'?4:2);assert.equal(s.sessionData.length,2);}finally{await s.cleanup();}
});
test('cancelling a new environment sign-on never sends the previous environment credentials',async()=>{
 const s=setup();let freshPrompts=0;
 try{await s.connect();s.config.databasePath=require('node:path').join(s.root,'other-environment');const changing=s.changeConfiguration({affectsConfiguration:()=>true});s.clients[0].finishClose();await changing;s.vscode.window.showInputBox=async()=>{freshPrompts++;return undefined;};await s.commands.get('jadeNative.connectObjects')();assert.equal(freshPrompts,1);assert.equal(s.sessionData.length,1);assert.deepEqual(s.errors,[]);}finally{await s.cleanup();}
});

test('each denied class keeps a unique action identity and stale row actions cannot reconnect another target',async()=>{
 const s=setup();
 try{await s.connect();const schema=(await s.controller.provider.getChildren()).find(row=>row.kind==='schema');const cls=(await s.controller.provider.getChildren(schema))[0];s.clients[0].request=async()=>{throw Error('Application inspection policy denied this object.');};const first=(await s.controller.provider.getChildren(cls))[0],second=(await s.controller.provider.getChildren({...cls,oid:'9002.3',name:'OtherClass'}))[0];assert.notEqual(s.controller.provider.getTreeItem(first).id,s.controller.provider.getTreeItem(second).id);const switching=s.controller.session.select('working');s.clients[0].finishClose();await switching;const before=s.progressOperations.length;await s.commands.get(first.command)(...(first.args||[]));assert.equal(s.progressOperations.length,before);assert.equal(s.clients.length,1);}finally{await s.cleanup();}
});

test('a new extension context reuses the standard saved SecretStorage entry for the same configured connection',async()=>{
 const values=new Map(),secrets={get:async key=>values.get(key),store:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key)};const first=setup({secretStorage:secrets}),next=setup({secretStorage:secrets});Object.assign(next.config,first.config);
 try{await first.connect();assert.equal(values.size,1);await next.commands.get('jadeNative.connectObjects')();assert.equal(next.prompts.length,0);assert.equal(next.sessionData[0].user,'developer');assert.equal(next.sessionData[0].password,'private-password');}finally{await first.cleanup();await next.cleanup();}
});
test('Forget removes only this saved sign-in and closes its owned inspection without changing database files',async()=>{
 const s=setup(),fs=require('node:fs'),path=require('node:path');
 try{await s.connect();const savedKey=[...s.secretValues.keys()][0];s.secretValues.set('unrelated-entry','unrelated secure value');fs.mkdirSync(s.config.databasePath,{recursive:true});const control=path.join(s.config.databasePath,'_control.dat');fs.writeFileSync(control,'fixture sentinel');const pending=s.commands.get('jadeNative.forgetInspectionSignIn')();await turn();assert.equal(s.clients[0].stopCalled,true);s.clients[0].finishClose();assert.equal((await pending).forgotten,true);assert.equal(s.secretValues.has(savedKey),false);assert.equal(s.secretValues.get('unrelated-entry'),'unrelated secure value');assert.equal(s.controller.session.client,undefined);assert.equal(fs.readFileSync(control,'utf8'),'fixture sentinel');await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,4);}finally{await s.cleanup();}
});
test('a later initial native authentication rejection deletes its saved entry without automatic password retries',async()=>{
 const s=setup({authentication:(_config,index)=>index===1});
 try{await s.connect();const releasing=s.controller.releaseForOperation();s.clients[0].finishClose();await releasing;await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,2);assert.equal(s.secretValues.size,0);assert.ok(s.secretCalls.some(row=>row.operation==='delete'));assert.match(s.errors.at(-1),/Access denied/);await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,4);assert.equal(s.secretValues.size,1);}finally{await s.cleanup();}
});
test('per-object policy denial retains accepted saved credentials for other allowed classes',async()=>{
 const s=setup();
 try{await s.connect();const schema=(await s.controller.provider.getChildren()).find(row=>row.kind==='schema'),cls=(await s.controller.provider.getChildren(schema))[0];s.clients[0].request=async()=>{throw Error('Application inspection policy denied this object.');};await s.controller.provider.getChildren(cls);assert.equal(s.secretValues.size,1);assert.equal(s.secretCalls.filter(row=>row.operation==='delete').length,0);}finally{await s.cleanup();}
});
test('SecretStorage read failure is actionable before credentials or native preparation and has no fallback',async()=>{
 let prepares=0;const s=setup({secretStorage:{get:async()=>{throw Error('private-provider-error');},store:async()=>{},delete:async()=>{}},resolveInspectionTarget:async config=>{prepares++;return config;}});
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(s.prompts.length,0);assert.equal(prepares,0);assert.equal(s.clients.length,0);assert.match(s.errors[0],/VS Code secure credential storage/);assert.ok(!s.errors[0].includes('private-provider-error'));}finally{await s.cleanup();}
});
test('SecretStorage save failure closes inspection and never claims a successful saved sign-in',async()=>{
 const s=setup({secretStorage:{get:async()=>undefined,store:async()=>{throw Error('private-provider-error');},delete:async()=>{}}});let pending;
 try{pending=s.commands.get('jadeNative.connectObjects')();await turn();assert.equal(s.clients[0].stopCalled,true);s.clients[0].finishClose();await pending;assert.equal(s.controller.session.client,undefined);assert.match(s.errors[0],/VS Code secure credential storage/);assert.ok(s.outputLines.every(text=>!text.includes('private-provider-error')&&!text.includes('private-password')));}finally{await pending;await s.cleanup();}
});
test('a delayed secure-store read cannot pass saved credentials to a superseded target',async()=>{
 let finishRead,prepares=0;const read=new Promise(resolve=>finishRead=resolve);const s=setup({secretStorage:{get:async()=>read,store:async()=>{},delete:async()=>{}},resolveInspectionTarget:async config=>{prepares++;return config;}});let pending,changing;
 try{pending=s.commands.get('jadeNative.connectObjects')();await turn();changing=s.commands.get('jadeNative.selectInspectionDatabase')();await turn();finishRead(JSON.stringify({user:'old-user',password:'old-password'}));await Promise.all([pending,changing]);assert.equal(prepares,0);assert.equal(s.clients.length,0);assert.equal(s.controller.session.target,'source');assert.deepEqual(s.errors,[]);}finally{finishRead?.(undefined);await Promise.allSettled([pending,changing]);await s.cleanup();}
});
test('Forget waits for an in-flight accepted save then deletes it so a late store cannot resurrect credentials',async()=>{
 const values=new Map();let finishStore;const saving=new Promise(resolve=>finishStore=resolve);const secrets={get:async key=>values.get(key),store:async(key,value)=>{await saving;values.set(key,value);},delete:async key=>values.delete(key)};const s=setup({secretStorage:secrets});let connecting,forgetting;
 try{connecting=s.commands.get('jadeNative.connectObjects')();await turn();assert.equal(s.clients.length,1);forgetting=s.commands.get('jadeNative.forgetInspectionSignIn')();await turn();s.clients[0].finishClose();finishStore();await Promise.all([connecting,forgetting]);assert.equal(values.size,0);assert.equal(s.controller.session.client,undefined);assert.deepEqual(s.errors,[]);}finally{finishStore?.();await Promise.allSettled([connecting,forgetting]);await s.cleanup();}
});

for(const step of ['username','password'])test('cancelling replacement at '+step+' preserves the accepted saved sign-in',async()=>{
 const s=setup();let pending;
 try{await s.connect();const saved=[...s.secretValues.entries()],first=s.clients[0];s.vscode.window.showInputBox=async options=>step==='username'||options.password?undefined:'replacement-user';pending=s.commands.get('jadeNative.signInObjects')();await turn();first.finishClose();await pending;assert.deepEqual([...s.secretValues.entries()],saved);assert.equal(s.clients.length,1);assert.equal(s.secretCalls.filter(row=>row.operation==='delete').length,0);assert.deepEqual(s.errors,[]);}finally{await pending;await s.cleanup();}
});
test('native rejection of newly entered replacement preserves the earlier saved sign-in',async()=>{
 const s=setup({authentication:config=>config.user==='replacement-user'});let pending;
 try{await s.connect();const saved=[...s.secretValues.entries()],first=s.clients[0];s.vscode.window.showInputBox=async options=>options.password?'wrong-replacement-password':'replacement-user';pending=s.commands.get('jadeNative.signInObjects')();await turn();first.finishClose();await pending;assert.deepEqual([...s.secretValues.entries()],saved);assert.equal(s.secretCalls.filter(row=>row.operation==='delete').length,0);assert.match(s.errors.at(-1),/Access denied/);}finally{await pending;await s.cleanup();}
});

for(const target of ['working','source'])test('sign-on fields stay concise and normal while identifying '+target+' and allowing a blank password',async()=>{
 const s=setup();
 try{if(target==='source')await s.commands.get('jadeNative.selectInspectionDatabase')();await s.commands.get('jadeNative.connectObjects')();const [user,password]=s.prompts;const label=target==='working'?'Working':'Source';for(const field of [user,password]){assert.doesNotMatch(field.prompt,/secure|storage|settings|forget/i,'Storage implementation details belong in documentation, not the input prompt.');assert.ok(field.prompt.length<100,'A sign-on input should contain one short instruction.');}assert.match(user.title,new RegExp(label));assert.match(password.title,new RegExp(label));assert.match(user.prompt,/anonymous/i);assert.match(password.prompt,/leave blank if no password/i);assert.equal(password.password,true);}finally{await s.cleanup();}
});
