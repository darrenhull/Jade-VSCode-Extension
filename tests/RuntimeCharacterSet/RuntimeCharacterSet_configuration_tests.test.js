'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),manifest=require('../../extension/package.json');
function activation(inspectionField='workspaceFolderValue',override){
 const folders=['ANSI','Unicode','Automatic','ExplicitAuto'].map(name=>({name,uri:{scheme:'file',fsPath:'C:/'+name}})),reads=[],writes=[],services={};let onboardingRegistrations=0,onboardingResumes=0,joxSetupRegistrations=0;
 const folderFor=resource=>folders.find(folder=>resource?.fsPath===folder.uri.fsPath||resource?.fsPath.startsWith(folder.uri.fsPath+'/'));
 const settings=new Map([[folders[0],{installPath:'C:/Jade-ANSI',characterSet:'ansi'}],[folders[1],{installPath:'C:/Jade-Unicode',characterSet:'unicode'}],[folders[2],{installPath:'C:/Jade-Auto'}],[folders[3],{installPath:'C:/Jade-Auto',characterSet:'auto'}]]);
 if(override)settings.set(folders[0],{...settings.get(folders[0]),...override});
 const vscode={workspace:{workspaceFolders:folders,textDocuments:[],isTrusted:false,getWorkspaceFolder:folderFor,onDidOpenTextDocument:()=>({dispose(){}}),onDidChangeWorkspaceFolders:()=>({dispose(){}}),getConfiguration(_section,resource){reads.push(resource);const values=settings.get(folderFor(resource))||{};return{inspect:key=>({defaultValue:manifest.contributes.configuration.properties['jadeNative.'+key]?.default,[inspectionField]:values[key]}),get:key=>Object.hasOwn(values,key)?values[key]:manifest.contributes.configuration.properties['jadeNative.'+key]?.default,update:()=>writes.push(resource)};}},languages:{createDiagnosticCollection:()=>({}),registerCodeLensProvider:()=>({})},window:{createOutputChannel:()=>({})},commands:{registerCommand:()=>({})}};
 const language={setWorkspaceSchemaResolver(){},setWorkspaceResourceResolver(){}},noop=new Proxy({},{get:()=>()=>({})}),module={exports:{}},filename=path.join(root,'extension/src/extension.js'),localRequire=createRequire(filename);
 const registrations={'./object-explorer':'registerObjectExplorer','./compile-commands':'registerCompileCommands','./jade-workspaces':'registerWorkspaces','./debugger':'registerDebugger','./sidebar':'registerSidebar'};
 vm.runInNewContext('(function(require,module){'+fs.readFileSync(filename,'utf8')+'\n})',{process,Buffer,console})((name)=>{
  if(name==='vscode')return vscode;if(name.startsWith('node:'))return require(name);
  if(name==='./jox-project-setup')return{registerJoxProjectSetup(_v,_c,_workspace,options){joxSetupRegistrations++;assert.equal(typeof options.configFor,'function');return{onboarding:{async resume(){}}};}};
  if(name==='./workspace-initialization')return {registerWorkspaceInitialization:()=>({initialize:async()=>assert.fail('Configuration fixture must not initialize a project')})};
  if(name==='./workspace-onboarding')return {registerWorkspaceOnboarding(_vscode,_context,services){onboardingRegistrations++;assert.equal(typeof services.initialize,'function');assert.equal(typeof services.connectWorking,'function');return {async resume(){onboardingResumes++;}};}};
  if(name==='./language-tools')assert.fail('JOX activation must not register the legacy CLS language index');
  if(name==='./register-jox-workspace')return{registerJoxWorkspace:(_v,_c,value)=>{services.jox=value;return{workspace:{executing:false}};}};
  if(name==='./config'){const loaded={exports:{}};vm.runInNewContext('(function(require,module){'+fs.readFileSync(path.join(root,'extension/src/config.js'),'utf8')+'\n})',{process})((key)=>key==='node:fs'?{...fs,existsSync:()=>true}:require(key),loaded);return loaded.exports;}
  if(name==='./cli-client')return{CliWorkingSession:class{request(command,{operation,cwd,argv}){assert.equal(command,'prepare');assert.equal(operation,'inspect.target');const install=argv.indexOf('--install');return{promise:Promise.resolve({code:0,passed:true,prepared:{config:{sourceFormat:'jox',installPath:install<0?'':argv[install+1],characterSet:'auto',workspaceRoots:[cwd]},configFile:null}})};}}};
  if(['./ProjectSkillInstaller','./WorkspaceOperationGuard','./working-directory','./source-index-scope','./inspection-config'].includes(name))return localRequire(name);
  if(registrations[name])return{[registrations[name]]:(_v,_c,value)=>{services[name]=value;return{schemaFor(){},resourceFor(){}};}};
  return noop;
 },module);
 module.exports.activate({subscriptions:[],extensionPath:'C:/extension',globalStorageUri:{fsPath:'C:/storage'},workspaceState:{get:()=> 'initial'}});
 assert.equal(onboardingRegistrations,0);assert.equal(onboardingResumes,0);assert.equal(joxSetupRegistrations,1);
 assert.equal(typeof services.jox.configFor,'function');
 return{folders,reads,writes,services,source:folder=>services.jox.configFor(folder),inspection:folder=>services['./object-explorer'].config(undefined,folder)};
}
test('character-set setting is optional, resource-scoped and defaults to automatic native detection',()=>{
 const setting=manifest.contributes.configuration.properties['jadeNative.characterSet'];assert.ok(setting);assert.deepEqual(setting.enum,['auto','ansi','unicode']);assert.equal(setting.default,'auto');assert.equal(setting.scope,'resource');
 const [major,minor]=manifest.jadeNative.minimumCliVersion.split('.').map(Number);assert.ok(major>0||major===0&&minor>=6,'Do not release the setting with a CLI older than the native character ABI support.');
 require('../../scripts/NativeCompatibility.cjs').requireNativeVersion(path.join(root,'packages/jade-cli-win-x64'),manifest.jadeNative.minimumCliVersion);
});
for(const [index,expected] of ['ansi','unicode',undefined,'auto'].entries())test('actual activation resolves '+(expected||'omitted native default')+' for native JOX execution and inspection without writing settings',async()=>{
 const host=activation(),folder=host.folders[index],document={uri:{scheme:'file',fsPath:folder.uri.fsPath+'/Pet.cls'},getText:()=> 'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;'};
 const execution=host.source(folder),inspection=await host.inspection(folder);
 assert.equal(execution.characterSet,expected);assert.equal(inspection.characterSet,expected===undefined?'auto':expected);
 if(expected===undefined)assert.ok(!Object.hasOwn(execution,'characterSet'),'Automatic selection must remain omitted for native execution resolution'); assert.deepEqual(host.writes,[]);assert.ok(host.reads.every(resource=>resource.fsPath.startsWith(folder.uri.fsPath)));
});
for(const scope of ['globalValue','workspaceValue','workspaceFolderValue','globalLanguageValue','workspaceLanguageValue','workspaceFolderLanguageValue'])test('explicit character-set setting from '+scope+' is retained',async()=>{
 const host=activation(scope),folder=host.folders[0];assert.equal((await host.inspection(folder)).characterSet,'ansi');assert.deepEqual(host.writes,[]);
});
for(const characterSet of ['',null,17])test('explicit invalid '+JSON.stringify(characterSet)+' selection reaches native configuration validation unchanged',async()=>{
 const host=activation('workspaceFolderValue',{characterSet}),folder=host.folders[0],document={uri:{scheme:'file',fsPath:folder.uri.fsPath+'/Pet.cls'},getText:()=> 'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;'};
 const configs=[host.source(folder),await host.inspection(folder)];
 assert.ok(configs.every(config=>config.characterSet===characterSet));assert.deepEqual(host.writes,[]);
});


test('native JOX config retains relative overrides for native resolution while Working inspection binds the selected workspace',async()=>{
 const host=activation('workspaceFolderValue',{workingDatabaseDirectory:'.jade/working'}),folder=host.folders[0];
 assert.equal(host.source(folder).workingDatabaseDirectory,'.jade/working');
 assert.equal((await host.inspection(folder)).workingDatabaseDirectory,path.resolve(folder.uri.fsPath,'.jade/working'));
 assert.equal(host.source(folder).sourceFormat,'jox');
 assert.equal(Object.hasOwn(host.source(folder),'workspaceRoots'),false);
 assert.deepEqual(host.writes,[]);
});

test('dedicated Working preparation limit reaches native JOX execution and inspection configuration',async()=>{
 const host=activation('workspaceFolderValue',{workingDatabaseTimeoutSeconds:7200,testTimeoutSeconds:30}),folder=host.folders[0];
 for(const config of [host.source(folder),await host.inspection(folder)]){assert.equal(config.workingDatabaseTimeoutSeconds,7200);assert.equal(config.testTimeoutSeconds,30);}
 assert.deepEqual(host.writes,[]);
});
