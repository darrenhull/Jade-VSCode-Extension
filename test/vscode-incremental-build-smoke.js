'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {createFixture,requirePrivateSeed}=require('./cli-integration-fixture');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,stage=path.dirname(root),report=process.env.JADE_HEADLESS_HOST_REPORT;let api;
 try{
  const context=JSON.parse(fs.readFileSync(process.env.JADE_INCREMENTAL_NATIVE_CONTEXT,'utf8'));process.env.JADE_TEST_SEED=context.databasePath;process.env.JADE_TEST_INI=context.iniPath;process.env.JADE_TEST_INSTALL=context.installPath;requirePrivateSeed();
  const fixture=createFixture(stage),settings=vscode.workspace.getConfiguration('jadeNative',vscode.workspace.workspaceFolders[0].uri);
  for(const [key,value]of Object.entries({installPath:context.installPath,databasePath:context.databasePath,iniPath:context.iniPath,server:'singleUser',cacheDirectory:path.join(stage,'private-state')}))await settings.update(key,value,vscode.ConfigurationTarget.WorkspaceFolder);
  const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');api=await extension.activate();
  const domain=await vscode.workspace.openTextDocument(fixture.domainFile);await vscode.window.showTextDocument(domain);assert.equal(domain.languageId,'jade-nz');
  let result=await vscode.commands.executeCommand('jadeNative.buildWorkspace');assert.equal(result.passed,true,JSON.stringify(result));assert.ok(result.report.loaded_files>0);
  result=await vscode.commands.executeCommand('jadeNative.buildWorkspace');assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.report.loaded_files,0);
  const other=path.join(path.dirname(fixture.domainFile),'F5Unrelated.cls'),source=value=>`jadeVersionNumber "25.0.02";\nschemaDefinition\n${fixture.schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\nF5Unrelated subclassOf Object transient;\ntypeDefinitions\nF5Unrelated completeDefinition\n(\njadeMethodDefinitions\nvalue() : Integer;\n)\ntypeSources\nF5Unrelated (\njadeMethodSources\nvalue\n{\nvalue() : Integer;\nbegin\n return ${value};\nend;\n}\n)\n`;
  fs.writeFileSync(other,source('99'));const otherDocument=await vscode.workspace.openTextDocument(other);
  async function replace(text){const edit=new vscode.WorkspaceEdit();edit.replace(otherDocument.uri,new vscode.Range(otherDocument.positionAt(0),otherDocument.positionAt(otherDocument.getText().length)),text);assert.equal(await vscode.workspace.applyEdit(edit),true);}
  await replace(source('self.missingValue'));assert.equal(otherDocument.isDirty,true);
  result=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(result.passed,true,JSON.stringify(result));assert.equal(otherDocument.isDirty,false);
  result=await vscode.commands.executeCommand('jadeNative.buildWorkspace');assert.equal(result.passed,false,JSON.stringify(result));assert.ok(vscode.languages.getDiagnostics(otherDocument.uri).some(item=>Number(item.code)===6026),JSON.stringify(result));
  await replace(source('101'));result=await vscode.commands.executeCommand('jadeNative.buildWorkspace');assert.equal(result.passed,true,JSON.stringify(result));assert.equal(otherDocument.isDirty,false);assert.equal(vscode.languages.getDiagnostics(otherDocument.uri).length,0);
  result=await vscode.commands.executeCommand('jadeNative.buildWorkspace');assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.report.loaded_files,0);
  fs.writeFileSync(report,JSON.stringify({passed:true,version:extension.packageJSON.version,native:true,projectBuild:true,newUnrelatedClassIncluded:true,dirtyNativeBufferSaved:true,currentFileRemainsFocused:true,unchangedLoaded:0,originalFileDiagnostic:true,recovery:true,workingOnly:true},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{if(api)await api.nativeTests.request('shutdown').promise.catch(()=>{});}
}
module.exports={run};
