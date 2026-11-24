'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
test('adoption replaces temporary source watchers with accepting workspace ownership',()=>{
 const uri=file=>({scheme:'file',fsPath:file,toString:()=>pathToFileURL(file).href}),folder={uri:uri(path.resolve('watcher-fixture'))},watchers=[];
 const vscode={Uri:{file:uri},EventEmitter:class{constructor(){this.event=()=>({dispose(){}});}fire(){}dispose(){}},RelativePattern:class{},workspace:{workspaceFolders:[folder],textDocuments:[],createFileSystemWatcher(){const watcher={disposed:false,onDidChange(fn){this.change=fn;},onDidCreate(){},onDidDelete(){},dispose(){this.disposed=true;}};watchers.push(watcher);return watcher;}}};
 const configFor=()=>({sourceFormat:'jox'}),client={},owner=new NativeSourceWorkspace({vscode,client,configFor}),accepting=new NativeSourceWorkspace({vscode,client,configFor});
 const project=owner.project(folder);project.provider.sourceRoots=[path.join(folder.uri.fsPath,'sources')];let ownerChanges=0,acceptedChanges=0;owner.scheduleRefresh=()=>ownerChanges++;accepting.scheduleRefresh=()=>acceptedChanges++;
 owner.observeSources(project);const original=watchers[0];accepting.adoptProject(folder,owner,undefined);owner.dispose();accepting.observeSources(project);
 assert.equal(original.disposed,true);const active=watchers.find(value=>!value.disposed);assert.ok(active);active.change(uri(path.join(project.provider.sourceRoots[0],'Saved.jox')));assert.equal(acceptedChanges,1);assert.equal(ownerChanges,0);accepting.dispose();
});
