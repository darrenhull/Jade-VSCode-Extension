'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const sourcePath=path.resolve(__dirname,'../../extension/src/extension.js');
function setup(){
 const uri={fsPath:'C:/selected'},folder={uri},updates=[],messages=[];
 const settings={get:key=>key==='installPath'?'C:/Jade':undefined,update:async(...args)=>updates.push(args)};
 const vscode={workspace:{getWorkspaceFolder:value=>value===uri?folder:undefined,workspaceFolders:[{uri:{fsPath:'C:/wrong'}}],getConfiguration:(_name,resource)=>{assert.equal(resource,uri);return settings;}},window:{showQuickPick:async(items,options)=>options.title==='Choose Jade installation folder'?items[0]:({value:'singleUser'}),showInformationMessage:async text=>messages.push(text)},ConfigurationTarget:{WorkspaceFolder:3}};
 const realRequire=createRequire(sourcePath),module={exports:{}};
 const requireModule=name=>name==='vscode'?vscode:name==='node:fs'?{...fs,readdirSync:()=>[],existsSync:()=>true}:name==='./config'?{...realRequire(name),inspectInstall:installPath=>({installPath,databasePath:'C:/Jade/system',iniPath:'C:/Jade/system/jade.ini'})}:realRequire(name);
 vm.runInNewContext(fs.readFileSync(sourcePath,'utf8')+'\nmodule.exports.detectSettings=detectSettings;',{require:requireModule,module,exports:module.exports,process:{platform:'win32',env:{}},__dirname:path.dirname(sourcePath),console});
 return{run:()=>module.exports.detectSettings(uri),vscode,updates,messages};
}
test('runtime wizard uses the explicitly selected workspace resource and saves only to that folder',async()=>{
 const s=setup();await s.run();assert.equal(s.updates.length,4);assert.ok(s.updates.every(row=>row[2]===3));assert.deepEqual(s.messages,['Jade runtime settings saved. You can now connect to Database Objects.']);
});
test('cancelled runtime wizard does not write settings or report setup success',async()=>{
 const s=setup();s.vscode.window.showQuickPick=async()=>undefined;await s.run();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
});
test('detected installations retain an explicit Browse choice and explain the installation root',async()=>{
 const s=setup();let dialog;
 s.vscode.window.showQuickPick=async(items,options)=>{if(options.title==='Choose Jade installation folder'){assert.match(options.placeHolder,/bin\/jom.dll/);return items.find(item=>item.browse);}return{value:'multiUser'};};
 s.vscode.window.showOpenDialog=async options=>{dialog=options;return[{fsPath:'C:/AnotherJade'}];};
 await s.run();assert.match(dialog.title,/installation folder.*bin\/jom.dll/i);assert.ok(s.updates.some(row=>row[0]==='installPath'&&row[1]==='C:/AnotherJade'));
});
test('cancelling Browse leaves workspace settings unchanged',async()=>{
 const s=setup();s.vscode.window.showQuickPick=async items=>items.find(item=>item.browse);s.vscode.window.showOpenDialog=async()=>undefined;
 await s.run();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
});
test('cancelling server-mode selection leaves workspace settings unchanged',async()=>{
 const s=setup();s.vscode.window.showQuickPick=async(items,options)=>options.title==='Choose Jade installation folder'?items[0]:undefined;
 await s.run();assert.deepEqual(s.updates,[]);assert.deepEqual(s.messages,[]);
});
