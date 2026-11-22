'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');

test('prepared semantic launch reuses accepted Working without legacy compilation or Source',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-semantic-debug-')),projection=path.join(root,'.jade','projections','Test.cls');
 fs.mkdirSync(path.dirname(projection),{recursive:true});
 const source=fs.readFileSync(path.resolve(__dirname,'../../test/fixtures/DebugDemo.cls'),'utf8');
 fs.writeFileSync(projection,source);fs.mkdirSync(path.join(root,'vendor','jade-tools-cli','native'),{recursive:true});
 fs.writeFileSync(path.join(root,'vendor','jade-tools-cli','native','debugger-abi.json'),JSON.stringify({libraries:{}}));
 const uri={scheme:'jade-source',fsPath:'/TestSchema/DebugTest.cls',toString:()=> 'jade-source:/TestSchema/DebugTest.cls'};
 const document={isDirty:false,uri,getText:()=>source},disposable={dispose(){}};let adapter,captured,prepared=0;
 class Emitter{constructor(){this.events=new EventEmitter();this.event=listener=>{this.events.on('message',listener);return disposable;};}fire(value){this.events.emit('message',value);}dispose(){this.events.removeAllListeners();}}
 const vscode={Uri:{file:value=>({scheme:'file',fsPath:value,toString:()=>value}),parse:value=>uri},EventEmitter:Emitter,DebugAdapterInlineImplementation:class{constructor(value){this.adapter=value;}},window:{activeTextEditor:{document,selection:{active:{}}},createOutputChannel:()=>({clear(){},show(){},append(){},appendLine(){}}),showInformationMessage:async()=>{}},workspace:{openTextDocument:async()=>document},commands:{registerCommand:()=>disposable},languages:{registerCodeLensProvider:()=>disposable},debug:{registerDebugAdapterDescriptorFactory:(_type,factory)=>{adapter=factory.createDebugAdapterDescriptor().adapter;return disposable;},registerDebugConfigurationProvider:()=>disposable}};
 const filename=path.resolve(__dirname,'../../extension/src/debugger.js'),localRequire=createRequire(filename),module={exports:{}};
 class NativeDebugger extends EventEmitter{constructor(_executable,session){super();captured=JSON.parse(fs.readFileSync(session,'utf8'));}stop(){}}
 vm.runInNewContext('(function(require,module){'+fs.readFileSync(filename,'utf8')+'\n})',{AbortController,Buffer,console,process})((name)=>name==='./debug-transport'?{NativeDebugger}:localRequire(name),module);
 module.exports.registerDebugger(vscode,{subscriptions:[],extensionPath:root},{
  isBusy:()=>false,setBusy:async()=>{},supportsSource:value=>value?.scheme==='jade-source',resolveSource:async()=>document,config:()=>({}),
  sourcePath:()=>projection,prepareLaunch:async(_document,_selected,_output,_signal)=>{prepared++;return{config:{sourceFormat:'jox',characterSet:'ansi'},working:{root:path.join(root,'working'),installPath:root,databasePath:path.join(root,'working','system'),workingMode:'git-first'}};},
  workingFiles:()=>assert.fail('legacy compile input discovery must not run'),startWorking:()=>assert.fail('legacy Source compilation must not run'),prepareWorking:()=>assert.fail('semantic launch owns Working preparation')
 });
 const messages=[];adapter.onDidSendMessage(value=>messages.push(value));
 try{
  await adapter.handleMessage({seq:1,command:'launch',arguments:{program:uri.toString(),method:'calculate'}});
  assert.equal(prepared,1,JSON.stringify(messages));assert.equal(captured.sourceFormat,'jox');assert.equal(captured.characterSet,'ansi');assert.equal(captured.workingMode,'git-first');
  assert.equal(captured.sourceDatabasePath,undefined);assert.equal(captured.schema,'SJetSchema');assert.equal(captured.owner,'DebugDemo');assert.equal(captured.method,'calculate');
 }finally{adapter.dispose();await adapter.finish();fs.rmSync(root,{recursive:true,force:true});}
});
