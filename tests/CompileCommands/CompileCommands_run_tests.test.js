'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events');
const {registerCompileCommands}=require('../../extension/src/compile-commands');
const {CliWorkingSession}=require('../../extension/src/cli-client');
function harness(){
 const root=path.resolve('owning-project'),file=path.join(root,'Pet.cls'),commands=new Map(),requests=[],output=[],busy=[],folder={uri:{fsPath:root}};
 const document={uri:{scheme:'file',fsPath:file},isDirty:false};
 const session=new CliWorkingSession({entry:'C:/packaged/jade-cli.exe',spawn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=text=>{const request=JSON.parse(text);requests.push(request);queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({id:request.id,event:'result',result:{passed:true,code:0,report:{compiled:true,loaded_files:0}}})+'\n')));};child.kill=()=>{};return child;}});
 const vscode={commands:{registerCommand(name,handler){commands.set(name,handler);return {dispose(){}};}},workspace:{getWorkspaceFolder:()=>folder},window:{activeTextEditor:{document},showErrorMessage:()=>{},withProgress:async(_,callback)=>callback({}, {isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})})},ProgressLocation:{Notification:1},Uri:{file:file=>({fsPath:file})}};
 const services={beforeOperation:async()=>{},isBusy:()=>false,setBusy:async value=>busy.push(value),classConfig:()=>({program:file,workspaceRoots:[root],projectBuild:true}),workingFiles:async config=>{config.files=[file,path.join(root,'New.cls')];},startWorking:(...args)=>session.startWorking(...args),nativeTests:session,output:{clear(){},show(){},append:text=>output.push(text),appendLine:text=>output.push(text)},diagnostics:{delete(){}},reportDiagnostic(){}};
 registerCompileCommands(vscode,{subscriptions:[]},services);
 return {vscode,commands,requests,output,busy,folder,document,session,services};
}
test('workspace build sends the real native CLI build/projectBuild contract; current-file command stays focused',async()=>{
 const h=harness();try{assert.equal((await h.commands.get('jadeNative.buildWorkspace')()).passed,true);assert.equal(h.requests[0].command,'build');assert.equal(h.requests[0].config.projectBuild,true);assert.deepEqual(h.requests[0].config.workspaceRoots,[h.folder.uri.fsPath]);assert.match(h.output.join('\n'),/new and changed/i);assert.equal((await h.commands.get('jadeNative.compileClass')()).passed,true);assert.equal(h.requests[1].config.projectBuild,false);assert.equal(h.requests[1].config.program,h.document.uri.fsPath);assert.deepEqual(h.busy,[true,false,true,false]);assert.ok(h.requests.every(request=>request.command==='build'));}finally{h.session.dispose();}
});
test('scratch/cell documents and project builds outside a workspace never call native build',async()=>{
 const h=harness();try{h.document.uri.scheme='vscode-notebook-cell';assert.equal((await h.commands.get('jadeNative.buildWorkspace')()).passed,false);h.document.uri.scheme='file';h.vscode.workspace.getWorkspaceFolder=()=>undefined;assert.equal((await h.commands.get('jadeNative.buildWorkspace')()).passed,false);assert.equal(h.requests.length,0);}finally{h.session.dispose();}
});
test('global custom-editor build drains original source before backend handoff and uses its owning project',async()=>{
 const h=harness(),calls=[],root=path.resolve('second-project'),target={uri:{scheme:'file',fsPath:path.join(root,'Partial.cls')}};
 h.services.resolveSource=async()=>{calls.push('flush');return target;};
 h.services.beforeOperation=async()=>{calls.push('before');h.vscode.window.activeTextEditor=undefined;};
 h.services.classConfig=document=>{assert.strictEqual(document,target);calls.push('config');return {program:document.uri.fsPath,workspaceRoots:[root]};};h.services.workingFiles=async config=>{config.files=[target.uri.fsPath];};
 try{assert.equal((await h.commands.get('jadeNative.buildWorkspace')()).passed,true);assert.deepEqual(calls,['flush','before','config']);assert.equal(h.requests[0].config.program,target.uri.fsPath);assert.deepEqual(h.requests[0].config.workspaceRoots,[root]);assert.equal(h.requests[0].config.projectBuild,true);}finally{h.session.dispose();}
});
test('an explicit original URI can compile without a native editor and does not fall back to stale source',async()=>{
 const h=harness(),root=path.resolve('explicit-project'),uri={scheme:'file',fsPath:path.join(root,'Only.cls')},target={uri};h.vscode.workspace.openTextDocument=async selected=>{assert.strictEqual(selected,uri);return target;};
 h.services.classConfig=document=>({program:document.uri.fsPath,workspaceRoots:[root]});h.services.workingFiles=async config=>{config.files=[uri.fsPath];};h.vscode.window.activeTextEditor=undefined;
 try{assert.equal((await h.commands.get('jadeNative.compileClass')(uri)).passed,true);assert.equal(h.requests[0].config.program,uri.fsPath);assert.equal(h.requests[0].config.projectBuild,false);}finally{h.session.dispose();}
});
