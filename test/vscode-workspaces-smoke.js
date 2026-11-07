'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vscode=require('vscode');
async function run() {
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');
 let originalRequest,notebook,api,nativeContext;
 try {
  const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');api=await extension.activate();
  nativeContext=process.env.JADE_WORKSPACE_NATIVE_CONTEXT?JSON.parse(fs.readFileSync(process.env.JADE_WORKSPACE_NATIVE_CONTEXT,'utf8')):undefined;
  if(nativeContext) {
    const relative=path.relative(fs.realpathSync(os.tmpdir()),fs.realpathSync(nativeContext.databasePath));
    assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative)&&relative.startsWith('jade-cli-integration-seed-'),'Native Workspace host requires a disposable private integration seed.');
    const fixture=require('./cli-integration-fixture').createFixture(path.dirname(root));nativeContext={...nativeContext,schema:fixture.schema};
  }
  const config=vscode.workspace.getConfiguration('jadeNative');
  for(const [key,value]of Object.entries({installPath:nativeContext?.installPath||'C:/Jade2025',databasePath:nativeContext?.databasePath,iniPath:nativeContext?.iniPath,cacheDirectory:path.resolve(root,'../private-state')}))if(value)await config.update(key,value,vscode.ConfigurationTarget.Workspace);
  if(!nativeContext) {
    // This mode verifies actual editor/Notebook contracts, not Jade semantics.
    // The explicit native mode below uses the packaged CLI without this fixture.
    originalRequest=api.nativeTests.request;
    api.nativeTests.request=function(command,body,output){
      if(command!=='workspace.run')return originalRequest.call(this,command,body,output);
      const bad=body.sourceText.includes('missingWorkspaceValue'),value=body.sourceText.includes('6 * 8')?'48':'42';
      return {id:41,promise:Promise.resolve({code:bad?6027:0,passed:!bad,report:{compiled:!bad,executed:!bad,output:bad?'':value,elapsedMilliseconds:17,diagnostics:bad?[{source:body.source,position:body.sourceText.indexOf('missingWorkspaceValue'),length:21,compiler_error:6027,message:'Unknown identifier'}]:[]}})};
    };
  }
  notebook=await vscode.commands.executeCommand('jadeNative.newWorkspace');assert.equal(notebook.notebookType,'jade-workspace');assert.equal(notebook.cellCount,2);
  const metadata=new vscode.WorkspaceEdit();metadata.set(notebook.uri,[vscode.NotebookEdit.updateNotebookMetadata({schema:nativeContext?.schema||'WorkspacePets'})]);assert.equal(await vscode.workspace.applyEdit(metadata),true);
  const cell=notebook.cellAt(1),text=()=>cell.outputs.flatMap(output=>output.items.map(item=>Buffer.from(item.data).toString('utf8'))).join('\n');
  const initial=new vscode.WorkspaceEdit();initial.replace(cell.document.uri,new vscode.Range(cell.document.positionAt(0),cell.document.positionAt(cell.document.getText().length)),'vars\n value : Integer;\nbegin\n value := 6 * 7;\n write value;\nend;');assert.equal(await vscode.workspace.applyEdit(initial),true);
  await api.workspaces.controller.executeHandler([cell],notebook,api.workspaces.controller);assert.match(text(),/42/);assert.match(text(),/Working/);
  const change=new vscode.WorkspaceEdit();change.replace(cell.document.uri,new vscode.Range(cell.document.positionAt(0),cell.document.positionAt(cell.document.getText().length)),cell.document.getText().replace('6 * 7','6 * 8'));assert.equal(await vscode.workspace.applyEdit(change),true);
  await api.workspaces.controller.executeHandler([cell],notebook,api.workspaces.controller);assert.match(text(),/48/);assert.ok(api.workspaces.history.pair(cell.document.uri.toString()));
  await vscode.commands.executeCommand('jadeNative.compareWorkspaceRuns',cell);
  assert.ok(vscode.window.tabGroups.all.flatMap(group=>group.tabs).some(tab=>tab.input instanceof vscode.TabInputTextDiff&&tab.input.original.scheme==='jade-workspace-run'));
  const invalid=new vscode.WorkspaceEdit();invalid.replace(cell.document.uri,new vscode.Range(cell.document.positionAt(0),cell.document.positionAt(cell.document.getText().length)),'begin\n write missingWorkspaceValue;\nend;');assert.equal(await vscode.workspace.applyEdit(invalid),true);
  const bad=await api.workspaces.controller.executeHandler([cell],notebook,api.workspaces.controller);
  assert.ok(vscode.languages.getDiagnostics(cell.document.uri).length>0,'Native/script diagnostic must point to the notebook cell.');
  assert.match(text(),/Jade|Unknown/);
  const restore=new vscode.WorkspaceEdit();restore.replace(cell.document.uri,new vscode.Range(cell.document.positionAt(0),cell.document.positionAt(cell.document.getText().length)),'vars\n value : Integer;\nbegin\n value := 6 * 8;\n write value;\nend;');assert.equal(await vscode.workspace.applyEdit(restore),true);
  await api.workspaces.controller.executeHandler([cell],notebook,api.workspaces.controller);assert.equal(vscode.languages.getDiagnostics(cell.document.uri).length,0);assert.match(text(),/48/);
  const plainFile=path.join(root,'ScratchSelection.jade');fs.writeFileSync(plainFile,'// prefix\nwrite 42;\n');
  const plainDocument=await vscode.workspace.openTextDocument(plainFile),plainEditor=await vscode.window.showTextDocument(plainDocument);
  plainEditor.selection=new vscode.Selection(plainDocument.positionAt(10),plainDocument.positionAt(plainDocument.getText().length));
  const selected=await vscode.commands.executeCommand('jadeNative.runWorkspaceSelection',{schema:notebook.metadata.schema});assert.equal(selected.passed,true,JSON.stringify(selected));assert.match(selected.report.output,/42/);
  if(nativeContext) {
    const probe=path.join(root,'ScratchpadDiagnosticProbe.cls'),header='jadeVersionNumber "25.0.02";\nschemaDefinition\n'+nativeContext.schema+' subschemaOf RootSchema partialDefinition;\n';
    const source=header+'typeHeaders\nScratchpadDiagnosticProbe subclassOf Object transient;\ntypeDefinitions\nScratchpadDiagnosticProbe completeDefinition\n(\nattributeDefinitions\n breed:String[50 number=1,ordinal=1;\njadeMethodDefinitions\ngetBreed():String;\n)\ntypeSources\nScratchpadDiagnosticProbe (\njadeMethodSources\ngetBreed\n{\ngetBreed():String;\nbegin\n return self.breed;\nend;\n}\n)\n';
    fs.writeFileSync(probe,source);const probeDocument=await vscode.workspace.openTextDocument(probe);await vscode.window.showTextDocument(probeDocument);
    const broken=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(broken.passed,false);
    const syntax=vscode.languages.getDiagnostics(probeDocument.uri).find(diagnostic=>Number(diagnostic.code)===7041);assert.ok(syntax,'F5 structural error must be published as a VS Code diagnostic for Error Lens.');assert.equal(syntax.range.start.line,source.slice(0,source.indexOf('breed:')).split('\n').length-1);
    const repair=new vscode.WorkspaceEdit();repair.replace(probeDocument.uri,new vscode.Range(probeDocument.positionAt(0),probeDocument.positionAt(source.length)),source.replace('String[50 number','String[50] number'));assert.equal(await vscode.workspace.applyEdit(repair),true);await probeDocument.save();
    const fixed=await vscode.commands.executeCommand('jadeNative.compileClass');assert.equal(fixed.passed,true,JSON.stringify(fixed));assert.equal(vscode.languages.getDiagnostics(probeDocument.uri).length,0);
  }
  const serialized=api.workspaces.serializer.serializeNotebook({metadata:notebook.metadata,cells:notebook.getCells().map(cell=>({kind:cell.kind,value:cell.document.getText()}))});
  assert.ok(!Buffer.from(serialized).toString('utf8').includes('elapsedMilliseconds'));assert.ok(api.workspaces.serializer.deserializeNotebook(serialized).cells.some(cell=>cell.languageId==='markdown'));
  await vscode.window.showNotebookDocument(notebook);
  fs.writeFileSync(report,JSON.stringify({passed:true,version:extension.packageJSON.version,native:!!nativeContext,notebook:true,perCellOutput:true,exactCellDiagnostics:true,recovery:true,comparison:true,plainSelection:true,structuralF5Diagnostics:!!nativeContext,serializeSourceOnly:true,workingOnly:true},null,2));
  if(process.env.JADE_WORKSPACE_UI_HOLD==='1')await new Promise(resolve=>setTimeout(resolve,180000));
  if(nativeContext)await vscode.commands.executeCommand('jadeNative.disconnectTestRunner');
 } catch(error) {fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally {
   if(originalRequest){const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');extension.exports.nativeTests.request=originalRequest;}
   if(nativeContext&&api)await api.nativeTests.request('shutdown').promise.catch(()=>{});
   // Only the notebook created by this fixture is discarded. Leaving its
   // unsaved buffer open can block VS Code's test-host shutdown prompt.
   if(notebook&&!notebook.isClosed){await vscode.window.showNotebookDocument(notebook);await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');}
 }
}
module.exports={run};
