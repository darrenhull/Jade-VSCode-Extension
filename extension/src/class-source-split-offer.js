'use strict';
const {parseSource}=require('./source_symbols');
const digest=text=>require('node:crypto').createHash('sha256').update(text).digest('hex');
const {splitClassSource}=require('./class-source-splitter');

/** A reviewed local refactoring; VS Code owns file creation and source Undo. */
class ClassSourceSplitOffer {
 constructor(vscode){this.vscode=vscode;this.kept=new Map();}
 async consider(uri,selectedClass){
  const v=this.vscode,document=await v.workspace.openTextDocument(uri),text=document.getText();
  if(parseSource(text,uri.toString()).classes.length<2)return false;
  if(this.kept.get(uri.toString())===digest(text))return false;
  const choice=await v.window.showInformationMessage('This file contains multiple classes. Split it into one file per class?',{modal:true,detail:'Review the destination files before changing anything. You can keep this combined file.'},'Review split','Keep combined');
  if(choice!=='Review split'){if(choice==='Keep combined'){this.kept.delete(uri.toString());this.kept.set(uri.toString(),digest(text));if(this.kept.size>50)this.kept.delete(this.kept.keys().next().value);}return false;}
  if(document.isClosed||document.isDirty)throw Error('Save this combined source file before splitting it.');
  if(v.workspace.isTrusted===false||v.workspace.fs.isWritableFileSystem(uri.scheme)===false)throw Error('Splitting requires a trusted, writable workspace.');
  const version=document.version,parts=splitClassSource(text),retained=parts.find(part=>part.name===selectedClass);
  if(!retained)throw Error('The selected class is no longer declared in this source.');
  const originalBytes=Buffer.from(await v.workspace.fs.readFile(uri));
  const bom=originalBytes.subarray(0,3).equals(Buffer.from([239,187,191]));
  if(!originalBytes.equals(Buffer.from((bom?'\uFEFF':'')+text,'utf8')))throw Error('Only saved UTF-8 class sources can be split. The original encoding is unchanged.');
  const folder=uri.with({path:uri.path.slice(0,uri.path.lastIndexOf('/')+1)});
  const creations=parts.filter(part=>part!==retained).map(part=>({...part,uri:v.Uri.joinPath(folder,part.name+'.cls')}));
  const check=async()=>{
   if(document.isClosed||document.isDirty||document.version!==version||document.getText()!==text)throw Error('The source changed. Review the split again.');
   if(!Buffer.from(await v.workspace.fs.readFile(uri)).equals(originalBytes))throw Error('The source changed on disk. Review the split again.');
   for(const part of creations){
    if(part.uri.toString().toLowerCase()===uri.toString().toLowerCase()||v.workspace.textDocuments.some(doc=>doc.uri.toString().toLowerCase()===part.uri.toString().toLowerCase()))throw Error('A destination is already open or exists: '+part.uri.path);
    try{await v.workspace.fs.stat(part.uri);}catch(error){if(error.code==='FileNotFound'||error.code==='ENOENT')continue;throw error;}
    throw Error('A destination already exists: '+part.uri.path);
   }
  };
  await check();
  const detail=['Keep '+retained.name+' in '+uri.path,...creations.map(part=>'Create '+part.uri.path),'','All declarations, method bodies and supported class maps are retained. No files are deleted or overwritten.','Create complete sibling files on disk; the original file has unsaved changes. Save the original file or use Save All before compiling. VS Code Undo can undo this refactoring.'].join('\n');
  if(await v.window.showInformationMessage('Split '+parts.length+' classes into separate source files?',{modal:true,detail},'Split files')!=='Split files')return false;
  await check();
  // No await may intervene between this final buffer guard and native apply.
  if(document.isClosed||document.isDirty||document.version!==version||document.getText()!==text)throw Error('The source changed. Review the split again.');
  const edit=new v.WorkspaceEdit();
  for(const part of creations)edit.createFile(part.uri,{overwrite:false,ignoreIfExists:false,contents:Buffer.from((bom?'\uFEFF':'')+part.text,'utf8')});
  edit.replace(uri,new v.Range(document.positionAt(0),document.positionAt(text.length)),retained.text);
  if(!await v.workspace.applyEdit(edit))throw Error('The split could not finish. Inspect the source files and use VS Code Undo to undo any split changes; no existing files were overwritten.');
  return true;
 }
}
module.exports={ClassSourceSplitOffer};
