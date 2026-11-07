'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {WorkspaceContext}=require('../../extension/src/WorkspaceContext');
function uri(value,scheme='file'){return {scheme,fsPath:value,toString:()=>scheme+':'+value};}
function activateScratchConfiguration(){
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},notebookDocuments=[],reads=[];
 const folderFor=value=>value?.scheme==='file'?[a,b].find(folder=>value.fsPath===folder.uri.fsPath||value.fsPath.startsWith(folder.uri.fsPath+'/')):undefined;
 const values=new Map([[a,{installPath:'C:/Jade-A'}],[b,{installPath:'C:/Jade-B',databasePath:'${workspaceFolder}/source/system',iniPath:'${workspaceFolder}/source/custom.ini',cacheDirectory:'state',server:'multiUser'}]]);
 const vscode={
  workspace:{workspaceFolders:[a,b],notebookDocuments,getWorkspaceFolder:folderFor,getConfiguration(_section,resource){reads.push(resource);const settings=values.get(folderFor(resource))||{installPath:'C:/Wrong-Global-Jade',server:'singleUser'};return {get:key=>settings[key]};}},
  languages:{createDiagnosticCollection:()=>({}),registerCodeLensProvider:()=>({})},
  window:{createOutputChannel:()=>({})},commands:{registerCommand:()=>({})}
 };
 const language={setWorkspaceSchemaResolver(){},setWorkspaceResourceResolver(){}};
 let options;const exported={exports:{}},noop=new Proxy({},{get:()=>()=>({})});
 const source=fs.readFileSync(path.resolve(__dirname,'../../extension/src/extension.js'),'utf8');
 vm.runInNewContext('(function(require,module){'+source+'\n})',{process,Buffer,console})((name)=>{
  if(name==='vscode')return vscode;if(name.startsWith('node:'))return require(name);
  if(name==='./language-tools')return {registerLanguageTools:()=>language};
  if(name==='./cli-client')return {CliWorkingSession:class{}};
  if(name==='./jade-workspaces')return {registerWorkspaces(_vscode,_context,value){options=value;return {schemaFor(){},resourceFor(){}};}};
  return noop;
 },exported);
 exported.exports.activate({subscriptions:[],extensionPath:'C:/extension',globalStorageUri:{fsPath:'C:/storage'},workspaceState:{get:()=> 'initial'}});
 let prompts=0;const context=new WorkspaceContext({workspace:vscode.workspace,pickFolder:async()=>{prompts++;return b;}});
 return {a,b,notebookDocuments,reads,context,configFor:options.configFor,prompts:()=>prompts};
}
test('actual activation reads an untitled Scratch Pad connection from its selected project and reuses that selection',async()=>{
 const host=activateScratchConfiguration(),document={uri:uri('Scratch-1','untitled')},scope=await host.context.resolve(document.uri);
 const config=host.configFor(document,scope);
 assert.equal(config.installPath,'C:/Jade-B');assert.equal(config.databasePath,'C:/B/source/system');assert.equal(config.iniPath,'C:/B/source/custom.ini');assert.equal(config.server,'multiUser');
 assert.deepEqual(Array.from(config.workspaceRoots),['C:/B']);assert.equal(config.storagePath,path.resolve('C:/B','state'));
 assert.equal(host.reads.at(-1),host.b.uri);assert.equal(scope.resource,document.uri);
 assert.equal(host.configFor(document,await host.context.resolve(document.uri)).installPath,'C:/Jade-B');assert.equal(host.prompts(),1);
});
test('actual activation retains saved notebook resource settings without asking for another project',async()=>{
 const host=activateScratchConfiguration(),notebookUri=uri('C:/B/Saved.jadeworkspace'),document={uri:uri('C:/B/Saved.jadeworkspace#1','vscode-notebook-cell')};
 host.notebookDocuments.push({uri:notebookUri,getCells:()=>[{document}]});
 const scope=await host.context.resolve(document.uri),config=host.configFor(document,scope);
 assert.equal(config.installPath,'C:/Jade-B');assert.equal(host.reads.at(-1),notebookUri);assert.equal(host.prompts(),0);
});
