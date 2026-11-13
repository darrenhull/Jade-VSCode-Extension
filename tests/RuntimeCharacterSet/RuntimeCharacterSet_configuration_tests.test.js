'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),manifest=require('../../extension/package.json');
function activation(inspectionField='workspaceFolderValue',override){
 const folders=['ANSI','Unicode','Automatic','ExplicitAuto'].map(name=>({name,uri:{scheme:'file',fsPath:'C:/'+name}})),reads=[],writes=[],services={};
 const folderFor=resource=>folders.find(folder=>resource?.fsPath===folder.uri.fsPath||resource?.fsPath.startsWith(folder.uri.fsPath+'/'));
 const settings=new Map([[folders[0],{installPath:'C:/Jade-ANSI',characterSet:'ansi'}],[folders[1],{installPath:'C:/Jade-Unicode',characterSet:'unicode'}],[folders[2],{installPath:'C:/Jade-Auto'}],[folders[3],{installPath:'C:/Jade-Auto',characterSet:'auto'}]]);
 if(override)settings.set(folders[0],{...settings.get(folders[0]),...override});
 const vscode={workspace:{workspaceFolders:folders,textDocuments:[],isTrusted:false,getWorkspaceFolder:folderFor,onDidOpenTextDocument:()=>({dispose(){}}),onDidChangeWorkspaceFolders:()=>({dispose(){}}),getConfiguration(_section,resource){reads.push(resource);const values=settings.get(folderFor(resource))||{};return{inspect:key=>({defaultValue:manifest.contributes.configuration.properties['jadeNative.'+key]?.default,[inspectionField]:values[key]}),get:key=>Object.hasOwn(values,key)?values[key]:manifest.contributes.configuration.properties['jadeNative.'+key]?.default,update:()=>writes.push(resource)};}},languages:{createDiagnosticCollection:()=>({}),registerCodeLensProvider:()=>({})},window:{createOutputChannel:()=>({})},commands:{registerCommand:()=>({})}};
 const language={setWorkspaceSchemaResolver(){},setWorkspaceResourceResolver(){}},noop=new Proxy({},{get:()=>()=>({})}),module={exports:{}},filename=path.join(root,'extension/src/extension.js'),localRequire=createRequire(filename);
 const registrations={'./object-explorer':'registerObjectExplorer','./compile-commands':'registerCompileCommands','./jade-workspaces':'registerWorkspaces','./debugger':'registerDebugger','./sidebar':'registerSidebar'};
 vm.runInNewContext('(function(require,module){'+fs.readFileSync(filename,'utf8')+'\n})',{process,Buffer,console})((name)=>{
  if(name==='vscode')return vscode;if(name.startsWith('node:'))return require(name);
  if(name==='./language-tools')return{registerLanguageTools:()=>language};
  if(name==='./config'){const loaded={exports:{}};vm.runInNewContext('(function(require,module){'+fs.readFileSync(path.join(root,'extension/src/config.js'),'utf8')+'\n})',{process})((key)=>key==='node:fs'?{...fs,existsSync:()=>true}:require(key),loaded);return loaded.exports;}
  if(name==='./cli-client')return{CliWorkingSession:class{}};
  if(['./ProjectSkillInstaller','./WorkspaceOperationGuard','./working-directory','./source-index-scope'].includes(name))return localRequire(name);
  if(registrations[name])return{[registrations[name]]:(_v,_c,value)=>{services[name]=value;return{schemaFor(){},resourceFor(){}};}};
  return noop;
 },module);
 module.exports.activate({subscriptions:[],extensionPath:'C:/extension',globalStorageUri:{fsPath:'C:/storage'},workspaceState:{get:()=> 'initial'}});
 return{folders,reads,writes,services};
}
test('character-set setting is optional, resource-scoped and defaults to automatic native detection',()=>{
 const setting=manifest.contributes.configuration.properties['jadeNative.characterSet'];assert.ok(setting);assert.deepEqual(setting.enum,['auto','ansi','unicode']);assert.equal(setting.default,'auto');assert.equal(setting.scope,'resource');
 const [major,minor]=manifest.jadeNative.minimumCliVersion.split('.').map(Number);assert.ok(major>0||major===0&&minor>=6,'Do not release the setting with a CLI older than the native character ABI support.');
 require('../../scripts/NativeCompatibility.cjs').requireNativeVersion(path.join(root,'packages/jade-cli-win-x64'),manifest.jadeNative.minimumCliVersion);
});
for(const [index,expected] of ['ansi','unicode',undefined,'auto'].entries())test('actual activation resolves '+(expected||'omitted native default')+' for build, inspection, Scratch and debug configuration without writing settings',()=>{
 const host=activation(),folder=host.folders[index],document={uri:{scheme:'file',fsPath:folder.uri.fsPath+'/Pet.cls'},getText:()=> 'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;'};
 const configurations=[host.services['./compile-commands'].classConfig(document),host.services['./object-explorer'].config(document,folder),host.services['./jade-workspaces'].configFor(document,{folder,configurationResource:folder.uri}),host.services['./debugger'].config(document),host.services['./sidebar'].settings(folder)];
 assert.ok(configurations.every(config=>config.characterSet===expected));if(expected===undefined)assert.ok(configurations.every(config=>!Object.hasOwn(config,'characterSet'))); assert.deepEqual(host.writes,[]);assert.ok(host.reads.every(resource=>resource.fsPath.startsWith(folder.uri.fsPath)));
});
for(const scope of ['globalValue','workspaceValue','workspaceFolderValue','globalLanguageValue','workspaceLanguageValue','workspaceFolderLanguageValue'])test('explicit character-set setting from '+scope+' is retained',()=>{
 const host=activation(scope),folder=host.folders[0];assert.equal(host.services['./object-explorer'].config(undefined,folder).characterSet,'ansi');assert.deepEqual(host.writes,[]);
});
for(const characterSet of ['',null,17])test('explicit invalid '+JSON.stringify(characterSet)+' selection reaches native configuration validation unchanged',()=>{
 const host=activation('workspaceFolderValue',{characterSet}),folder=host.folders[0],document={uri:{scheme:'file',fsPath:folder.uri.fsPath+'/Pet.cls'},getText:()=> 'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;'};
 const configs=[host.services['./compile-commands'].classConfig(document),host.services['./object-explorer'].config(document,folder),host.services['./jade-workspaces'].configFor(document,{folder,configurationResource:folder.uri}),host.services['./debugger'].config(document)];
 assert.ok(configs.every(config=>config.characterSet===characterSet));assert.deepEqual(host.writes,[]);
});


test('actual class and Working inspection configuration resolve relative directories in the selected workspace',()=>{
 const host=activation('workspaceFolderValue',{workingDatabaseDirectory:'.jade/working'}),folder=host.folders[0],document={uri:{scheme:'file',fsPath:folder.uri.fsPath+'/Pet.cls'},getText:()=> 'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;'};
 const expected=path.resolve(folder.uri.fsPath,'.jade/working');
 for(const config of [host.services['./compile-commands'].classConfig(document),host.services['./object-explorer'].config(document,folder),host.services['./jade-workspaces'].configFor(document,{folder,configurationResource:folder.uri}),host.services['./debugger'].config(document)])assert.equal(config.workingDatabaseDirectory,expected);
 assert.deepEqual(host.writes,[]);
});
