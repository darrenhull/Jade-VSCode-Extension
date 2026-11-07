'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
const {ClassWorkspaceEditorProvider}=require('../src/class-workspace-editor-provider');
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json'),sessions=[],owned=[];
 const nativeSessions=new Map(),servicesFactory=ClassWorkspaceEditorProvider.prototype.services;
 // Observe the real production provider without changing its behavior or
 // exposing test-only editor state through the extension's public API.
 ClassWorkspaceEditorProvider.prototype.services=function(document,binding,panel){const services=servicesFactory.call(this,document,binding,panel);nativeSessions.set(document.uri.toString(),{document,binding,panel,services});return services;};
 async function wait(predicate,label){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out: '+label);}
 async function writeExternal(file,text){for(let attempt=0;;attempt++){try{fs.writeFileSync(file,text);return;}catch(error){if(attempt===20||!['EBUSY','EPERM'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,50));}}}
 const method=name=>[name+' (','jadeMethodSources','name','{','name() : String;','begin',' return "🐟";','end;','}',')'];
 const source=['schemaDefinition','Pets subschemaOf RootSchema partialDefinition;','typeHeaders','Fish subclassOf Object transient;','Bird subclassOf Object transient;','typeDefinitions','Fish completeDefinition','(','jadeMethodDefinitions','name() : String;',')','Bird completeDefinition','(','jadeMethodDefinitions','name() : String;',')','typeSources',...method('Fish'),...method('Bird')].join('\r\n');
 const file=path.join(root,'SharedClasses.cls');fs.writeFileSync(file,source);const uri=vscode.Uri.file(file);let document;
 const secondary=path.join(root,'Fish-extra.cls');fs.writeFileSync(secondary,'schemaDefinition\r\nPets subschemaOf RootSchema partialDefinition;\r\ntypeDefinitions\r\nFish partialDefinition\r\n(\r\njadeMethodDefinitions\r\nextra() : String;\r\n)\r\ntypeSources\r\nFish (\r\njadeMethodSources\r\nextra\r\n{\r\nextra() : String;\r\nbegin\r\n return "extra";\r\nend;\r\n}\r\n)');
 try{
  const provider=new ClassWorkspaceEditorProvider(vscode,session=>{sessions.push(session);session.panel.webview.html='<html><body>Real source custom editor host proof</body></html>';return {dispose(){}};});
  owned.push(provider,vscode.window.registerCustomEditorProvider('jade.testClassWorkspace',provider,{supportsMultipleEditorsPerDocument:true,webviewOptions:{retainContextWhenHidden:true}}));
  await vscode.commands.executeCommand('vscode.openWith',uri,'jade.testClassWorkspace',{viewColumn:vscode.ViewColumn.One,preview:false});await wait(()=>sessions.length===1,'first class editor');
  await vscode.commands.executeCommand('vscode.openWith',uri,'jade.testClassWorkspace',{viewColumn:vscode.ViewColumn.Two,preview:false});await wait(()=>sessions.length===2,'second class editor on same source');
  document=sessions[0].document;assert.strictEqual(sessions[1].document,document);
  const fish=sessions[0].binding.select('Fish','name'),bird=sessions[1].binding.select('Bird','name');assert.notEqual(fish.start,bird.start);
  const at=fish.text.indexOf('🐟');await sessions[0].binding.edit({version:fish.version,start:at,end:at+2,text:'Goldfish'});await wait(()=>document.getText().includes('Goldfish'),'real edit');assert.equal(document.isDirty,true);
  await vscode.commands.executeCommand('undo');await wait(()=>document.getText()===source,'native undo in custom editor');
  await vscode.commands.executeCommand('redo');await wait(()=>document.getText().includes('Goldfish'),'native redo in custom editor');
  const original=await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.Three,preview:false});assert.strictEqual(original.document,document);
  await vscode.commands.executeCommand('undo');await wait(()=>document.getText()===source,'shared original editor undo');
  const prefix='// original editor\r\n',edit=new vscode.WorkspaceEdit();edit.insert(uri,new vscode.Position(0,0),prefix);await vscode.workspace.applyEdit(edit);await wait(()=>sessions[0].binding.snapshot().start===fish.start+prefix.length,'mapping from original edits');
  await sessions[0].services.save();assert.equal(document.isDirty,false);assert.equal(fs.readFileSync(file,'utf8'),document.getText());
  const cleanExternal='// clean external update\r\n'+document.getText();await writeExternal(file,cleanExternal);
  await wait(()=>document.getText()===cleanExternal,'clean external file reload');
  assert.equal(sessions[0].binding.snapshot().start,fish.start+prefix.length+'// clean external update\r\n'.length);
  let state=sessions[0].binding.snapshot();await sessions[0].binding.edit({version:state.version,start:0,end:0,text:'// preserved unsaved method\r\n'});
  const local=document.getText(),remote='// independent disk change\r\n'+cleanExternal;await writeExternal(file,remote);
  await new Promise(resolve=>setTimeout(resolve,250));assert.equal(document.getText(),local);assert.equal(document.isDirty,true);assert.equal(fs.readFileSync(file,'utf8'),remote,'Native dirty-file handling must preserve the separate disk revision');
  // Explicit revert is confined to this private fixture, after proving neither side was discarded.
  await vscode.commands.executeCommand('workbench.action.files.revert');await wait(()=>!document.isDirty,'explicit native conflict resolution');
  const completions=await sessions[0].services.completions(1);assert.ok(Array.isArray(completions.items));
  const collection=vscode.languages.createDiagnosticCollection('workspace-proof');owned.push(collection);const position=document.positionAt(sessions[0].binding.snapshot().start+1);collection.set(uri,[new vscode.Diagnostic(new vscode.Range(position,position.translate(0,4)),'proof diagnostic')]);assert.equal(sessions[0].services.diagnostics()[0].message,'proof diagnostic');
  assert.equal(vscode.window.tabGroups.all.flatMap(group=>group.tabs).filter(tab=>tab.input instanceof vscode.TabInputCustom&&tab.input.viewType==='jade.testClassWorkspace').length,2);
  const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview'),api=await extension.activate();
  await vscode.commands.executeCommand('jadeNative.refreshClassView');
  const schema=(await api.classView.provider.getChildren()).find(row=>row.name==='Pets');assert.ok(schema);
  const classes=await api.classView.provider.getChildren(schema),fishRow=classes.find(row=>row.name==='Fish'),birdRow=classes.find(row=>row.name==='Bird');assert.ok(fishRow);assert.ok(birdRow);
  const productionTabs=()=>vscode.window.tabGroups.all.flatMap(group=>group.tabs).filter(tab=>tab.input instanceof vscode.TabInputCustom&&tab.input.viewType==='jade.classWorkspace');
  await vscode.commands.executeCommand('jadeNative.openClassWorkspace',fishRow);await wait(()=>productionTabs().some(tab=>tab.label==='Pets::Fish'),'production class controller and shell');
  await vscode.commands.executeCommand('jadeNative.openClassWorkspace',fishRow);assert.equal(productionTabs().length,1,'same class must reuse its existing custom editor');
  await vscode.commands.executeCommand('jadeNative.previewClassMember',{...fishRow,owner:'Fish',name:'name',kind:'method',file:uri.toString()});assert.equal(productionTabs().length,1);
  await vscode.commands.executeCommand('jadeNative.openClassWorkspace',birdRow);await wait(()=>productionTabs().some(tab=>tab.label==='Pets::Bird'),'second production class sharing original source');assert.equal(productionTabs().length,2);
  await vscode.commands.executeCommand('jadeNative.openOriginalSource');assert.strictEqual(vscode.window.activeTextEditor.document,document,'Public original-source command resolves the active class without an explicit row');
  await api.classView.previewController.open(fishRow);let moved;
  for(let attempt=0;attempt<100&&!moved;attempt++){try{moved=await api.classView.previewController.openOwningSource(fishRow,JSON.stringify(['Pets','Fish','method','extra']));}catch(error){if(!/not ready to switch/.test(error.message)||attempt===99)throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
  assert.equal(moved.opened,true);await wait(()=>productionTabs().some(tab=>tab.label==='Pets::Fish'&&tab.input.uri.toString()===vscode.Uri.file(secondary).toString()),'native secondary source transition');assert.equal(productionTabs().length,2,'Resource transition replaces the class page instead of creating another logical class');
  await vscode.commands.executeCommand('jadeNative.openOriginalSource');assert.equal(vscode.window.activeTextEditor.document.uri.toString(),vscode.Uri.file(secondary).toString());
  const secondarySession=nativeSessions.get(vscode.Uri.file(secondary).toString());assert.ok(secondarySession,'Observe the actual production secondary-file provider');
  assert.strictEqual(secondarySession.document,vscode.window.activeTextEditor.document);
  await api.classView.previewController.open(fishRow);
  await wait(()=>secondarySession.panel.active&&secondarySession.binding.snapshot()?.member==='extra','secondary production canvas selected and active');
  const secondaryBefore=secondarySession.document.getText(),primaryBefore=document.getText(),partial=secondarySession.binding.snapshot(),replaceAt=partial.text.indexOf('"extra"');assert.ok(replaceAt>=0);
  await secondarySession.binding.edit({version:partial.version,owner:'Fish',member:'extra',start:replaceAt,end:replaceAt+7,text:'"native partial edit"'});
  await wait(()=>secondarySession.document.isDirty&&secondarySession.document.getText().includes('"native partial edit"'),'actual secondary backing document edit');
  assert.equal(document.getText(),primaryBefore,'Editing the partial file must not change the primary class file');
  await secondarySession.services.undo();await wait(()=>secondarySession.document.getText()===secondaryBefore,'native secondary custom-editor undo');
  await secondarySession.services.redo();await wait(()=>secondarySession.document.getText().includes('"native partial edit"'),'native secondary custom-editor redo');
  await secondarySession.services.save();assert.equal(secondarySession.document.isDirty,false);assert.equal(fs.readFileSync(secondary,'utf8'),secondarySession.document.getText());assert.equal(document.getText(),primaryBefore);
  fs.writeFileSync(report,JSON.stringify({passed:true,sameTextDocument:true,twoClassesSameFile:true,separateEditorGroups:true,nativeUndoRedo:true,originalEditorSynchronization:true,save:true,cleanExternalReload:true,dirtyExternalRevisionsPreserved:true,crlfUnicode:true,completionBridge:true,diagnosticBridge:true,productionRegistrationAndController:true,productionClassReuse:true,productionMemberNavigation:true,nativeSecondarySourceTransition:true,nativeSecondaryEditUndoRedoSave:true,primaryUnchangedAfterSecondaryEdit:true,noDatabase:true},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{ClassWorkspaceEditorProvider.prototype.services=servicesFactory;for(const session of nativeSessions.values())if(session.document?.isDirty)await session.document.save();for(const item of owned.reverse())item.dispose();}
}
module.exports={run};
