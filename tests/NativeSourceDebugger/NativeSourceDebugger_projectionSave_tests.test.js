 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
test('native projection save refreshes the launch binding rather than reusing its pre-save text',async()=>{
 const filename=path.resolve(__dirname,'../../extension/src/native-source-debugger.js'),local=createRequire(filename),module={exports:{}};let services;
 vm.runInNewContext('(function(require,module){'+fs.readFileSync(filename,'utf8')+'\n})',{AbortController,process,Buffer})((name)=>name==='./debugger'?{registerDebugger:(_v,_c,value)=>{services=value;}}:local(name),module);
 const uri={scheme:'jade-source',toString:()=> 'jade-source:/value'},old='value(): Integer;\nbegin\n return 1;\nend;',updated=old.replace('return 1','return 2');let current=old;
 const document={uri,getText:()=>current},project={provider:{config:{}}};
 const workspace={record:()=>({project,document:{entityId:'method',entity:{id:'method',kind:'method',qualifiedName:{schema:'Pets',type:'Fish',member:'value'}},projection:{cacheUri:path.resolve('value.jade'),text:current}}})};
 const vscode={Uri:{parse:()=>uri},debug:{registerDebugAdapterDescriptorFactory(){},registerDebugConfigurationProvider(){}},workspace:{openTextDocument:async()=>document},window:{}};
 module.exports.registerNativeSourceDebugger(vscode,{extensionPath:process.cwd(),extension:{packageJSON:{contributes:{debuggers:[{type:'jade-native-experimental'}]}}}},workspace,{});
 await services.resolveSource(uri);current=updated;
 assert.equal((await services.selectMethod(document,'value')).body,updated);
});
