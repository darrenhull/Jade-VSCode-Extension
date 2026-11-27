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
