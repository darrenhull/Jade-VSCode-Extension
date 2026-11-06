'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceContext}=require('../../extension/src/WorkspaceContext');
const uri=(path,scheme='file')=>({scheme,fsPath:path,toString:()=>scheme+':'+path});
test('a saved Scratch Pad cell resolves to its containing notebook and project rather than the first workspace root',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},cell={uri:uri('C:/B/pad.jadeworkspace#1','vscode-notebook-cell')};
 const notebook={uri:uri('C:/B/pad.jadeworkspace'),getCells:()=>[{document:cell}]};let prompts=0;
 const context=new WorkspaceContext({workspace:{workspaceFolders:[a,b],notebookDocuments:[notebook],getWorkspaceFolder:value=>value.scheme==='file'&&value.fsPath.startsWith('C:/B/')?b:undefined},pickFolder:async()=>{prompts++;return a;}});
 const selected=await context.resolve(cell.uri);assert.equal(selected.folder,b);assert.equal(selected.resource,notebook.uri);assert.equal(prompts,0);
});
test('ambiguous untitled Scratch Pads ask once for project context and remember the explicit selection',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},pad=uri('Scratch-1','untitled');let prompts=0;
 const context=new WorkspaceContext({workspace:{workspaceFolders:[a,b],notebookDocuments:[],getWorkspaceFolder:()=>undefined},pickFolder:async()=>{prompts++;return b;}});
 assert.equal((await context.resolve(pad)).folder,b);assert.equal((await context.resolve(pad)).folder,b);assert.equal(prompts,1);
});
test('closed notebook cells and cancelled project selection do not silently execute against another project',async()=>{
 const a={uri:uri('C:/A')},b={uri:uri('C:/B')},context=new WorkspaceContext({workspace:{workspaceFolders:[a,b],notebookDocuments:[],getWorkspaceFolder:()=>undefined},pickFolder:async()=>undefined});
 await assert.rejects(()=>context.resolve(uri('orphan','vscode-notebook-cell')),/closed|not found/i);
 await assert.rejects(()=>context.resolve(uri('Untitled','untitled')),/selected|cancel/i);
});
