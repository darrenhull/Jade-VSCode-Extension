'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {testingHarness}=require('../../test/helpers/testing-harness');
const {registerTesting}=require('../../extension/src/testing');

// Execute the real registered callback, including its early guards. Keeping this
// harness separate from activate() avoids launching native processes or views.
function fixture({busy=true,result,sourceReady,inputsReady,indexReady,indexFailure,uiReady,dirty=false,save=async()=>true}={}){
 const source=fs.readFileSync(path.join(__dirname,'../../extension/src/extension.js'),'utf8');
 const start=source.indexOf("vscode.commands.registerCommand('jadeNative.executeLocalTests',");
 const end=source.indexOf("vscode.commands.registerCommand('jadeNative.refreshTypeCache',",start);
 assert.ok(start>=0&&end>start,'Registered local-test command must remain discoverable');
 const expression=source.slice(start,end).trim().replace(/,$/,'');
 const calls={messages:[],output:[],native:0,prepare:0,sourceIndex:0,order:[],context:[]},h=testingHarness();let command;
 const sourceText='schemaDefinition\nProbeTests subschemaOf RootSchema partialDefinition;\ntypeHeaders\nProbe subclassOf JadeTestCase transient;\ntypeDefinitions\nProbe completeDefinition ()\ntypeSources\nProbe (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\n assertTrue(true);\nend;\n}\n)\n';
 const document={uri:h.api.Uri.file('C:/synthetic/Probe.cls'),isDirty:dirty,save,getText:()=>sourceText,positionAt:offset=>({line:sourceText.slice(0,offset).split('\n').length-1,character:0})};
 const disposable=()=>({dispose(){}});
 const vscode={...h.api,ProgressLocation:{Notification:1},commands:{registerCommand(name,handler){assert.equal(name,'jadeNative.executeLocalTests');command=handler;return disposable();},async executeCommand(name,key,value){calls.context.push(value);if(name==='setContext'&&value===false)await uiReady;}},window:{showErrorMessage(message){calls.messages.push(message);},showInformationMessage(){},async withProgress(options,task){return task({}, {onCancellationRequested:disposable});}},workspace:{textDocuments:[document],findFiles:async()=>[document.uri],createFileSystemWatcher:()=>({dispose(){},onDidCreate:disposable,onDidChange:disposable,onDidDelete:disposable}),onDidOpenTextDocument:disposable,onDidChangeTextDocument:disposable,async openTextDocument(){return document;}}};
 const sandbox={vscode,language:{ensureSourceIndex:async config=>{calls.sourceIndex++;calls.order.push('source-index');assert.equal(config.program,document.uri.fsPath);await indexReady;if(indexFailure)throw indexFailure;calls.order.push('index-ready');}},diagnosticLines:require('../../extension/src/compiler-diagnostic-presentation').diagnosticLines,nativeTests:{},publishing:busy,resolveSource:async()=>{await sourceReady;return document;},path,classConfig:()=>({program:document.uri.fsPath}),diagnostics:{delete(){}},reportDiagnostic(){},testOutput:{clear(){},show(){},append(text){calls.output.push(text);},appendLine(text){calls.output.push(text+'\n');}},workingFiles:async()=>{calls.prepare++;calls.order.push('save');await inputsReady;},startWorking(config,operation,onOutput){assert.equal(calls.sourceIndex,1);assert.equal(calls.order.at(-1),'index-ready');calls.order.push('native');calls.native++;return{stop(){},completion:Promise.resolve(result)}}};
 vm.runInNewContext(expression,sandbox,{filename:'registered-executeLocalTests.js'});
 const manager=registerTesting(vscode,{subscriptions:[]},(...args)=>command(...args));
 return{calls,h,document,command,manager,sandbox};
}
module.exports={fixture};
