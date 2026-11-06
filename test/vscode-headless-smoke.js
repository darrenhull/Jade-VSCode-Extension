'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,evidence=path.resolve(root,'../host-report.json');
 const tests=path.join(root,'schemas/SJetTestSchema/types/FishTest.cls'),domain=path.join(root,'schemas/SJetSchema/types/Fish.cls');
 const testText=fs.readFileSync(tests,'utf8'),domainText=fs.readFileSync(domain,'utf8');let processes=[];
 try{
  const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');assert.ok(extension);await extension.activate();
  const settings=vscode.workspace.getConfiguration('jadeNative',vscode.workspace.workspaceFolders[0].uri);
  await settings.update('installPath','C:/Jade2025',vscode.ConfigurationTarget.WorkspaceFolder);
  await settings.update('cppHelperPath','C:/not-used-by-headless/jade-native-helper.exe',vscode.ConfigurationTarget.WorkspaceFolder);
  async function open(file){const doc=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(doc);await vscode.commands.executeCommand('workbench.action.files.revert');return doc;}
  await open(tests);const compiled=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(compiled.passed,true,JSON.stringify(compiled));assert.equal(compiled.report.loaded_files,3);
  await open(tests);const repeated=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(repeated.passed,true,JSON.stringify(repeated));assert.equal(repeated.report.loaded_files,0);
  const unrelated=path.join(root,'UnrelatedBroken.cls');fs.writeFileSync(unrelated,'schemaDefinition\nSJetTestSchema subschemaOf SJetSchema partialDefinition;\ntypeHeaders\nUnrelatedBroken subclassOf MissingType transient;\ntypeDefinitions\nUnrelatedBroken completeDefinition\n(\n)\ntypeSources\n');
  const passed=await vscode.commands.executeCommand('jadeNative.runLocalTests',vscode.Uri.file(tests));assert.equal(passed.passed,true,JSON.stringify(passed));assert.equal(passed.report.results.length,4);
  assert.notEqual(path.resolve(passed.report.workingDatabase).toLowerCase(),'c:\\jade2025\\system');
  fs.writeFileSync(tests,testText.replace('assertEquals(18, fish.getLengthCm())','assertEquals(19, fish.getLengthCm())'));await open(tests);
  const failed=await vscode.commands.executeCommand('jadeNative.runLocalTests',vscode.Uri.file(tests));assert.equal(failed.passed,false);assert.equal(failed.report.failures,1);const failure=failed.report.results.find(row=>row.status==='failed');assert.equal(failure.method,'accessors_SetValues_ReturnsValues');assert.match(failure.message,/expected 19 but actual= 18/);
  fs.unlinkSync(unrelated);
  fs.writeFileSync(tests,testText);fs.writeFileSync(domain,domainText.replace('return self.name;','return self.noSuchProperty;'));await open(domain);
  const invalid=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(invalid.passed,false);const diagnostic=vscode.languages.getDiagnostics(vscode.Uri.file(domain)).find(row=>row.code===6026);assert.ok(diagnostic,JSON.stringify(invalid));
  assert.equal(diagnostic.range.start.line+1,fs.readFileSync(domain,'utf8').split(/\r?\n/).findIndex(line=>line.includes('return self.noSuchProperty'))+1);
  processes=fs.readFileSync(path.join(path.dirname(passed.report.workingDatabase),'native-commands.jsonl'),'utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.ok(processes.length);assert.ok(processes.every(row=>/\b(?:jdbutilb|jadloadb|jadclient)\.exe$/i.test(row.exe)),JSON.stringify(processes));
  assert.ok(processes.filter(row=>/\b(?:jadloadb|jadclient)\.exe$/i.test(row.exe)).every(row=>row.args.includes('path='+passed.report.workingDatabase)));
  const added=path.join(root,'schemas/SJetTestSchema/types/PulledTests.cls');
  fs.writeFileSync(added,'schemaDefinition\nSJetTestSchema subschemaOf SJetSchema partialDefinition;\ntypeHeaders\nPulledTests subclassOf JadeTestCase transient;\ntypeDefinitions\nPulledTests completeDefinition\n(\n)\ntypeSources\nPulledTests (\njadeMethodSources\npulledCheck\n{\npulledCheck() unitTest;\nbegin\nend;\n}\n)\n');
  const discovery=await vscode.commands.executeCommand('jadeNative.refreshTests');assert.equal(discovery.tests,5);assert.ok(discovery.files.some(file=>path.basename(file)==='PulledTests.cls'));
  fs.unlinkSync(added);const afterRemoval=await vscode.commands.executeCommand('jadeNative.refreshTests');assert.equal(afterRemoval.tests,4);
  fs.writeFileSync(evidence,JSON.stringify({passed:true,version:extension.packageJSON.version,vscodeVersion:vscode.version,compiledFiles:compiled.report.loaded_files,unchangedFilesLoaded:repeated.report.loaded_files,tests:4,unrelatedBrokenClassDidNotBlockTests:true,discoveryAfterPull:discovery.tests,discoveryAfterRemoval:afterRemoval.tests,failure,diagnostic:{code:diagnostic.code,line:diagnostic.range.start.line+1},workingDatabase:passed.report.workingDatabase,processes},null,2));
 }catch(error){fs.writeFileSync(evidence,JSON.stringify({passed:false,error:error.stack,processes},null,2));throw error;}
 finally{fs.writeFileSync(tests,testText);fs.writeFileSync(domain,domainText);}
}
module.exports={run};
