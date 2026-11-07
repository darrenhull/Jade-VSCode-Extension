'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceContext}=require('../../extension/src/WorkspaceContext');
const uri=(path,scheme='file')=>({scheme,fsPath:path,toString:()=>scheme+':'+path});
test('a saved Scratch Pad cell resolves to its containing notebook and project rather than the first workspace root',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},cell={uri:uri('C:/B/pad.jadeworkspace#1','vscode-notebook-cell')};
 const notebook={uri:uri('C:/B/pad.jadeworkspace'),getCells:()=>[{document:cell}]};let prompts=0;
 const context=new WorkspaceContext({workspace:{workspaceFolders:[a,b],notebookDocuments:[notebook],getWorkspaceFolder:value=>value.scheme==='file'&&value.fsPath.startsWith('C:/B/')?b:undefined},pickFolder:async()=>{prompts++;return a;}});
 const selected=await context.resolve(cell.uri);assert.equal(selected.folder,b);assert.equal(selected.resource,notebook.uri);assert.equal(selected.configurationResource,notebook.uri);assert.equal(prompts,0);
});
test('ambiguous untitled Scratch Pads ask once for project context and remember the explicit selection',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},pad=uri('Scratch-1','untitled');let prompts=0;
 const context=new WorkspaceContext({workspace:{workspaceFolders:[a,b],notebookDocuments:[],getWorkspaceFolder:()=>undefined},pickFolder:async()=>{prompts++;return b;}});
 const selected=await context.resolve(pad);assert.equal(selected.folder,b);assert.equal(selected.resource,pad);assert.equal(selected.configurationResource,b.uri);assert.equal((await context.resolve(pad)).configurationResource,b.uri);assert.equal(prompts,1);
});

test('an untitled notebook cell retains its source identity but uses its selected project connection',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},pad=uri('Scratch-1','untitled'),cell={uri:uri('Scratch-1#1','vscode-notebook-cell')};
 const notebook={uri:pad,getCells:()=>[{document:cell}]};
 const workspace={workspaceFolders:[a,b],notebookDocuments:[notebook],getWorkspaceFolder:()=>undefined};
 const context=new WorkspaceContext({workspace,pickFolder:async()=>b}),scope=await context.resolve(cell.uri);
 const folderConnections=new Map([[a.uri,'connection A'],[b.uri,'connection B']]);
 assert.equal(scope.resource,pad);assert.equal(scope.folder,b);assert.equal(folderConnections.get(scope.configurationResource),'connection B');
});
test('closed notebook cells and cancelled project selection do not silently execute against another project',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},context=new WorkspaceContext({workspace:{workspaceFolders:[a,b],notebookDocuments:[],getWorkspaceFolder:()=>undefined},pickFolder:async()=>undefined});
 await assert.rejects(()=>context.resolve(uri('orphan','vscode-notebook-cell')),/closed|not found/i);
 await assert.rejects(()=>context.resolve(uri('Untitled','untitled')),/selected|cancel/i);
});
