'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerNativeSourceDebugger}=require('../../extension/src/native-source-debugger');
const manifest=require('../../extension/package.json');
function fixture(contributions){
 const registered=[],subscriptions=[];
 const context={extensionPath:'C:/extension',extension:{packageJSON:{contributes:contributions}},subscriptions};
 const disposable=()=>({dispose(){}});
 const vscode={window:{createOutputChannel:()=>({dispose(){}})},commands:{registerCommand:disposable},languages:{registerCodeLensProvider:disposable},debug:{
  registerDebugAdapterDescriptorFactory(type){assert.ok(contributions?.debuggers?.some(row=>row.type===type),'VS Code refuses a debugger not owned by this manifest');registered.push(type);return disposable();},
  registerDebugConfigurationProvider:disposable
 }};
 return {vscode,context,registered};
}
test('the shipped manifest owns and registers its native debugger without bypassing runtime qualification',()=>{
 const f=fixture(manifest.contributes);
 assert.doesNotThrow(()=>registerNativeSourceDebugger(f.vscode,f.context,{},{}));
 assert.deepEqual(f.registered,['jade-native-experimental']);
 assert.ok(f.context.subscriptions.length>0);
});
test('a different debugger declaration does not authorize this native adapter',()=>{
 const f=fixture({debuggers:[{type:'another-debugger'}]});
 assert.doesNotThrow(()=>registerNativeSourceDebugger(f.vscode,f.context,{},{}));
 assert.deepEqual(f.registered,[]);
});
test('an explicitly owned native debugger retains its existing registration route',()=>{
 const f=fixture({debuggers:[{type:'jade-native-experimental'}]});
 registerNativeSourceDebugger(f.vscode,f.context,{},{});
 assert.deepEqual(f.registered,['jade-native-experimental']);
});