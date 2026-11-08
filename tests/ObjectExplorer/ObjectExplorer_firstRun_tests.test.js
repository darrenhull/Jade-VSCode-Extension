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
