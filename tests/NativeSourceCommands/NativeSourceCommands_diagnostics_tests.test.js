'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs');
const {registerJoxWorkspace}=require('../../extension/src/register-jox-workspace');

for(const command of ['jadeNative.compileClass','jadeNative.buildWorkspace','jadeNative.checkFile'])test(command+' reports native compiler Problems and clears only on confirmed compilation',async()=>{
 const mapped='C:/project/Example/Type.jox',generated='C:/private/package/Example.scm',problems=new Map();
 let result={passed:false,code:8510,report:{compiled:false,error:'Original native compilation failure',diagnostics:[
  {schema:'Example',owner:'Type',method:'value',source:mapped,line:17,column:4,error_length:3,compiler_error:6027,message:'Unknown identifier'},
  {source:generated,line:77,column:3,compiler_error:6281,message:'Generated source failure',generated_source:true,diagnostic_context_unavailable:true},
  {source:mapped,line:1,compiler_error:6281,message:'No context',diagnostic_context_unavailable:true}
 ]}};
 const f=setup({reply:native=>native==='build'?result:undefined}),collections=[];
 f.vscode.languages.createDiagnosticCollection=name=>{const collection={name,clear:()=>problems.clear(),set:(uri,items)=>problems.set(uri.toString(),items),dispose:()=>problems.clear()};collections.push(collection);return collection;};
 f.vscode.Diagnostic=class{constructor(range,message,severity){Object.assign(this,{range,message,severity});}};f.vscode.DiagnosticSeverity={Error:0};
 const registered=registerJoxWorkspace(f.vscode,f.context,{client:f.client,configFor:()=>f.config});
 const project=await registered.workspace.prepare(f.folder),uri=await registered.workspace.open(project,f.document.entityId);
 const run=()=>f.commands.get(command)(uri),failed=await run();
 assert.equal(failed,result);assert.equal(failed.code,8510);assert.equal(failed.report.error,'Original native compilation failure');
 const entries=problems.get(f.vscode.Uri.file(mapped).toString());
 assert.equal(entries?.length,1,'Build/check result never reached the active JOX Problems reporter');
 assert.equal(entries[0].code,6027);assert.match(entries[0].message,/Example.*Type.*value.*Unknown identifier/);assert.deepEqual(entries[0].range.args,[16,3,16,6]);
 assert.deepEqual(problems.get(f.vscode.Uri.file(generated).toString())[0].range.args,[76,2,76,3]);
 result={passed:false,code:2,report:{compiled:false,error:'Standalone JOX builds are unsupported'}};
 assert.equal(await run(),result);assert.equal(problems.size,2,'Capability refusal must not clear previous compiler Problems');
 result={passed:false,code:130,cancelled:true,report:{compiled:false,diagnostics:[]}};
 assert.equal(await run(),result);assert.equal(problems.size,2,'Cancelled/no-compile result must preserve compiler Problems');
 result={passed:true,code:0,report:{compiled:true,diagnostics:[]}};
 assert.equal(await run(),result);assert.equal(problems.size,0,'Confirmed compilation did not retire the existing compiler Problems');
 assert.equal(collections.length,1,'Command/test integration must use the same registered collection');
 assert.equal(f.requests.filter(request=>request.command==='build').length,4);
 assert.ok(f.requests.every(request=>!request.command.startsWith('source.index.')&&!request.command.startsWith('working.baseline.')));
});
