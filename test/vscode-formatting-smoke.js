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
    fs.writeFileSync(report,JSON.stringify({passed:true,version:extension.packageJSON.version,formatDocument:true,formatSelection:true,undo:true,idempotent:true,noDatabase:true,file},null,2));
    // An explicit visual-verification run can hold the real formatted editor
    // open briefly; normal host/CI runs exit as soon as the checks finish.
    if(process.env.JADE_FORMATTING_UI_HOLD==='1')await new Promise(resolve=>setTimeout(resolve,90000));
  } catch(error) {fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
}
module.exports={run};
