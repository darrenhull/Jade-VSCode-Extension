"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path");
const {setup}=require("../../test/fixtures/object-ui.cjs");
async function using(run){const s=setup();s.vscode.window.activeTextEditor=undefined;try{await run(s);}finally{await s.cleanup();}}
test("empty window offers Open Folder without an empty workspace picker or native connection",()=>using(async s=>{
 s.vscode.workspace.workspaceFolders=[];const prompts=[],executed=[];
 s.vscode.window.showQuickPick=async()=>assert.fail("An empty window must not show a picker");
 s.vscode.window.showInformationMessage=async(message,...actions)=>{prompts.push({message,actions});return "Create or Open Folder";};
 const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>{executed.push(name);return execute(name,...args);};
 await s.commands.get("jadeNative.connectObjects")();
 assert.match(prompts[0].message,/create a new folder or open an existing folder/i);assert.match(prompts[0].message,/browse to your Jade installation folder/i);assert.deepEqual(prompts[0].actions,["Create or Open Folder"]);assert.ok(executed.includes("workbench.action.files.openFolder"));
 assert.equal(s.clients.length,0);assert.equal(s.configCalls.length,0);assert.deepEqual(s.errors,[]);
}));
test("dismissing empty-window setup cancels cleanly",()=>using(async s=>{
 s.vscode.workspace.workspaceFolders=[];s.vscode.window.showInformationMessage=async()=>undefined;
 s.vscode.window.showQuickPick=async()=>assert.fail("No folders");
 await s.commands.get("jadeNative.connectObjects")();assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);
}));
test("workspace selector names workspaces and disambiguates duplicate folder names",()=>using(async s=>{
 const folders=["one","two"].map(name=>({name:"Sources",uri:{scheme:"file",fsPath:path.join(s.root,name)}}));
 s.vscode.workspace.workspaceFolders=folders;let picker;
 s.vscode.window.showQuickPick=async(items,options)=>{picker={items,options};return items[1];};
 await s.commands.get("jadeNative.connectObjects")();
 assert.equal(picker.options.title,"Choose Jade workspace folder");assert.deepEqual(picker.items.map(item=>item.description),folders.map(folder=>folder.uri.fsPath));assert.equal(s.configCalls[0].folder,folders[1]);
}));
test("dismissing workspace selection cancels without reporting a configuration failure",()=>using(async s=>{
 s.vscode.workspace.workspaceFolders=[{name:"One",uri:{fsPath:"C:/one"}},{name:"Two",uri:{fsPath:"C:/two"}}];s.vscode.window.showQuickPick=async()=>undefined;
 await s.commands.get("jadeNative.connectObjects")();assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);
}));
test("one configured folder connects without showing a workspace picker",()=>using(async s=>{
 s.vscode.window.showQuickPick=async()=>assert.fail("Single workspace needs no picker");
 await s.commands.get("jadeNative.connectObjects")();assert.equal(s.clients.length,1);assert.equal(s.configCalls.length,1);
}));

test("unconfigured folder offers the existing runtime wizard scoped to its selected folder",async()=>{
 const s=setup({configError:Object.assign(Error("Runtime not configured"),{code:"JADE_RUNTIME_NOT_CONFIGURED"})});s.vscode.window.activeTextEditor=undefined;
 const prompts=[],executed=[];s.vscode.window.showInformationMessage=async(message,...actions)=>{prompts.push({message,actions});return "Detect Runtime Settings";};
 const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>{executed.push({name,args});return execute(name,...args);};
 try{await s.commands.get("jadeNative.connectObjects")();assert.deepEqual(prompts[0].actions,["Detect Runtime Settings"]);assert.equal(executed.find(row=>row.name==="jadeNative.discover").args[0],s.vscode.workspace.workspaceFolders[0].uri);assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);}finally{await s.cleanup();}
});
test("unrelated configuration errors keep their original cause",async()=>{
 const s=setup({configError:"Invalid database configuration"});s.vscode.window.activeTextEditor=undefined;
 try{await s.commands.get("jadeNative.connectObjects")();assert.deepEqual(s.errors,["Invalid database configuration"]);assert.equal(s.clients.length,0);}finally{await s.cleanup();}
});
test("a standalone CLS in an empty window still offers source-folder setup",()=>using(async s=>{
 s.vscode.workspace.workspaceFolders=[];s.vscode.window.activeTextEditor={document:{uri:{scheme:"file",fsPath:"C:/outside/Fish.cls"}}};
 let prompt;s.vscode.window.showInformationMessage=async message=>{prompt=message;};
 await s.commands.get("jadeNative.connectObjects")();assert.match(prompt,/create a new folder or open an existing folder/i);assert.equal(s.configCalls.length,0);assert.deepEqual(s.errors,[]);
}));
test("dismissing missing-runtime setup never invokes the wizard or connects",async()=>{
 const s=setup({configError:Object.assign(Error("Runtime not configured"),{code:"JADE_RUNTIME_NOT_CONFIGURED"})});s.vscode.window.activeTextEditor=undefined;
 s.vscode.window.showInformationMessage=async()=>undefined;const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>{assert.notEqual(name,"jadeNative.discover");return execute(name,...args);};
 try{await s.commands.get("jadeNative.connectObjects")();assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);}finally{await s.cleanup();}
});

for(const mode of ['empty','unconfigured'])test('cancelled Connect ignores a later '+mode+' setup action',async()=>{
 const s=setup(mode==='unconfigured'?{configError:Object.assign(Error('Runtime not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'})}:{});
 s.vscode.window.activeTextEditor=undefined;if(mode==='empty')s.vscode.workspace.workspaceFolders=[];
 let choose;const prompt=new Promise(resolve=>choose=resolve),executed=[];
 s.vscode.window.showInformationMessage=async()=>prompt;
 const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>{executed.push(name);return execute(name,...args);};
 let pending;
 try{pending=s.commands.get('jadeNative.connectObjects')();await new Promise(resolve=>setImmediate(resolve));s.progressOperations[0].cancel();choose(mode==='empty'?'Create or Open Folder':'Detect Runtime Settings');await pending;
 assert.ok(!executed.includes('workbench.action.files.openFolder'));assert.ok(!executed.includes('jadeNative.discover'));assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);
 }finally{choose();await pending;await s.cleanup();}
});

test('an outside CLS selects a real workspace before missing-runtime setup',async()=>{
 const s=setup({configError:Object.assign(Error('Runtime not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'})});
 const folders=['one','two'].map(name=>({name:'Sources',uri:{scheme:'file',fsPath:path.join(s.root,name)}}));
 s.vscode.workspace.workspaceFolders=folders;s.vscode.workspace.getWorkspaceFolder=uri=>folders.find(folder=>uri.fsPath.startsWith(folder.uri.fsPath));
 s.vscode.window.activeTextEditor={document:{uri:{scheme:'file',fsPath:'C:/outside/Unrelated.cls'}}};
 let picker,resource;s.vscode.window.showQuickPick=async(items,options)=>{picker={items,options};return items[1];};
 s.vscode.window.showInformationMessage=async()=> 'Detect Runtime Settings';
 const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>{if(name==='jadeNative.discover')resource=args[0];return execute(name,...args);};
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(picker?.options.title,'Choose Jade workspace folder');assert.equal(s.configCalls[0].folder,folders[1]);assert.equal(s.configCalls[0].doc,undefined);assert.equal(resource,folders[1].uri);assert.deepEqual(s.errors,[]);assert.equal(s.clients.length,0);}finally{await s.cleanup();}
});

for(const mode of ['empty','unconfigured'])test('Connect cancellation settles pending '+mode+' guidance without waiting for dismissal',async()=>{
 const s=setup(mode==='unconfigured'?{configError:Object.assign(Error('Runtime not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'})}:{});
 s.vscode.window.activeTextEditor=undefined;if(mode==='empty')s.vscode.workspace.workspaceFolders=[];
 let choose,settled=false,pending;s.vscode.window.showInformationMessage=()=>new Promise(resolve=>choose=resolve);
 try{pending=s.commands.get('jadeNative.connectObjects')().then(result=>{settled=true;return result;});await new Promise(resolve=>setImmediate(resolve));s.progressOperations[0].cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,true);assert.deepEqual(await pending,{cancelled:true});assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);
 }finally{choose?.();await pending;await s.cleanup();}
});

for(const mode of ['empty','unconfigured'])test('a late cancelled '+mode+' prompt cannot affect the next Connect',async()=>{
 const s=setup(mode==='unconfigured'?{configError:Object.assign(Error('Runtime not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'})}:{});
 s.vscode.window.activeTextEditor=undefined;if(mode==='empty')s.vscode.workspace.workspaceFolders=[];
 const choices=[],executed=[];s.vscode.window.showInformationMessage=()=>new Promise(resolve=>choices.push(resolve));
 const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>{executed.push(name);return execute(name,...args);};
 let first,second,secondSettled=false;
 try{first=s.commands.get('jadeNative.connectObjects')();await new Promise(resolve=>setImmediate(resolve));s.progressOperations[0].cancel();await first;
 second=s.commands.get('jadeNative.connectObjects')().then(result=>{secondSettled=true;return result;});await new Promise(resolve=>setImmediate(resolve));
 choices[0](mode==='empty'?'Create or Open Folder':'Detect Runtime Settings');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(secondSettled,false);assert.equal(s.contexts.get('jadeNative.connectingObjects'),true);assert.ok(!executed.includes('workbench.action.files.openFolder'));assert.ok(!executed.includes('jadeNative.discover'));s.progressOperations[1].cancel();await second;assert.deepEqual(s.errors,[]);
 }finally{for(const choose of choices)choose();await Promise.allSettled([first,second]);await s.cleanup();}
});

test('Connect forwards cancellation into the selected runtime wizard',async()=>{
 const s=setup({configError:Object.assign(Error('Runtime not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'})});s.vscode.window.activeTextEditor=undefined;s.vscode.window.showInformationMessage=async()=> 'Detect Runtime Settings';let token,finish,settled=false,pending;
 s.commands.set('jadeNative.discover',async(_resource,value)=>{token=value;return new Promise(resolve=>{finish=resolve;token?.onCancellationRequested(resolve);});});
 try{pending=s.commands.get('jadeNative.connectObjects')().then(value=>{settled=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.ok(token,'Runtime wizard must receive the active Connect cancellation token');s.progressOperations[0].cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,true);await pending;assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);assert.deepEqual(s.errors,[]);
 }finally{s.progressOperations[0]?.cancel();finish?.();await pending;await s.cleanup();}
});

test('Connect cancellation releases a pending Open Folder command',async()=>{
 const s=setup();s.vscode.workspace.workspaceFolders=[];s.vscode.window.activeTextEditor=undefined;s.vscode.window.showInformationMessage=async()=> 'Create or Open Folder';let finish,settled=false,pending;
 const execute=s.vscode.commands.executeCommand;s.vscode.commands.executeCommand=async(name,...args)=>name==='workbench.action.files.openFolder'?new Promise(resolve=>finish=resolve):execute(name,...args);
 try{pending=s.commands.get('jadeNative.connectObjects')().then(value=>{settled=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof finish,'function');s.progressOperations[0].cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,true);await pending;assert.equal(s.contexts.get('jadeNative.connectingObjects'),false);assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);}finally{s.progressOperations[0]?.cancel();finish?.();await pending;await s.cleanup();}
});

for(const mode of ['empty','unconfigured'])test('database selection respects dismissed '+mode+' setup',async()=>{
 const s=setup(mode==='unconfigured'?{configError:Object.assign(Error('Runtime not configured'),{code:'JADE_RUNTIME_NOT_CONFIGURED'})}:{});s.vscode.window.activeTextEditor=undefined;if(mode==='empty')s.vscode.workspace.workspaceFolders=[];
 let picks=0;s.vscode.window.showInformationMessage=async()=>undefined;s.vscode.window.showQuickPick=async()=>{picks++;};
 try{await s.commands.get('jadeNative.selectInspectionDatabase')();assert.equal(picks,0);assert.equal(s.clients.length,0);assert.deepEqual(s.errors,[]);}finally{await s.cleanup();}
});
