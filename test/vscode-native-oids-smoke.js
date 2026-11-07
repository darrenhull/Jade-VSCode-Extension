'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');let api;
 try{
  const seed=path.resolve(process.env.JADE_TEST_SEED||'');assert.ok(seed.toLowerCase().startsWith(path.resolve(require('node:os').tmpdir(),'jade-cli-integration-seed-').toLowerCase()),'Only a disposable native integration seed is allowed.');
  require('./PrivateNativeFixture').assertPrivateIniPaths(seed,fs.readFileSync(process.env.JADE_TEST_INI,'utf8'));
  const settings=vscode.workspace.getConfiguration('jadeNative',vscode.workspace.workspaceFolders[0].uri),workingDirectory=path.resolve(root,'../inspection-working'),install=process.env.JADE_TEST_INSTALL||'C:/Jade2025';
  for(const [name,value] of Object.entries({installPath:install,databasePath:seed,iniPath:process.env.JADE_TEST_INI,server:'singleUser',schema:'RootSchema',workingDatabaseDirectory:workingDirectory}))await settings.update(name,value,vscode.ConfigurationTarget.WorkspaceFolder);
  const ext=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');api=await ext.activate();const explorer=api.objectExplorer;assert.ok(explorer);
  const results=[];
  for(const selection of ['source','working']){
   await explorer.session.select(selection);
   if(selection==='working'){await api.nativeTests.prepareWorking({installPath:install,databasePath:seed,iniPath:process.env.JADE_TEST_INI,workingDatabaseDirectory:workingDirectory,storagePath:path.resolve(root,'../inspection-storage'),workspaceRoots:[root],workingDatabaseGeneration:'initial',timeoutMilliseconds:120000});}
   const target=await vscode.commands.executeCommand('jadeNative.connectObjects');assert.equal(target.readOnly,true,JSON.stringify(target));assert.equal(target.selection,selection);if(selection==='working')assert.notEqual(path.resolve(target.databasePath),seed);
   assert.equal((await explorer.session.client.ready).oidFormat,'jade-native');
   const value=await vscode.commands.executeCommand('jadeNative.inspectObject','1.1');assert.equal(value.oid,'1.1');assert.equal(value.className,'Schema');assert.equal(value.readOnly,true);
   const previous=await vscode.env.clipboard.readText();try{await vscode.commands.executeCommand('jadeNative.copyObjectOid',{oid:value.oid});assert.equal(await vscode.env.clipboard.readText(),'1.1');}finally{await vscode.env.clipboard.writeText(previous);}
   assert.equal(explorer.session.history.at(-1).oid,'1.1');
   const object=await explorer.session.request('object',{oid:'1.1'});assert.equal(object.oidFormat,'jade-native');assert.equal(object.oid,'1.1');
   results.push({selection,readOnly:true,nativeOid:value.oid,className:value.className,databasePath:target.databasePath});
   await explorer.releaseForOperation();
  }
  fs.writeFileSync(report,JSON.stringify({passed:true,version:ext.packageJSON.version,results,nativeIdentityRendered:true,nativeIdentityCopied:true,historyPreserved:true,inspectorSha256:require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(__dirname,"../vendor/jade-tools-cli/native/jade-inspect-helper.exe"))).digest("hex")},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{await api?.objectExplorer?.releaseForOperation();await api?.nativeTests?.release();api?.nativeTests?.dispose();if(process.env.JADE_TOOLS_STATE_DIRECTORY){const result=require('node:child_process').spawnSync(path.join(__dirname,'../vendor/jade-tools-cli/jade-cli.exe'),['shutdown','--json'],{env:process.env,windowsHide:true,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);}}
}
module.exports={run};
