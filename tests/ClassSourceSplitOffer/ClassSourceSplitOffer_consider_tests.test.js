'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ClassSourceSplitOffer}=require('../../extension/src/class-source-split-offer');
const {source}=require('../fixtures/class-source-split.cjs');
function fixture(){const prompts=[],edits=[],files=new Map();const uri=value=>({scheme:'file',path:value,toString:()=>value,with:({path})=>uri(path)});const doc={uri:uri('/project/Combined.cls'),version:1,isDirty:false,isClosed:false,getText:()=>source,positionAt:offset=>offset};const choices=['Review split','Split files'];
 class Edit{constructor(){this.operations=[];}replace(...args){this.operations.push(['replace',...args]);}createFile(...args){this.operations.push(['create',...args]);}}
 const vscode={Uri:{joinPath:(u,name)=>uri(u.path.replace(/[^/]+$/,'')+name)},Range:class{constructor(a,b){this.start=a;this.end=b;}},WorkspaceEdit:Edit,window:{showInformationMessage:async(...args)=>{prompts.push(args);return choices.shift();}},workspace:{isTrusted:true,textDocuments:[doc],openTextDocument:async()=>doc,fs:{readFile:async()=>Buffer.from(source),isWritableFileSystem:()=>true,stat:async u=>{if(files.has(u.toString()))return {};const e=Error('missing');e.code='FileNotFound';throw e;}},applyEdit:async e=>{edits.push(e);return true;}}};return {vscode,doc,prompts,edits,files,choices};}
test('reviewed split is one native Undoable edit, retains selected class and does not auto-save original',async()=>{const f=fixture();await new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish');assert.equal(f.edits.length,1);const ops=f.edits[0].operations;assert.equal(ops.filter(x=>x[0]==='create').length,1);assert.match(ops.find(x=>x[0]==='create')[1].toString(),/Bird.cls$/);assert.match(ops.find(x=>x[0]==='replace')[3],/Fish subclassOf/);assert.doesNotMatch(ops.find(x=>x[0]==='replace')[3],/Bird subclassOf/);assert.match(f.prompts[1][1].detail,/Save All|save all/);assert.match(f.prompts[1][1].detail,/complete sibling files on disk/);assert.match(f.prompts[1][1].detail,/original file has unsaved changes/);});
test('Keep combined and confirmation cancellation cause no edits',async()=>{for(const choices of [['Keep combined'],['Review split',undefined]]){const f=fixture();f.choices.splice(0,2,...choices);await new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish');assert.equal(f.edits.length,0);}});
test('refuses existing destination and never overwrites',async()=>{const f=fixture();f.files.set('/project/Bird.cls',true);await assert.rejects(new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish'),/exists/);assert.equal(f.edits.length,0);});
test('refuses dirty and changed source after confirmation',async()=>{const f=fixture();f.doc.isDirty=true;await assert.rejects(new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish'),/Save/);const g=fixture(),show=g.vscode.window.showInformationMessage;g.vscode.window.showInformationMessage=async(...args)=>{const result=await show(...args);if(result==='Split files')g.doc.version++;return result;};await assert.rejects(new ClassSourceSplitOffer(g.vscode).consider(g.doc.uri,'Fish'),/changed/);assert.equal(g.edits.length,0);});

test('detects changed disk bytes and late destination conflicts after review',async()=>{
 const f=fixture();let reads=0;f.vscode.workspace.fs.readFile=async()=>Buffer.from(++reads>2?source+'//external writer':source);
 await assert.rejects(new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish'),/changed on disk/);assert.equal(f.edits.length,0);
 const g=fixture(),show=g.vscode.window.showInformationMessage;g.vscode.window.showInformationMessage=async(...args)=>{const r=await show(...args);if(r==='Split files')g.files.set('/project/Bird.cls',true);return r;};
 await assert.rejects(new ClassSourceSplitOffer(g.vscode).consider(g.doc.uri,'Fish'),/exists/);assert.equal(g.edits.length,0);
});
test('keeps exactly the selected class, catches source basename collision, and preserves BOM',async()=>{
 const f=fixture();f.vscode.workspace.fs.readFile=async()=>Buffer.from('\uFEFF'+source);await new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Bird');
 const operations=f.edits[0].operations;assert.match(operations.find(x=>x[0]==='replace')[3],/Bird subclassOf/);assert.doesNotMatch(operations.find(x=>x[0]==='replace')[3],/Fish subclassOf/);assert.deepEqual(operations.find(x=>x[0]==='create')[2].contents.subarray(0,3),Buffer.from([239,187,191]));
 const g=fixture();g.doc.uri=g.doc.uri.with({path:'/project/Bird.cls'});await assert.rejects(new ClassSourceSplitOffer(g.vscode).consider(g.doc.uri,'Fish'),/already open or exists/);assert.equal(g.edits.length,0);
});
test('refuses unsupported encoding and reports failed WorkspaceEdit without saving',async()=>{
 const f=fixture();f.vscode.workspace.fs.readFile=async()=>Buffer.concat([Buffer.from([255,254]),Buffer.from(source,'utf16le')]);await assert.rejects(new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish'),/UTF-8/);
 const g=fixture();g.vscode.workspace.applyEdit=async()=>false;await assert.rejects(new ClassSourceSplitOffer(g.vscode).consider(g.doc.uri,'Fish'),/could not finish/);
});



test('creates destinations before replacing original to protect against resource-edit races',async()=>{const f=fixture();await new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish');assert.deepEqual(f.edits[0].operations.map(operation=>operation[0]),['create','replace']);});


test('creates complete native sibling bytes preserving LF independently of new-editor defaults',async()=>{const f=fixture(),lf=source.replaceAll('\r\n','\n');f.doc.getText=()=>lf;f.vscode.workspace.fs.readFile=async()=>Buffer.from(lf);await new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish');const contents=f.edits[0].operations.find(op=>op[0]==='create')[2].contents;assert.ok(contents instanceof Uint8Array);assert.match(Buffer.from(contents).toString('utf8'),/Bird subclassOf/);assert.equal(Buffer.from(contents).includes(13),false);});



test('rejects a source edit occurring during the final asynchronous destination stat',async()=>{
 const f=fixture(),stat=f.vscode.workspace.fs.stat;let stats=0;
 f.vscode.workspace.fs.stat=async uri=>{stats++;if(stats===2){f.doc.version=2;f.doc.isDirty=true;f.doc.getText=()=>source+'// newly typed user source';}return stat(uri);};
 await assert.rejects(new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish'),/source changed/i);assert.equal(f.edits.length,0);
});

test('refuses unsafe multiline comment partitions before any native resource edit',async()=>{
 const f=fixture(),input=source.replace(' Fish subclassOf Object;','/* header comment\r\n*/ Fish subclassOf Object;');f.doc.getText=()=>input;f.vscode.workspace.fs.readFile=async()=>Buffer.from(input);
 await assert.rejects(new ClassSourceSplitOffer(f.vscode).consider(f.doc.uri,'Fish'),/comment or literal at a class boundary/);assert.equal(f.edits.length,0);
});
