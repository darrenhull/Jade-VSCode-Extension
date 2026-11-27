'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
const {setup}=require('./fixtures/vscode.cjs');
test('concurrent semantic view activation prepares once with separate cancellable progress and logs',async()=>{
 const f=setup(),progress=[],logs=[];
 f.vscode.ProgressLocation={Notification:15};
 f.vscode.window.withProgress=async(options,run)=>{progress.push(options);return run({report(){}},{isCancellationRequested:false,onCancellationRequested(){return{dispose(){}};}});};
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});
 workspace.reportProgress=line=>logs.push(line);
 const project=workspace.project(f.folder);
 await Promise.all([workspace.ensurePrepared(f.folder),workspace.ensurePrepared(f.folder)]);
 assert.equal(f.requests.filter(x=>x.command==='source.semantic.prepare').length,1);
 assert.equal(project.provider.snapshot.generation,f.snapshot.generation);
 assert.equal(progress.length,1);assert.equal(progress[0].cancellable,true);
 assert.ok(logs.some(line=>/prepar/i.test(line)));
 await workspace.ensurePrepared(f.folder);assert.equal(progress.length,1);
});


test('cancelled lazy preparation leaves catalogue absent and a later view retries cleanly',async()=>{
 const f=setup();let cancelled=true,progressRuns=0;
 f.vscode.ProgressLocation={Notification:15};
 f.vscode.window.withProgress=async(_options,run)=>{progressRuns++;return run({}, {isCancellationRequested:cancelled,onCancellationRequested(){return{dispose(){}};}});};
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});
 const project=workspace.project(f.folder);project.provider.semanticPreparationRequired=true;
 await assert.rejects(workspace.ensurePrepared(f.folder),/cancel/i);
 assert.equal(project.provider.snapshot,undefined);assert.equal(project.semanticPreparation,undefined);
 assert.equal(f.requests.length,0);cancelled=false;
 await workspace.ensurePrepared(f.folder);assert.equal(progressRuns,2);assert.ok(project.provider.snapshot);
});

test('saved source watcher does not start a deferred catalogue before a semantic view is requested',async()=>{
 const f=setup(),workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});
 const project=workspace.project(f.folder);project.provider.semanticPreparationRequired=true;
 workspace.pendingChanges.set(project,{needsPrepare:true});
 workspace.scheduleRefresh(project);assert.equal(workspace.pendingChanges.size,0);assert.equal(f.requests.length,0);
});

for(const state of ['closed','replaced'])test('lazy catalogue snapshot is not reused after its connection is '+state,async()=>{
 const f=setup(),workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});
 await workspace.ensurePrepared(f.folder);
 if(state==='closed')f.client.client.closed=true;else f.client.client={};
 f.client.connect=function(){if(this.client.closed)this.client={};return this.client;};
 await workspace.ensurePrepared(f.folder);
 assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,2);
 assert.equal(workspace.project(f.folder).provider.connection,f.client.client);
});

test('saved source change during lazy prepare queues one refresh before the catalogue is shown',async()=>{
 const f=setup(),workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});
 const project=workspace.project(f.folder);project.provider.semanticPreparationRequired=true;
 const prepare=project.provider.prepare.bind(project.provider);let calls=0,release;
 project.provider.prepare=async(...args)=>{calls++;if(calls===1)await new Promise(resolve=>release=resolve);return prepare(...args);};
 const operation=workspace.ensurePrepared(f.folder);await new Promise(resolve=>setImmediate(resolve));
 workspace.scheduleRefresh(project);release();await operation;
 assert.equal(calls,2);assert.equal(workspace.pendingChanges.size,0);
});

test('a second view waits for an in-flight dirty follow-up even after its first snapshot exists',async()=>{
 const f=setup(),workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config}),project=workspace.project(f.folder);
 const prepare=project.provider.prepare.bind(project.provider);let calls=0,first,second;
 project.provider.prepare=async(...args)=>{if(++calls===1)await new Promise(resolve=>first=resolve);else await new Promise(resolve=>second=resolve);return prepare(...args);};
 const initial=workspace.ensurePrepared(f.folder);await new Promise(resolve=>setImmediate(resolve));workspace.scheduleRefresh(project);first();await new Promise(resolve=>setImmediate(resolve));
 let returned=false;const joining=workspace.ensurePrepared(f.folder).then(()=>returned=true);await new Promise(resolve=>setImmediate(resolve));
 try{assert.equal(returned,false,'Second view escaped with the earlier stale snapshot');}finally{second();await Promise.all([initial,joining]);}
});
