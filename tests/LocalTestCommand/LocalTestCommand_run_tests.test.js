'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {testingHarness}=require('../../test/helpers/testing-harness');
const {registerTesting}=require('../../extension/src/testing');

// Execute the real registered callback, including its early guards. Keeping this
// harness separate from activate() avoids launching native processes or views.
function fixture({busy=true,result,sourceReady,inputsReady,uiReady}={}){
 const source=fs.readFileSync(path.join(__dirname,'../../extension/src/extension.js'),'utf8');
 const start=source.indexOf("vscode.commands.registerCommand('jadeNative.executeLocalTests',");
 const end=source.indexOf("vscode.commands.registerCommand('jadeNative.refreshTypeCache',",start);
 assert.ok(start>=0&&end>start,'Registered local-test command must remain discoverable');
 const expression=source.slice(start,end).trim().replace(/,$/,'');
 const calls={messages:[],output:[],native:0,prepare:0,context:[]},h=testingHarness();let command;
 const sourceText='schemaDefinition\nProbeTests subschemaOf RootSchema partialDefinition;\ntypeHeaders\nProbe subclassOf JadeTestCase transient;\ntypeDefinitions\nProbe completeDefinition ()\ntypeSources\nProbe (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\n assertTrue(true);\nend;\n}\n)\n';
 const document={uri:h.api.Uri.file('C:/synthetic/Probe.cls'),isDirty:false,getText:()=>sourceText,positionAt:offset=>({line:sourceText.slice(0,offset).split('\n').length-1,character:0})};
 const disposable=()=>({dispose(){}});
 const vscode={...h.api,ProgressLocation:{Notification:1},commands:{registerCommand(name,handler){assert.equal(name,'jadeNative.executeLocalTests');command=handler;return disposable();},async executeCommand(name,key,value){calls.context.push(value);if(name==='setContext'&&value===false)await uiReady;}},window:{showErrorMessage(message){calls.messages.push(message);},showInformationMessage(){},async withProgress(options,task){return task({}, {onCancellationRequested:disposable});}},workspace:{textDocuments:[document],findFiles:async()=>[document.uri],createFileSystemWatcher:()=>({dispose(){},onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable}),onDidOpenTextDocument:disposable,onDidChangeTextDocument:disposable,async openTextDocument(){return document;}}};
 const sandbox={vscode,nativeTests:{},publishing:busy,resolveSource:async()=>{await sourceReady;return document;},path,classConfig:()=>({program:document.uri.fsPath}),diagnostics:{delete(){}},reportDiagnostic(){},testOutput:{clear(){},show(){},append(text){calls.output.push(text);},appendLine(text){calls.output.push(text+'\n');}},workingFiles:async()=>{calls.prepare++;await inputsReady;},startWorking(config,operation,onOutput){calls.native++;return{stop(){},completion:Promise.resolve(result)}}};
 vm.runInNewContext(expression,sandbox,{filename:'registered-executeLocalTests.js'});
 const manager=registerTesting(vscode,{subscriptions:[]},(...args)=>command(...args));
 return{calls,h,document,command,manager,sandbox};
}
test('busy local-test command returns a clear not-started result and records it in Testing output',async()=>{
 const f=fixture(),observed=[];
 const result=await f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 assert.equal(result?.passed,false,'Busy command must not return undefined');
 assert.equal(result?.report?.tests_completed,false);
 assert.match(result?.report?.error,/current Jade operation|already running/i);
 assert.match(result?.report?.error,/not started|not run/i);
 assert.match(f.calls.output.join(''),/current Jade operation|already running/i);
 assert.match(observed.join(''),/current Jade operation|already running/i);
 assert.equal(f.calls.native,0);assert.equal(f.calls.prepare,0);assert.equal(f.sandbox.publishing,true);
});
test('Test Explorer retains the busy cause instead of generic incomplete-method diagnostics',async()=>{
 const f=fixture();await f.manager.runFile(f.document.uri,'check');
 const run=f.h.runs[0],error=run.states.find(state=>state.status==='errored');
 assert.match(error?.message.message,/current Jade operation|already running/i);
 assert.doesNotMatch(error?.message.message,/did not produce a complete method result/);
 assert.match(run.output.join(''),/current Jade operation|already running/i);
 assert.ok(run.ended);assert.equal(f.calls.native,0);
});
test('completed assertion results need no user-code output to become individual native outcomes',async()=>{
 const f=fixture({busy:false,result:{passed:true,code:0,report:{tests_completed:true,cleanup_complete:true,tests_selected:1,failures:0,results:[{method:'check',status:'passed'}]}}});
 await f.manager.runFile(f.document.uri,'check');
 assert.equal(f.calls.native,1,JSON.stringify(f.calls));assert.equal(f.calls.prepare,1);
 assert.ok(f.h.runs[0].states.some(state=>state.status==='passed'));
 assert.ok(!f.h.runs[0].states.some(state=>state.status==='errored'));
 assert.equal(f.sandbox.publishing,false);
});
test('a native assertion failure without user writes remains a failed method with its original message',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:1,report:{tests_completed:true,cleanup_complete:true,tests_selected:1,failures:1,results:[{method:'check',status:'failed',message:'Synthetic native assertion failed'}]}}});
 await f.manager.runFile(f.document.uri,'check');
 const failed=f.h.runs[0].states.find(state=>state.status==='failed');
 assert.equal(failed?.message.message,'Synthetic native assertion failed');
 assert.ok(!f.h.runs[0].states.some(state=>state.status==='errored'));
 assert.equal(f.calls.native,1);assert.equal(f.sandbox.publishing,false);
});
test('native incomplete-run diagnostics retain their actual cause instead of a busy result',async()=>{
 const f=fixture({busy:false,result:{passed:false,code:2,report:{tests_completed:false,cleanup_complete:false,results:[],error:'Synthetic native helper stopped during teardown'}}});
 await f.manager.runFile(f.document.uri,'check');
 const error=f.h.runs[0].states.find(state=>state.status==='errored');
 assert.equal(error?.message.message,'Synthetic native helper stopped during teardown');
 assert.equal(f.calls.native,1);assert.equal(f.sandbox.publishing,false);
});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
const completedResult=()=>({passed:true,code:0,report:{tests_completed:true,cleanup_complete:true,tests_selected:1,failures:0,results:[{method:'check',status:'passed'}]}});
test('Testing output identifies source-resolution and input-discovery waits before native execution',async()=>{
 const source=deferred(),inputs=deferred(),observed=[];
 const f=fixture({busy:false,result:completedResult(),sourceReady:source.promise,inputsReady:inputs.promise});
 const running=f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(observed.join(''),/Resolving selected test source.*\d+ ms elapsed/i);
  assert.equal(f.calls.native,0);
  source.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.match(observed.join(''),/Saving and discovering local test sources.*\d+ ms elapsed/i);
  assert.equal(f.calls.native,0);
 }finally{source.resolve();inputs.resolve();await running;}
});
test('Testing output distinguishes the native wait from actual method completion',async()=>{
 const native=deferred(),observed=[],f=fixture({busy:false,result:native.promise});
 const running=f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.native,1);
  assert.match(observed.join(''),/Waiting for native compilation and test results.*\d+ ms elapsed/i);
  assert.doesNotMatch(observed.join(''),/Native test operation returned/);
 }finally{native.resolve(completedResult());await running;}
 assert.equal(observed.filter(text=>text.includes('Native test operation returned')).length,1);
 assert.equal(f.calls.output.filter(text=>text.includes('Native test operation returned')).length,1);
});
test('a returned native result remains distinguishable from a pending UI-state release',async()=>{
 const ui=deferred(),observed=[],f=fixture({busy:false,result:completedResult(),uiReady:ui.promise});
 const running=f.command(f.document.uri,['check'],undefined,text=>observed.push(text));
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(observed.join(''),/Native test operation returned/);
  assert.match(observed.join(''),/Releasing local test UI state.*\d+ ms elapsed/i);
  assert.doesNotMatch(observed.join(''),/Local test UI state released/);
 }finally{ui.resolve();await running;}
 assert.equal(observed.filter(text=>text.includes('Local test UI state released')).length,1);
});
