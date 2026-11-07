"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path");
const {setup}=require("../../test/fixtures/object-ui.cjs");
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const identity=(s,folder="source")=>({schema:"Pets",className:"Fish",projectRoot:path.join(s.root,folder)});

test("latest Source choice wins while older Working choice waits for native shutdown",async()=>{
 const s=setup({closeSubsequentAutomatically:true});
 try{await s.connect();let choices=0;s.vscode.window.showQuickPick=async()=>({target:choices++===0?"working":"source"});
 const older=s.controller.browseInstances(identity(s));await turn();assert.equal(s.clients[0].stopCalled,true);
 const newer=s.controller.browseInstances(identity(s));await turn();s.clients[0].finishClose();
 const [oldResult,newResult]=await Promise.all([older,newer]);
 assert.equal(oldResult.cancelled,true);assert.equal(newResult.available,true);assert.equal(newResult.target,"source");
 assert.equal(s.controller.session.target,"source");assert.ok(s.controller.session.client);assert.equal(s.clients.length,2);assert.deepEqual(s.errors,[]);
 }finally{await s.cleanup();}
});

test("a superseded project cannot replace a newer project's database after shutdown",async()=>{
 const s=setup({closeSubsequentAutomatically:true,projectScopedConfig:true});
 try{await s.connect();s.vscode.window.showQuickPick=async()=>({target:"source"});
 const older=s.controller.browseInstances(identity(s,"older-project"));await turn();assert.equal(s.clients[0].stopCalled,true);
 const newer=s.controller.browseInstances(identity(s,"latest-project"));await turn();s.clients[0].finishClose();
 const [oldResult,newResult]=await Promise.all([older,newer]);
 assert.equal(oldResult.cancelled,true);assert.equal(newResult.available,true);
 assert.equal(newResult.databasePath,path.join(s.root,"latest-project","system"));
 assert.equal(s.sessionData.at(-1).databasePath,path.join(s.root,"latest-project","system"));assert.equal(s.clients.length,2);assert.deepEqual(s.errors,[]);
 }finally{await s.cleanup();}
});

test("disposing while target transitions are queued prevents all reconnects",async()=>{
 const s=setup({closeSubsequentAutomatically:true});
 try{await s.connect();let choices=0;s.vscode.window.showQuickPick=async()=>({target:choices++===0?"working":"source"});
 const older=s.controller.browseInstances(identity(s));await turn();const newer=s.controller.browseInstances(identity(s));await turn();
 s.disposeExtension();s.clients[0].finishClose();
 const results=await Promise.all([older,newer]);assert.ok(results.every(result=>result.cancelled));
 assert.equal(s.clients.length,1);assert.equal(s.controller.session.client,undefined);assert.equal(s.controller.session.target,"source");assert.deepEqual(s.errors,[]);
 }finally{await s.cleanup();}
});

test("explicit database selector supersedes a delayed class instance target change",async()=>{
 const s=setup({closeSubsequentAutomatically:true});
 try{await s.connect();let choices=0;s.vscode.window.showQuickPick=async()=>({target:choices++===0?"working":"source"});
 const older=s.controller.browseInstances(identity(s));await turn();
 const selected=s.commands.get("jadeNative.selectInspectionDatabase")();await turn();s.clients[0].finishClose();
 const [oldResult,selection]=await Promise.all([older,selected]);
 assert.equal(oldResult.cancelled,true);assert.equal(selection.selection,"source");assert.equal(s.controller.session.target,"source");assert.equal(s.controller.session.client,undefined);assert.equal(s.clients.length,1);
 }finally{await s.cleanup();}
});

for(const operation of ["disconnect","cancel","handoff"])test(operation+" invalidates a target change waiting for shutdown",async()=>{
 const s=setup({closeSubsequentAutomatically:true});
 try{await s.connect();s.vscode.window.showQuickPick=async()=>({target:"working"});const pending=s.controller.browseInstances(identity(s));await turn();
 const closing=operation==="handoff"?s.controller.releaseForOperation():s.commands.get(operation==="disconnect"?"jadeNative.disconnectObjects":"jadeNative.cancelObjectInspection")();
 s.clients[0].finishClose();await closing;const result=await pending;assert.equal(result.cancelled,true);assert.equal(s.clients.length,1);assert.equal(s.controller.session.client,undefined);assert.equal(s.controller.session.target,"source");
 }finally{await s.cleanup();}
});

test("superseded instance reply returns cancellation instead of a stale error",async()=>{
 const s=setup({closeSubsequentAutomatically:true});
 try{await s.connect();let finish,choice=0;const request=s.clients[0].request;
 s.clients[0].request=(command,args)=>command==="instances"?new Promise(resolve=>{finish=()=>resolve({items:[],hasMore:false});}):request(command,args);
 s.vscode.window.showQuickPick=async()=>({target:choice++===0?"source":"working"});
 const older=s.controller.browseInstances(identity(s)).catch(error=>({error:error.message}));await turn();
 const newer=s.controller.browseInstances(identity(s));await turn();s.clients[0].finishClose();assert.equal((await newer).available,true);finish();
 assert.deepEqual(await older,{cancelled:true});assert.equal(s.controller.session.target,"working");assert.deepEqual(s.errors,[]);
 }finally{await s.cleanup();}
});

for(const outcome of ["resolve","reject"])test("superseded final native tree reveal "+outcome+" cannot report stale success or failure",async()=>{
 const s=setup({closeSubsequentAutomatically:true});
 try{await s.connect();let finish,choice=0,held=false;
 s.controller.view.reveal=async(row,options)=>{if(row.kind==="class"&&options.expand===true&&!held){held=true;await new Promise((resolve,reject)=>{finish=()=>outcome==="resolve"?resolve():reject(Error("Tree element was removed"));});}};
 s.vscode.window.showQuickPick=async()=>({target:choice++===0?"source":"working"});
 const older=s.controller.browseInstances(identity(s)).catch(error=>({error:error.message}));await turn();assert.equal(typeof finish,"function");
 const newer=s.controller.browseInstances(identity(s));await turn();s.clients[0].finishClose();assert.equal((await newer).available,true);finish();
 assert.deepEqual(await older,{cancelled:true});assert.equal(s.controller.session.target,"working");assert.deepEqual(s.errors,[]);
 }finally{await s.cleanup();}
});
