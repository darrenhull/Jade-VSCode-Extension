'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
async function run() {
  const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');
  try {
    const source='formattingDemo() : Integer;\nvars\nvalue : Integer;\nbegin\nvalue := 40;\nif value > 0 then\nwhile value < 42 do\nvalue := value + 1;\nendwhile;\nendif;\nreturn value;\nend;\n';
    const file=path.join(root,'FormattingDemo.jade');fs.writeFileSync(file,source);
    const document=await vscode.workspace.openTextDocument(file),editor=await vscode.window.showTextDocument(document);
    const extension=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');await extension.activate();
    const options={tabSize:4,insertSpaces:true},apply=async edits=>{const edit=new vscode.WorkspaceEdit();edit.set(document.uri,edits);assert.equal(await vscode.workspace.applyEdit(edit),true);};
    const selected=source.indexOf('value := value + 1;'),range=new vscode.Range(document.positionAt(selected),document.positionAt(selected+'value := value + 1;'.length));
    const selection=await vscode.commands.executeCommand('vscode.executeFormatRangeProvider',document.uri,range,options);
    assert.equal(selection.length,1);await apply(selection);assert.ok(document.getText().includes('\n            value := value + 1;'));
    await vscode.commands.executeCommand('undo');assert.equal(document.getText(),source);
    const edits=await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',document.uri,options);assert.ok(edits.length>=6);await apply(edits);
    const formatted=document.getText();assert.ok(formatted.includes('\n    value : Integer;'));assert.ok(formatted.includes('\n            value := value + 1;'));
    assert.equal((await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',document.uri,options)||[]).length,0);
    await vscode.commands.executeCommand('undo');assert.equal(document.getText(),source);
    await apply(await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',document.uri,options));
    editor.selection=new vscode.Selection(0,0,0,0);await document.save();
    const clsSource='jadeVersionNumber "25.0.02";\nschemaDefinition\nDemo subschemaOf RootSchema partialDefinition;\ntypeHeaders\nCow subclassOf Object transient;\ntypeDefinitions\nCow completeDefinition\n(\nattributeDefinitions\n        name: String[50] number = 1;\n    dateOfBirth: Date number = 2;\njadeMethodDefinitions\ngetName() : String;\n)\ntypeSources\n    Cow (\n    jadeMethodSources\n    getName\n    {\n    getName() : String;\n    begin\nreturn self.name;\n    end;\n    }\n    )\n';
    const clsFile=path.join(root,'Cow.cls');fs.writeFileSync(clsFile,clsSource);
    const clsDocument=await vscode.workspace.openTextDocument(clsFile),clsEditor=await vscode.window.showTextDocument(clsDocument);
    clsEditor.options={insertSpaces:true,tabSize:4};
    await vscode.workspace.getConfiguration().update('[jade-nz]',{'editor.defaultFormatter':extension.id,'editor.tabSize':4,'editor.insertSpaces':true},vscode.ConfigurationTarget.Workspace);
    const propertyStart=clsSource.indexOf('    dateOfBirth:'),propertyEnd=clsSource.indexOf('\n',propertyStart),propertyRange=new vscode.Range(clsDocument.positionAt(propertyStart),clsDocument.positionAt(propertyEnd));
    const propertyEdits=await vscode.commands.executeCommand('vscode.executeFormatRangeProvider',clsDocument.uri,propertyRange,options);
    assert.equal(propertyEdits.length,1);
    const propertyEdit=new vscode.WorkspaceEdit();propertyEdit.set(clsDocument.uri,propertyEdits);assert.equal(await vscode.workspace.applyEdit(propertyEdit),true);
    assert.equal(clsDocument.getText(),clsSource.replace('\n    dateOfBirth:','\n        dateOfBirth:'));
    await vscode.commands.executeCommand('undo');assert.equal(clsDocument.getText(),clsSource);
    clsEditor.selection=new vscode.Selection(10,4,10,4);clsEditor.revealRange(new vscode.Range(0,0,24,0));
    if(process.env.JADE_FORMATTING_UI_HOLD==='1'){
      fs.writeFileSync(path.resolve(root,'../formatting-before-ready.json'),JSON.stringify({file:clsFile}));
      await new Promise(resolve=>setTimeout(resolve,45000));
    }
    await vscode.commands.executeCommand('editor.action.formatDocument');
    const clsFormatted=clsDocument.getText();
    assert.ok(clsFormatted.includes('\n        dateOfBirth: Date number = 2;'));
    assert.ok(clsFormatted.includes('\n    Cow completeDefinition\n    (\n    attributeDefinitions'));
    assert.ok(clsFormatted.includes('\nCow (\njadeMethodSources\ngetName\n{\ngetName() : String;\nbegin\n    return self.name;\nend;\n}\n)'));
    assert.equal(clsFormatted.replace(/\s/g,''),clsSource.replace(/\s/g,''));
    assert.equal((await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',clsDocument.uri,options)||[]).length,0);
    await vscode.commands.executeCommand('undo');assert.equal(clsDocument.getText(),clsSource);
    await vscode.commands.executeCommand('editor.action.formatDocument');assert.equal(clsDocument.getText(),clsFormatted);
    await clsDocument.save();
    const identifiers=clsSource.replace('dateOfBirth: Date','jadeVersionNumber: Integer').replace('    getName() : String;\n    begin','    getName() : String;\n    vars\n jadePatchRelease: Integer;\n    begin\n jadePatchRelease := 1;\n  consume(\n      typeSources\n  );\n  consume(\n      jadeMethodSources\n  );');
    const identifierFile=path.join(root,'HeaderIdentifiers.cls');fs.writeFileSync(identifierFile,identifiers);
    const identifierDocument=await vscode.workspace.openTextDocument(identifierFile);await vscode.window.showTextDocument(identifierDocument);
    const identifierEdits=await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',identifierDocument.uri,options);
    const identifierEdit=new vscode.WorkspaceEdit();identifierEdit.set(identifierDocument.uri,identifierEdits);assert.equal(await vscode.workspace.applyEdit(identifierEdit),true);
    const identifierFormatted=identifierDocument.getText();assert.ok(identifierFormatted.includes('\n        jadeVersionNumber: Integer'));assert.ok(identifierFormatted.includes('\n    jadePatchRelease: Integer;'));assert.ok(identifierFormatted.includes('\n    jadePatchRelease := 1;'));assert.ok(identifierFormatted.includes('\n        typeSources\n'));assert.ok(identifierFormatted.includes('\n        jadeMethodSources\n'));
    assert.equal((await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider',identifierDocument.uri,options)||[]).length,0);
    await vscode.commands.executeCommand('undo');assert.equal(identifierDocument.getText(),identifiers);await identifierDocument.save();
    const rangeSource='    run(\n        first: Integer) updating;\nbegin\nreturn;\nend;',rangeFile=path.join(root,'ContinuationRange.jade');fs.writeFileSync(rangeFile,rangeSource);
    const rangeDocument=await vscode.workspace.openTextDocument(rangeFile),rangeStart=rangeSource.indexOf('        first:'),continuationRange=new vscode.Range(rangeDocument.positionAt(rangeStart),rangeDocument.positionAt(rangeSource.indexOf('\n',rangeStart)));
    for(let repeat=0;repeat<2;repeat++)assert.equal((await vscode.commands.executeCommand('vscode.executeFormatRangeProvider',rangeDocument.uri,continuationRange,options)||[]).length,0,'An unchanged out-of-range anchor cannot progressively shift a selected continuation.');
    fs.writeFileSync(report,JSON.stringify({passed:true,version:extension.packageJSON.version,formatDocument:true,formatSelection:true,undo:true,idempotent:true,wholeCls:true,propertySelection:true,headerIdentifiers:true,noDatabase:true,file:clsFile},null,2));
    // An explicit visual-verification run can hold the real formatted editor
    // open briefly; normal host/CI runs exit as soon as the checks finish.
    if(process.env.JADE_FORMATTING_UI_HOLD==='1')await new Promise(resolve=>setTimeout(resolve,90000));
  } catch(error) {fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
}
module.exports={run};
