'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../../extension/package.json');
const {registerJoxWorkspace}=require('../../extension/src/register-jox-workspace');
const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs');
test('JOX does not bind F5 or Shift+F5 to unsupported build or Source publication',()=>{
 const bindings=manifest.contributes.keybindings;
 assert.ok(!bindings.some(binding=>['f5','shift+f5'].includes(binding.key)&&
  ['jadeNative.buildWorkspace','jadeNative.compileClass','jadeNative.publishClass','jadeNative.publishWorkspace','jadeNative.publishChangedFiles'].includes(binding.command)));
 const scratchInfo=bindings.find(binding=>binding.key==='f5');
 assert.equal(scratchInfo.command,'jadeNative.scratchpadCompileInfo');
 assert.match(scratchInfo.when,/!inDebugMode/);
 assert.match(scratchInfo.when,/resourceScheme != jade-source/);
 for(const command of ['jadeNative.compileClass','jadeNative.buildWorkspace'])
  assert.ok(manifest.contributes.commands.some(entry=>entry.command===command));
});
test('Ctrl+F5 retains native test shortcuts in source editors and Class Workspace',()=>{
 const bindings=manifest.contributes.keybindings;
 for(const context of ['resourceScheme == jade-source','activeCustomEditorId == jade.classWorkspace']){
  const binding=bindings.find(entry=>entry.key==='ctrl+f5'&&entry.when.includes(context));
  assert.ok(binding,context);assert.equal(binding.command,'jadeNative.runLocalTests');
  assert.match(binding.when,/!inDebugMode/);assert.match(binding.when,/!jadeNative.publishing/);
  if(context.startsWith('activeCustomEditorId'))assert.doesNotMatch(binding.when,/editorTextFocus/);
  else assert.match(binding.when,/editorTextFocus/);
 }
});
test('explicit build commands preserve the native refusal and Source publication cannot fall back',async()=>{
 const refusal={passed:false,code:2,report:{error:'Standalone JOX build is not supported by this basic package.'}};
 const f=setup({flags:{nativeBuild:false},reply:command=>command==='build'?refusal:undefined});
 const registered=registerJoxWorkspace(f.vscode,f.context,{client:f.client,configFor:()=>f.config});
 const project=await registered.workspace.prepare(f.folder),uri=await registered.workspace.open(project,f.document.entityId);
 for(const command of ['jadeNative.compileClass','jadeNative.buildWorkspace','jadeNative.checkFile']){
  const before=f.requests.length;
  assert.deepEqual(await f.commands.get(command)(uri),refusal);
  assert.deepEqual(f.requests.slice(before).map(request=>request.command),['source.semantic.prepare','build']);
  assert.deepEqual(f.requests.at(-1).body.semanticSelection,{entityIds:[f.document.entityId]});
 }
 const before=f.requests.length;
 for(const command of ['jadeNative.publishClass','jadeNative.publishWorkspace','jadeNative.publishChangedFiles'])
  assert.throws(()=>f.commands.get(command)(uri),/JOX publication is not yet supported/);
 assert.equal(f.requests.length,before);
});
test('the Ctrl+F5 command runs selected native test identities without build or publication',async()=>{
 const identity={schema:'ExactSchema',class:'ExactTests',method:'value'};
 const f=setup({testing:true,flags:{nativeBuild:false,nativeScratch:false},reply:(command,request)=>{
  if(command==='test')return {passed:true,code:0,report:{tests_completed:true,cleanup_complete:true,results:[{...identity,status:'passed'}]}};
  if(command==='source.semantic.query')return {passed:true,code:0,body:{provider:'jox',projectId:f.snapshot.projectId,generation:f.snapshot.generation,
   items:[{id:f.document.entityId,name:identity.method,kind:'method',testIdentity:identity}],total:1,offset:request.offset,limit:request.limit,nextOffset:null}};
 }});
 const registered=registerJoxWorkspace(f.vscode,f.context,{client:f.client,configFor:()=>f.config});
 const project=await registered.workspace.prepare(f.folder),uri=await registered.workspace.open(project,f.document.entityId);
 const shortcut=manifest.contributes.keybindings.find(binding=>binding.key==='ctrl+f5'&&binding.when.includes('resourceScheme == jade-source'));
 const result=await f.commands.get(shortcut.command)(uri,['value']);
 assert.equal(result.passed,true);
 const executions=f.requests.filter(request=>request.command==='test');assert.equal(executions.length,1);
 assert.deepEqual(executions[0].body.semanticSelection,{entityIds:[f.document.entityId]});
 assert.deepEqual(executions[0].body.testIdentity,identity);assert.deepEqual(executions[0].body.config.methods,['value']);
 assert.equal(f.requests.some(request=>['build','workspace.run'].includes(request.command)||request.command.startsWith('source.index.')||request.command.startsWith('working.baseline.')),false);
 assert.equal(f.testRuns[0].filter(event=>event.name==='passed').length,1);
 assert.equal(f.testRuns[0].at(-1).name,'end');
});
