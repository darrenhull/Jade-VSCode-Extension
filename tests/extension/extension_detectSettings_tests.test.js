'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const sourcePath=path.resolve(__dirname,'../../extension/src/extension.js');
function setup({missingDatabase=false,iniExists=true}={}){
 const uri={fsPath:'C:/selected'},folder={uri},updates=[],messages=[];
 const settings={get:key=>key==='installPath'?'C:/Jade':undefined,update:async(...args)=>updates.push(args)};
 const vscode={workspace:{getWorkspaceFolder:value=>value===uri?folder:undefined,workspaceFolders:[{uri:{fsPath:'C:/wrong'}}],getConfiguration:(_name,resource)=>{assert.equal(resource,uri);return settings;}},window:{showQuickPick:async(items,options)=>options.title==='Choose Jade installation folder'?items[0]:({value:'singleUser'}),showInformationMessage:async text=>messages.push(text)},ConfigurationTarget:{WorkspaceFolder:3}};
 const realRequire=createRequire(sourcePath),module={exports:{}};
 const requireModule=name=>name==='vscode'?vscode:name==='node:fs'?{...fs,readdirSync:()=>[],existsSync:file=>!String(file).endsWith('jade.ini')||iniExists}:name==='./config'?{...realRequire(name),inspectInstall:installPath=>({installPath,databasePath:missingDatabase?undefined:'C:/Jade/system',iniPath:'C:/Jade/system/jade.ini'})}:realRequire(name);
 vm.runInNewContext(fs.readFileSync(sourcePath,'utf8')+'\nmodule.exports.detectSettings=detectSettings; module.exports.detectSettingsCommand=typeof detectSettingsCommand==="function"?detectSettingsCommand:undefined;',{require:requireModule,module,exports:module.exports,process:{platform:'win32',env:{}},__dirname:path.dirname(sourcePath),console});
 return{run:(token,options)=>module.exports.detectSettings(uri,token,options),command:token=>module.exports.detectSettingsCommand(uri,token),vscode,updates,messages,settings};
}
test('runtime wizard uses the explicitly selected workspace resource and saves only to that folder',async()=>{
 const s=setup();await s.run();assert.equal(s.updates.length,4);assert.ok(s.updates.every(row=>row[2]===3));assert.deepEqual(s.messages,['Jade runtime settings saved. You can now connect to Database Objects.']);
});
test('cancelled runtime wizard does not write settings or report setup success',async()=>{
 const s=setup();s.vscode.window.showQuickPick=async()=>undefined;await s.run();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
});
test('detected installations retain an explicit Browse choice and explain the installation root',async()=>{
 const s=setup();let dialog;
 s.vscode.window.showQuickPick=async(items,options)=>{if(options.title==='Choose Jade installation folder'){assert.match(options.placeHolder,/bin\/jom.dll/);return items.find(item=>item.browse);}return{value:'multiUser'};};
 s.vscode.window.showOpenDialog=async options=>{dialog=options;return[{fsPath:'C:/AnotherJade'}];};
 await s.run();assert.match(dialog.title,/installation folder.*bin\/jom.dll/i);assert.ok(s.updates.some(row=>row[0]==='installPath'&&row[1]==='C:/AnotherJade'));
});
test('cancelling Browse leaves workspace settings unchanged',async()=>{
 const s=setup();s.vscode.window.showQuickPick=async items=>items.find(item=>item.browse);s.vscode.window.showOpenDialog=async()=>undefined;
 await s.run();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
});
test('cancelling server-mode selection leaves workspace settings unchanged',async()=>{
 const s=setup();s.vscode.window.showQuickPick=async(items,options)=>options.title==='Choose Jade installation folder'?items[0]:undefined;
 await s.run();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
});

function cancellation(){const listeners=new Set(),token={isCancellationRequested:false,onCancellationRequested:listener=>{listeners.add(listener);return{dispose:()=>listeners.delete(listener)};}};return{token,listeners,cancel(){token.isCancellationRequested=true;for(const listener of [...listeners])listener();}};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
for(const stage of ['installation','browse','database','ini','mode'])test('Connect cancellation releases the '+stage+' wizard wait and ignores late selections',async()=>{
 const s=setup({missingDatabase:stage==='database',iniExists:stage!=='ini'}),source=cancellation();let choose,settled=false;
 const hold=()=>new Promise(resolve=>choose=resolve);
 s.vscode.window.showQuickPick=async(items,options,token)=>{if(options.title==='Choose Jade installation folder'){if(stage==='installation')return hold();return stage==='browse'?items.find(item=>item.browse):items[0];}if(stage==='mode')return hold();return{value:'singleUser'};};
 s.vscode.window.showOpenDialog=async()=>hold();
 const pending=s.run(source.token).then(value=>{settled=true;return value;});
 try{await turn();assert.equal(typeof choose,'function');source.cancel();await turn();assert.equal(settled,true);await pending;assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);assert.equal(source.listeners.size,0);choose(stage==='mode'?{value:'singleUser'}:[{fsPath:'C:/late'}]);await turn();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
 }finally{source.cancel();choose?.();await pending;}
});

test('already cancelled discovery shows no prompt or writes',async()=>{const s=setup(),source=cancellation();source.cancel();s.vscode.window.showQuickPick=()=>assert.fail('Cancelled setup must not show a prompt');await s.run(source.token);assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);assert.equal(source.listeners.size,0);});

test('successful token-scoped discovery disposes prompt listeners',async()=>{const s=setup(),source=cancellation();await s.run(source.token);assert.equal(s.updates.length,4);assert.equal(source.listeners.size,0);});

test('cancellation after saving starts completes the coherent settings commit without success messaging',async()=>{const s=setup(),source=cancellation();s.settings.update=async(...args)=>{s.updates.push(args);source.cancel();};await s.run(source.token);assert.equal(s.updates.length,4);assert.deepEqual(s.messages,[]);assert.equal(source.listeners.size,0);});

test('Connect waits for an already-started settings commit before cancelled completion',async()=>{
 const s=setup(),source=cancellation();let finish,settled=false;
 s.settings.update=async(...args)=>{s.updates.push(args);if(s.updates.length===1)await new Promise(resolve=>finish=resolve);};
 const pending=s.run(source.token).then(value=>{settled=true;return value;});
 try{await turn();source.cancel();await turn();assert.equal(settled,false);finish();await pending;assert.equal(s.updates.length,4);assert.deepEqual(s.messages,[]);assert.equal(source.listeners.size,0);}finally{finish?.();await pending;}
});

test('saved guidance never holds a completed wizard or permits further writes',async()=>{
 const s=setup(),source=cancellation();let dismiss,settled=false;s.vscode.window.showInformationMessage=()=>new Promise(resolve=>dismiss=resolve);
 const pending=s.run(source.token).then(value=>{settled=true;return value;});
 try{await turn();assert.equal(s.updates.length,4);assert.equal(settled,true);source.cancel();await turn();assert.equal(settled,true);await pending;assert.equal(source.listeners.size,0);dismiss();await turn();assert.equal(s.updates.length,4);}finally{source.cancel();dismiss?.();await pending;}
});

test('a partial settings-save failure reports completed fields and retains its cause',async()=>{const s=setup();s.settings.update=async(...args)=>{if(s.updates.length===1)throw Error('Workspace settings locked');s.updates.push(args);};await assert.rejects(s.run(),/1 of 4.*Workspace settings locked/);assert.equal(s.updates.length,1);assert.deepEqual(s.messages,[]);});

for(const [name,replacement] of [['removed',undefined],['remapped',{uri:{fsPath:'C:/'}}]])test(name+' workspace scope cannot receive runtime settings',async()=>{
 const s=setup();let choose;s.vscode.window.showQuickPick=async(items,options)=>options.title==='Choose Jade installation folder'?items[0]:new Promise(resolve=>choose=resolve);
 const pending=s.run();try{await turn();s.vscode.workspace.getWorkspaceFolder=()=>replacement;choose({value:'singleUser'});await pending;assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);}finally{choose?.();await pending;}
});

test('scope changes during commit stop further writes with explicit partial-save failure',async()=>{const s=setup();s.settings.update=async(...args)=>{s.updates.push(args);s.vscode.workspace.getWorkspaceFolder=()=>({uri:{fsPath:'C:/'}});};await assert.rejects(s.run(),/1 of 4.*workspace folder changed/i);assert.equal(s.updates.length,1);assert.deepEqual(s.messages,[]);});

test('the discover command reports save failure without waiting on its error notification',async()=>{
 const s=setup();let dismiss,message,settled=false;s.settings.update=async()=>{throw Error('Workspace settings locked');};s.vscode.window.showErrorMessage=value=>{message=value;return new Promise(resolve=>dismiss=resolve);};let pending;
 try{pending=s.command().then(()=>settled=true);await turn();assert.equal(settled,true);assert.match(message,/0 of 4.*Workspace settings locked/);await pending;}finally{dismiss?.();await pending;}
});

test('the discover command forwards its optional cancellation token',async()=>{
 const s=setup(),source=cancellation();let choose,settled=false,pending;s.vscode.window.showQuickPick=()=>new Promise(resolve=>choose=resolve);
 try{pending=s.command(source.token).then(()=>settled=true);await turn();source.cancel();await turn();assert.equal(settled,true);await pending;assert.deepEqual(s.updates,[]);assert.equal(source.listeners.size,0);}finally{source.cancel();choose?.();await pending;}
});

test('checkout runtime detection saves installation and seed without requiring a Source INI or server',async()=>{const s=setup({iniExists:false});s.vscode.window.showOpenDialog=async options=>{assert.match(options.title,/approved vendor-only Fresh Copy/);return[{fsPath:'C:/ApprovedVendorSeed'}];};await s.run(undefined,{checkout:true});assert.deepEqual(s.updates.map(row=>row[0]),['installPath','workingSeedDirectory']);assert.equal(s.updates[1][1],'C:/ApprovedVendorSeed');assert.ok(s.updates.every(row=>row[2]===3));});

test('checkout runtime detection can stage values until accepted setup commits them',async()=>{const s=setup({iniExists:false});s.vscode.window.showOpenDialog=async()=>[{fsPath:'C:/VendorSeed'}];const staged=await s.run(undefined,{checkout:true,deferSave:true});assert.deepEqual(s.updates,[]);assert.equal(staged.settings.workingSeedDirectory,'C:/VendorSeed');await staged.commit();assert.deepEqual(s.updates.map(row=>row[0]),['installPath','workingSeedDirectory']);await staged.rollback();assert.deepEqual(s.updates.slice(2).map(row=>row[1]),['C:/Jade',undefined]);});

test('deferred settings rollback removes new folder overrides instead of pinning inherited defaults',async()=>{const s=setup();const overrides=new Map(),update=s.settings.update;s.settings.inspect=key=>({workspaceFolderValue:overrides.get(key)});s.settings.update=async(...args)=>{await update(...args);overrides.set(args[0],args[1]);};s.vscode.window.showOpenDialog=async()=>[{fsPath:'C:/VendorSeed'}];const staged=await s.run(undefined,{checkout:true,deferSave:true});await staged.commit();await staged.rollback();assert.deepEqual(s.updates.slice(2).map(row=>row[1]),[undefined,undefined]);});

test('staged native seed paths expand variables while persisted settings remain raw',async()=>{const s=setup();s.settings.get=key=>key==='installPath'?'C:/Jade':key==='workingSeedDirectory'?'$'+'{workspaceFolder}/vendor-seed':undefined;const staged=await s.run(undefined,{checkout:true,deferSave:true});assert.equal(staged.settings.workingSeedDirectory,'C:/selected/vendor-seed');await staged.commit();assert.equal(s.updates[1][1],'$'+'{workspaceFolder}/vendor-seed');});
test('deferred commit preserves concurrent edits and rollback restores only successful owned writes',async()=>{const s=setup(),values=new Map([['installPath','C:/Jade']]);s.settings.inspect=key=>({workspaceFolderValue:values.get(key)});s.settings.get=key=>values.get(key);s.vscode.window.showOpenDialog=async()=>[{fsPath:'C:/VendorSeed'}];s.settings.update=async(key,value,target)=>{s.updates.push([key,value,target]);values.set(key,value);if(key==='installPath'&&s.updates.length===1)values.set('workingSeedDirectory','C:/UserSeed');};const staged=await s.run(undefined,{checkout:true,deferSave:true});await assert.rejects(staged.commit(),/changed/i);await staged.rollback();assert.equal(values.get('workingSeedDirectory'),'C:/UserSeed');assert.equal(values.get('installPath'),'C:/Jade');assert.ok(s.updates.every(row=>row[0]==='installPath'));});

test('rollback preserves user edits made after the staged commit',async()=>{const s=setup(),values=new Map([['installPath','C:/Jade']]);s.settings.inspect=key=>({workspaceFolderValue:values.get(key)});s.settings.get=key=>values.get(key);s.settings.update=async(key,value,target)=>{s.updates.push([key,value,target]);values.set(key,value);};s.vscode.window.showOpenDialog=async()=>[{fsPath:'C:/VendorSeed'}];const staged=await s.run(undefined,{checkout:true,deferSave:true});await staged.commit();values.set('installPath','C:/UserChanged');await assert.rejects(staged.rollback(),/preserved/);assert.equal(values.get('installPath'),'C:/UserChanged');assert.equal(values.get('workingSeedDirectory'),undefined);});

test('deferred detection rejects settings edited while a runtime picker is open',async()=>{const s=setup(),values=new Map([['installPath','C:/Jade']]);s.settings.get=key=>values.get(key);s.settings.inspect=key=>({workspaceFolderValue:values.get(key)});s.vscode.window.showOpenDialog=async()=>{values.set('installPath','C:/UserEdited');return[{fsPath:'C:/VendorSeed'}];};await assert.rejects(s.run(undefined,{checkout:true,deferSave:true}),/changed/i);assert.deepEqual(s.updates,[]);assert.equal(values.get('installPath'),'C:/UserEdited');});

test('resolved installation is retained when only the project vendor seed is missing',async()=>{const s=setup();s.vscode.window.showQuickPick=async()=>assert.fail('Installation is already resolved');s.vscode.window.showOpenDialog=async options=>{assert.match(options.title,/vendor-only/);return[{fsPath:'C:/VendorSeed'}];};const staged=await s.run(undefined,{checkout:true,deferSave:true,resolved:{installPath:'C:/ProjectJade'}});assert.equal(staged.settings.installPath,undefined);assert.equal(staged.settings.workingSeedDirectory,'C:/VendorSeed');await staged.commit();assert.deepEqual(s.updates.map(row=>row[0]),['workingSeedDirectory']);});

test('deferred guards read fresh configuration snapshots between field writes',async()=>{const s=setup(),overrides=new Map([['installPath','C:/Jade']]);let globalSeed='C:/OriginalGlobalSeed';s.vscode.workspace.getConfiguration=()=>{const snapshot=new Map(overrides),seed=globalSeed;return{get:key=>snapshot.has(key)?snapshot.get(key):key==='workingSeedDirectory'?seed:undefined,inspect:key=>({workspaceFolderValue:snapshot.get(key)}),update:async(key,value,target)=>{s.updates.push([key,value,target]);overrides.set(key,value);if(key==='installPath'&&s.updates.length===1)globalSeed='C:/UserGlobalSeed';}};};const staged=await s.run(undefined,{checkout:true,deferSave:true});await assert.rejects(staged.commit(),/changed/i);await staged.rollback();assert.equal(globalSeed,'C:/UserGlobalSeed');assert.equal(overrides.has('workingSeedDirectory'),false);assert.ok(s.updates.every(row=>row[0]==='installPath'));});
