"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {registerClassWorkspaces}=require("../../extension/src/class-workspace-controller");
const {MethodDraftRecovery}=require("../../extension/src/method-draft-recovery");
function fixture(){
 let provider;const views=new Map(),flushed=[],stored=new Map(),uri=value=>({toString:()=>value}),noop={dispose(){}};
 const snapshot={available:true,owner:"Fish",member:"getName",kind:"method",version:1,text:"original"};
 const vscode={Uri:{parse:uri,joinPath:()=>uri("file:///media")},ViewColumn:{Active:-1,Beside:-2},workspace:{getWorkspaceFolder:()=>({uri:uri("file:///project")})},window:{registerCustomEditorProvider:(_id,value)=>{provider=value;return noop;}},commands:{executeCommand:async(_name,resource)=>provider.createView({document:{uri:resource},panel:{active:true,viewColumn:1,webview:{asWebviewUri:value=>value},onDidDispose:()=>noop},binding:{snapshot:()=>snapshot},services:{save:()=>assert.fail("No auto-save")}})}};
 const controller=registerClassWorkspaces(vscode,{extensionUri:uri("file:///extension"),subscriptions:[],workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)}},{model:{resolveClass:async row=>({...row,schema:"Pets",projectId:"file:///project",file:"file:///project/"+row.name+".cls"})},shell:{attach:session=>{views.set(session.row.name,session);return{flushPendingEdits:async()=>{flushed.push(session.row.name);return true;},dispose(){}};},dispose(){}}});
 return{controller,views,flushed,snapshot,uri};
}
test("Source preflight flushes selected-file splits only and never saves unrelated editors",async()=>{
 const f=fixture();try{await f.controller.open({name:"Fish"});await f.controller.open({name:"Bird"});assert.equal(await f.controller.prepareSourcePull(f.uri("file:///project/Fish.cls")),true);assert.deepEqual(f.flushed,["Fish"]);}finally{f.controller.dispose();}
});
test("class-view draft is synchronously visible before recovery persistence and stays protected until acknowledged",async()=>{
 const f=fixture(),events=[];const subscription=f.controller.onDidChangePendingSource(event=>events.push(event));
 try{
  await f.controller.open({name:"Fish"});const recovery=f.views.get("Fish").services.draftRecovery;
  const saved=recovery.save({owner:"Fish",member:"getName",kind:"method",version:1,text:"edited"});assert.equal(f.controller.hasPendingSource(f.uri("file:///project/Fish.cls")),true);assert.equal(events[0].pending,true);
  await saved;assert.equal(await f.controller.prepareSourcePull(f.uri("file:///project/Fish.cls")),false);
  f.snapshot.text="edited";f.snapshot.version=2;await recovery.acknowledge();assert.equal(await f.controller.prepareSourcePull(f.uri("file:///project/Fish.cls")),true);
 }finally{subscription.dispose();f.controller.dispose();}
});
test("pending-draft query reads metadata without cloning retained draft source",()=>{
 const recovery=new MethodDraftRecovery({get:()=>[],update:async()=>{}});recovery.records.set("fixture",{pristine:false,identity:{uri:"file:///Project/Fish.cls"},get text(){assert.fail("Do not clone/read draft bodies for permission checks");}});
 assert.equal(recovery.hasDraftForUri("file:///project/fish.cls"),true);assert.equal(recovery.hasDraftForUri("file:///project/Cow.cls"),false);
});

test("artifact draft metadata is project-bound and synchronous before persistence",async()=>{
 const f=fixture();try{await f.controller.open({name:"Fish"});const recovery=f.views.get("Fish").services.draftRecovery;const saving=recovery.save({owner:"Fish",member:"getName",kind:"method",version:1,text:"edited"});const artifact={schema:"Pets",name:"Fish",kind:"class"};assert.equal(f.controller.hasPendingArtifact(artifact,"file:///project"),true);assert.equal(f.controller.hasPendingArtifact(artifact,"file:///other"),false);await saving;f.snapshot.text="edited";f.snapshot.version=2;await recovery.acknowledge();assert.equal(f.controller.hasPendingArtifact(artifact,"file:///project"),false);}finally{f.controller.dispose();}
});

test("a newer unsubmitted draft cannot be cleared by an older in-flight acknowledgement",async()=>{
 const f=fixture();try{await f.controller.open({name:"Fish"});const recovery=f.views.get("Fish").services.draftRecovery;await recovery.save({owner:"Fish",member:"getName",kind:"method",version:1,text:"first"});f.snapshot.text="first";f.snapshot.version=2;const acknowledgement=recovery.acknowledge();const next=recovery.save({owner:"Fish",member:"getName",kind:"method",version:2,text:"second"});await acknowledgement;assert.equal(f.controller.hasPendingArtifact({schema:"Pets",name:"Fish",kind:"class"},"file:///project"),true);await next;}finally{f.controller.dispose();}
});
