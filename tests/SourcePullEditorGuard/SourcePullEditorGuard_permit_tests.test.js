"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os"),{EventEmitter}=require("node:events");
const {SourcePullEditorGuard}=require("../../extension/src/SourcePullEditorGuard");
function fixture(documents=[]){
 const events=new EventEmitter(),root=path.join(os.tmpdir(),"jade-editor-guard"),cancels=[];let disposed=0;
 const workspace={textDocuments:documents};for(const [method,event]of [["onDidOpenTextDocument","open"],["onDidChangeTextDocument","change"],["onDidCloseTextDocument","close"]])workspace[method]=handler=>{events.on(event,handler);return{dispose(){events.off(event,handler);disposed++;}};};
 const guard=new SourcePullEditorGuard({workspace,destination:root,onInvalidated:reason=>cancels.push(reason)});
 const document=(relative,dirty)=>({uri:{scheme:"file",fsPath:path.join(root,relative)},isDirty:dirty});
 return{guard,events,root,cancels,document,disposed:()=>disposed};
}
test("immediate current dirty state vetoes only that file without reading source text",t=>{
 const f=fixture();t.after(()=>f.guard.dispose());const doc=f.document("Fish.cls",false);f.events.emit("open",doc);doc.isDirty=true;
 assert.equal(f.guard.approve("Fish.cls"),false);assert.equal(f.guard.approve("Cow.cls"),true);f.guard.complete("Cow.cls");assert.deepEqual(f.cancels,[]);
});
test("an edit after approval invalidates the operation and prevents later permits",t=>{
 const f=fixture();t.after(()=>f.guard.dispose());const doc=f.document("Fish.cls",false);f.events.emit("open",doc);
 assert.equal(f.guard.approve("Fish.cls"),true);doc.isDirty=true;f.events.emit("change",{document:doc});f.events.emit("change",{document:doc});
 assert.equal(f.cancels.length,1);assert.equal(f.guard.approve("Cow.cls"),false);
});
test("native disk refresh of a clean document does not cancel, completed files release their guard",t=>{
 const f=fixture();t.after(()=>f.guard.dispose());const doc=f.document("Fish.cls",false);f.events.emit("open",doc);
 assert.equal(f.guard.approve("Fish.cls"),true);f.events.emit("change",{document:doc});assert.deepEqual(f.cancels,[]);f.guard.complete("Fish.cls");
 doc.isDirty=true;f.events.emit("change",{document:doc});assert.deepEqual(f.cancels,[]);assert.equal(f.guard.approve("Cow.cls"),true);f.guard.complete("Cow.cls");
});
test("overlapping permits and escaping paths fail closed",t=>{
 const f=fixture();t.after(()=>f.guard.dispose());for(const relative of ["../Fish.cls","/Fish.cls","C:/Fish.cls","Fish.cls:stream","a/../Fish.cls","a\\..\\Fish.cls"])assert.throws(()=>f.guard.approve(relative),/relative|source path/i);
 assert.equal(f.guard.approve("Fish.cls"),true);assert.equal(f.guard.approve("Cow.cls"),false);assert.equal(f.cancels.length,1);
});
test("30k sequential permits do not re-enumerate editor documents or retain completed target leases",()=>{
 const f=fixture();Object.defineProperty(f.guard.workspace,"textDocuments",{get(){throw Error("Do not rescan all editor documents per source file");}});
 for(let i=0;i<30000;i++){const relative="types/Class"+i+".cls";assert.equal(f.guard.approve(relative),true);f.guard.complete(relative);}
 f.guard.dispose();assert.equal(f.disposed(),3);assert.deepEqual(f.cancels,[]);
});

test("unsubmitted class-view drafts veto permission and invalidate an active target before isDirty changes",()=>{
 const events=new EventEmitter(),pending=new Set(),root=path.join(os.tmpdir(),"jade-draft-guard"),cancels=[];const noop=()=>({dispose(){}});
 const guard=new SourcePullEditorGuard({workspace:{textDocuments:[],onDidOpenTextDocument:noop,onDidChangeTextDocument:noop,onDidCloseTextDocument:noop},destination:root,onInvalidated:reason=>cancels.push(reason),pendingSources:{hasPending:file=>pending.has(file.toLowerCase()),onDidChange:listener=>{events.on("pending",listener);return{dispose:()=>events.off("pending",listener)};}}});
 const file=path.join(root,"Fish.cls");pending.add(file.toLowerCase());assert.equal(guard.approve("Fish.cls"),false);pending.clear();assert.equal(guard.approve("Fish.cls"),true);pending.add(file.toLowerCase());events.emit("pending",{path:file,pending:true});assert.equal(cancels.length,1);guard.dispose();
});
