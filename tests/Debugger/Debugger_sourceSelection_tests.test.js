'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerDebugger}=require('../../extension/src/debugger');
function fixture(options={}){let provider;const errors=[],noop=()=>({dispose(){}}),document={uri:options.uri||{scheme:'output',fsPath:'/extension-output-jade-local-tools.jade-native-runner-cpp-preview-#3-Jade Compile',toString:()=> 'output:extension-output-jade-local-tools.jade-native-runner-cpp-preview-%233-Jade%20Compile'}};const vscode={window:{activeTextEditor:{document},createOutputChannel:()=>({dispose(){}}),showErrorMessage:message=>errors.push(message)},commands:{registerCommand:noop},languages:{registerCodeLensProvider:noop},debug:{registerDebugAdapterDescriptorFactory:noop,registerDebugConfigurationProvider:(_type,value)=>{provider=value;return noop();}}};registerDebugger(vscode,{subscriptions:[]},options.services||{});return{vscode,provider,document,errors};}
test('F5 configuration refuses the exact Jade Compile output URI before converting it into a file path',async()=>{const f=fixture();assert.equal(await f.provider.resolveDebugConfiguration(undefined,{}),undefined);assert.match(f.errors.join(' '),/Open.*CLS/i);});
test('explicit native launch program is retained when the Output channel has focus',async()=>{const f=fixture(),config={program:'C:/source/Fish.cls',method:'swim'};assert.deepEqual(await f.provider.resolveDebugConfiguration(undefined,config),{...config,type:'jade-native-experimental',request:'launch',name:'Jade: Debug Current Method (Experimental)'});assert.equal(f.errors.length,0);});
test('F5 retains the virtual JOX editor identity',async()=>{const uri={scheme:'jade-source',fsPath:'/Example/Generic/value',toString:()=> 'jade-source:/Example/Generic/value?generation=1'},f=fixture({uri,services:{supportsSource:value=>value?.scheme==='jade-source'}});assert.equal((await f.provider.resolveDebugConfiguration(undefined,{})).program,uri.toString());assert.equal(f.errors.length,0);});

test('F5 uses the method selected in Object Explorer instead of its class tab URI',async()=>{
 const uri={scheme:'jade-source',toString:()=> 'jade-source:/method'},f=fixture({services:{selectedSourceUri:()=>uri,supportsSource:value=>value===uri}});
 assert.equal((await f.provider.resolveDebugConfiguration(undefined,{})).program,uri.toString());
});
