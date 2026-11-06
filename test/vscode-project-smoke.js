'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,evidence=path.resolve(root,'../host-report.json');
 try{
  const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');await extension.activate();const settings=vscode.workspace.getConfiguration('jadeNative',vscode.workspace.workspaceFolders[0].uri);
  await settings.update('installPath','C:/Jade2025',vscode.ConfigurationTarget.WorkspaceFolder);
  const name='UITest'+Date.now(),created=await vscode.commands.executeCommand('jadeNative.createSchema',{name,parent:'RootSchema',version:'25.0.02'});assert.ok(created.header,JSON.stringify(created));assert.equal(path.dirname(created.header),path.dirname(created.folder));
  const cls=(owner,parent,signature,source)=>`jadeVersionNumber "25.0.02";\nschemaDefinition\n${name} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf ${parent} transient, transientAllowed, subclassTransientAllowed;\ntypeDefinitions\n${owner} completeDefinition\n(\njadeMethodDefinitions\n${signature}\n)\ntypeSources\n${owner} (\njadeMethodSources\n${source}\n)\n`;
  const domain=path.join(created.folder,'types/Widget.cls'),testFile=path.join(created.folder,'types/WidgetTests.cls'),bad=path.join(created.folder,'types/Unrelated.cls'),dynamic=path.join(created.folder,'types/OnlyDynamic.cls');
  fs.writeFileSync(domain,cls('Widget','Object','getValue() : Integer;','getValue\n{\ngetValue() : Integer;\nbegin\nreturn 42;\nend;\n}'));
  const normal=cls('WidgetTests','JadeTestCase','check() unitTest;','check\n{\ncheck() unitTest;\nvars\nw : Widget;\nbegin\ncreate w transient;\nassertEquals(42,w.getValue());\nepilog\ndelete w;\nend;\n}');fs.writeFileSync(testFile,normal);
  async function open(file){const d=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(d);await vscode.commands.executeCommand('workbench.action.files.revert');return d;}
  // Schema headers themselves are valid F5 inputs.
  await open(created.header);const compiled=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(compiled.passed,true,JSON.stringify(compiled));assert.equal(compiled.report.native_project,true);
  fs.writeFileSync(bad,cls('Unrelated','NoSuchType','',''));
  await open(testFile);const staticRun=await vscode.commands.executeCommand('jadeNative.runLocalTests',vscode.Uri.file(testFile));assert.equal(staticRun.passed,true,JSON.stringify(staticRun));fs.unlinkSync(bad);
  fs.writeFileSync(dynamic,cls('OnlyDynamic','Object','',''));
  const reflected=cls('WidgetTests','JadeTestCase','check() unitTest;','check\n{\ncheck() unitTest;\nvars\nc : Class;\no : Object;\nbegin\nc := self.class.schema.getClass("OnlyDynamic");\nassertNotNull(c);\ncreate o as c transient;\nassertEquals("OnlyDynamic",o.class.name);\nepilog\ndelete o;\nend;\n}');fs.writeFileSync(testFile,reflected);await open(testFile);
  const dynamicRun=await vscode.commands.executeCommand('jadeNative.runLocalTests',vscode.Uri.file(testFile));assert.equal(dynamicRun.passed,true,JSON.stringify(dynamicRun));
  // Verify discovery against a real native extraction of a database containing
  // the test, rather than simulating a file-watcher event.
  await settings.update('databasePath',dynamicRun.report.workingDatabase,vscode.ConfigurationTarget.WorkspaceFolder);await settings.update('iniPath',path.join(path.dirname(dynamicRun.report.workingDatabase),'working.ini'),vscode.ConfigurationTarget.WorkspaceFolder);
  const verification=await vscode.commands.executeCommand('jadeNative.verifyPulledTests',{schemas:[name]});assert.equal(verification.verified,true,JSON.stringify(verification));assert.equal(verification.expected,1);
  await settings.update('databasePath',undefined,vscode.ConfigurationTarget.WorkspaceFolder);await settings.update('iniPath',undefined,vscode.ConfigurationTarget.WorkspaceFolder);
  fs.writeFileSync(testFile,normal);fs.unlinkSync(dynamic);await open(testFile);
  const afterDelete=await vscode.commands.executeCommand('jadeNative.runLocalTests',vscode.Uri.file(testFile));assert.equal(afterDelete.passed,true,JSON.stringify(afterDelete));
  fs.writeFileSync(domain,fs.readFileSync(domain,'utf8').replace('return 42;','return self.missingValue;'));await open(domain);
  const invalid=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(invalid.passed,false);assert.ok(vscode.languages.getDiagnostics(vscode.Uri.file(domain)).some(d=>d.code===6026),JSON.stringify(invalid));
  fs.writeFileSync(evidence,JSON.stringify({passed:true,version:extension.packageJSON.version,newSchema:name,headerBesideFolder:true,nativeProject:true,staticTests:staticRun.report.tests_selected,dynamicTests:dynamicRun.report.tests_selected,realPulledTestsVerified:verification.expected,deleteFollowedByTests:true,originalSourceDiagnostics:true},null,2));
 }catch(error){fs.writeFileSync(evidence,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
}
module.exports={run};
