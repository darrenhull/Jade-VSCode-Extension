'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {registerProjectTools}=require('../../extension/src/project-tools');
test('publish preparation uses the native Working database and stops before approval when it fails',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-publish-native-target-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const header=path.join(root,'Pets.scm');fs.writeFileSync(header,require('../../extension/src/native-project').minimalSchema('Pets','RootSchema','25.0.02'));
 const commands=new Map(),folder={uri:{fsPath:root}},config={installPath:root,databasePath:path.join(root,'source'),iniPath:path.join(root,'jade.ini'),storagePath:path.join(root,'storage'),workspaceRoots:[root],schema:'Pets'};
 let prepared=0,confirmed=0,busy=false;
 const vscode={workspace:{workspaceFolders:[folder],textDocuments:[],openTextDocument:async file=>({uri:{fsPath:file}})},commands:{registerCommand:(name,handler)=>(commands.set(name,handler),{dispose(){}})},window:{showErrorMessage:async()=>{},showWarningMessage:async()=>{confirmed++;}}};
 const tools=registerProjectTools(vscode,{subscriptions:[],workspaceState:{get:(_key,fallback)=>fallback}},{config:()=>config,isBusy:()=>busy,setBusy:async value=>busy=value,output:{clear(){},show(){},append(){},appendLine(){}},prepareWorking:async()=>{prepared++;throw Error('Native Working target unavailable');}});
 const result=await commands.get('jadeNative.publishWorkspace')();assert.equal(prepared,1);assert.match(result.error,/Native Working target unavailable/);assert.equal(confirmed,0);assert.equal(busy,false);
});
test('project publication captures the custom source project before asynchronous preparation',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-publish-resource-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folders=['one','two'].map(name=>({name,uri:{fsPath:path.join(root,name)}}));for(const folder of folders){fs.mkdirSync(folder.uri.fsPath);fs.writeFileSync(path.join(folder.uri.fsPath,'Pets.scm'),require('../../extension/src/native-project').minimalSchema('Pets','RootSchema','25.0.02'));}
 const resource=folder=>({scheme:'file',fsPath:path.join(folder.uri.fsPath,'Fish.cls')}),target=resource(folders[1]),commands=new Map(),seen=[];let busy=false;
 const vscode={workspace:{workspaceFolders:folders,textDocuments:[],getWorkspaceFolder:uri=>folders.find(folder=>uri.fsPath.startsWith(folder.uri.fsPath)),openTextDocument:async file=>({uri:{fsPath:file}})},commands:{registerCommand:(name,handler)=>(commands.set(name,handler),{dispose(){}})},window:{activeTextEditor:{document:{uri:resource(folders[0])}},tabGroups:{activeTabGroup:{activeTab:{input:{viewType:'jade.classWorkspace',uri:target}}}},showErrorMessage:async()=>{},showQuickPick:async()=>assert.fail('A known custom source must not select a different project'),showWarningMessage:async()=>assert.fail('Preparation fails before any publication confirmation')}};
 registerProjectTools(vscode,{subscriptions:[],workspaceState:{get:(_key,fallback)=>fallback}},{beforeOperation:async()=>{vscode.window.tabGroups.activeTabGroup.activeTab.input.uri=resource(folders[0]);},config:document=>({installPath:root,databasePath:path.join(root,'source'),iniPath:path.join(root,'jade.ini'),storagePath:path.join(root,'storage'),workspaceRoots:[path.dirname(document.uri.fsPath)],schema:'Pets'}),isBusy:()=>busy,setBusy:async value=>busy=value,output:{clear(){},show(){},append(){},appendLine(){}},prepareWorking:async config=>{seen.push(config.workspaceRoots);throw Error('Stop before native publication');}});
 const result=await commands.get('jadeNative.publishWorkspace')();assert.match(result.error,/Stop before native publication/);assert.deepEqual(seen,[[folders[1].uri.fsPath]]);assert.equal(busy,false);
});
