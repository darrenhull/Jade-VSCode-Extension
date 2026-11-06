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
