'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerNativeSourceExplorer}=require('../../extension/src/native-source-explorer');
const {setup}=require('./fixtures/vscode.cjs');
function explorer(){
 const f=setup(),queries=[],opened=[];
 const projects=['First','Second'].map(name=>{
  const project={folder:{name,uri:f.vscode.Uri.file('C:/'+name)},generation:'generation-1'};
  project.provider={snapshot:{},binding:()=>({projectId:name,generation:project.generation}),async query(request){
   queries.push({project:name,...request});assert.equal(request.limit,100);assert.ok([0,100].includes(request.offset));
   const {kind,parentId,offset}=request;
   let items;
   if(kind==='schema')items=['schema-a','schema-b'].map(id=>({id,name:id,kind:'schema'}));
   else {
    assert.ok(parentId,'Branch query must retain its native parent');
    const count=offset===0?100:1;
    items=Array.from({length:count},(_,index)=>({id:parentId+'-'+kind+'-'+(offset+index),name:kind+(offset+index),kind:kind==='type'?'class':'method'}));
   }
   return {generation:project.generation,items,nextOffset:kind!=='schema'&&offset===0?100:null};
  }};
  return project;
 });
 const workspace={folders:()=>projects.map(project=>project.folder),project:folder=>projects.find(project=>project.folder===folder),
  prepare:()=>assert.fail('Already prepared branch unexpectedly prepared again'),ensurePrepared:async folder=>projects.find(project=>project.folder===folder),open:(project,id)=>opened.push({project,id})};
 const {provider}=registerNativeSourceExplorer(f.vscode,f.context,workspace,{open:()=>assert.fail('Pagination opened a class editor')});
 return {provider,projects,queries,opened,workspace};
}
async function schemas(f,projectIndex=0){const roots=await f.provider.getChildren();return f.provider.getChildren(roots[projectIndex]);}
const page=rows=>{const row=rows.find(value=>value.kind==='page');assert.ok(row);assert.equal(row.offset,100);return row;};
test('two expanded schemas have distinct stable type-page IDs and bounded next-page navigation',async()=>{
 const f=explorer(),branches=await schemas(f);
 const first=await f.provider.getChildren(branches[0]),second=await f.provider.getChildren(branches[1]);
 assert.equal(first.length,101);assert.equal(second.length,101);
 assert.deepEqual(JSON.parse(f.provider.getTreeItem(first[0]).id),['file:///C:/First',first[0].entity.id,'entity',0]);
 const a=page(first),b=page(second),id=f.provider.getTreeItem(a).id;
 assert.notEqual(id,f.provider.getTreeItem(b).id,'Different schema pages at offset100 must not share a VS Code tree ID');
 assert.equal(id,f.provider.getTreeItem(page(await f.provider.getChildren(branches[0]))).id);
 const next=await f.provider.getChildren(a);assert.equal(next.length,1);assert.equal(next[0].entity.id,'schema-a-type-100');
 assert.deepEqual(f.queries.map(({kind,parentId,offset,limit})=>({kind,parentId,offset,limit})),[
  {kind:'schema',parentId:undefined,offset:0,limit:100},{kind:'type',parentId:'schema-a',offset:0,limit:100},
  {kind:'type',parentId:'schema-b',offset:0,limit:100},{kind:'type',parentId:'schema-a',offset:0,limit:100},
  {kind:'type',parentId:'schema-a',offset:100,limit:100}]);
});
test('two expanded classes have distinct member-page IDs and retain member navigation',async()=>{
 const f=explorer(),branches=await schemas(f),types=await f.provider.getChildren(branches[0]);
 const a=page(await f.provider.getChildren(types[0])),b=page(await f.provider.getChildren(types[1]));
 assert.notEqual(f.provider.getTreeItem(a).id,f.provider.getTreeItem(b).id,'Different class member pages must not share a VS Code tree ID');
 assert.equal(a.queryKind,'member');assert.equal(a.parentId,types[0].entity.id);
 const next=await f.provider.getChildren(a);assert.equal(next.length,1);assert.equal(next[0].typeEntity,types[0].entity);
 const item=f.provider.getTreeItem(next[0]);assert.equal(item.command.command,'jadeNative.showClassMember');assert.deepEqual(item.command.arguments,[next[0]]);
 assert.deepEqual(f.queries.at(-1),{project:'First',kind:'member',parentId:types[0].entity.id,offset:100,limit:100});
});
test('page identity includes project and query kind while unchanged branch renders remain stable',async()=>{
 const f=explorer(),first=await schemas(f),second=await schemas(f,1);
 const a=page(await f.provider.getChildren(first[0])),b=page(await f.provider.getChildren(second[0]));
 const id=f.provider.getTreeItem(a).id;assert.equal(id,f.provider.getTreeItem(a).id);
 assert.notEqual(id,f.provider.getTreeItem(b).id);
 assert.notEqual(id,f.provider.getTreeItem({...a,queryKind:'member'}).id);
});
test('stale pagination still refuses before querying another source generation',async()=>{
 const f=explorer(),branches=await schemas(f),a=page(await f.provider.getChildren(branches[0]));
 const before=f.queries.length;f.projects[0].generation='generation-2';
 await assert.rejects(f.provider.getChildren(a),/source catalogue changed/);
 assert.equal(f.queries.length,before);assert.deepEqual(f.opened,[]);
});

test('deferred setup invalidation replaces the expanded root identity without querying until next expansion',async()=>{
 const f=setup(),workspace=new (require('../../extension/src/NativeSourceWorkspace').NativeSourceWorkspace)({vscode:f.vscode,client:f.client,configFor:()=>f.config});
 const view=registerNativeSourceExplorer(f.vscode,f.context,workspace,{open(){},refresh(){}}),root=(await view.provider.getChildren())[0];
 const original=view.provider.getTreeItem(root).id;let changed=0;view.provider.onDidChangeTreeData(()=>changed++);
 workspace.invalidateSources(root.project);
 const next=(await view.provider.getChildren())[0],item=view.provider.getTreeItem(next);
 assert.notEqual(item.id,original);assert.equal(item.collapsibleState,f.vscode.TreeItemCollapsibleState.Collapsed);assert.equal(changed,1);assert.equal(f.requests.length,0);
 await view.provider.getChildren(next);assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,1);
});

test('Explorer always awaits readiness and queries the returned active project despite a warm old row',async()=>{
 const f=explorer(),root=(await f.provider.getChildren())[0];let prepared=0,queried=0;
 const active={...root.project,provider:{...root.project.provider,query:async()=>{queried++;return{generation:'generation-2',items:[],nextOffset:null};}}};
 f.workspace.ensurePrepared=async()=>{prepared++;return active;};root.project.provider.query=async()=>assert.fail('Queried the stale row project');
 await f.provider.getChildren(root);assert.equal(prepared,1);assert.equal(queried,1);
});

test('class search rechecks readiness and queries the active returned project instead of a warm prior binding',async()=>{
 const f=setup();let ready=0,oldQueries=0,newQueries=0;
 const page={provider:'jox',projectId:'active',generation:'fresh',items:[],total:0,offset:0,limit:100,nextOffset:null};
 const prior={folder:f.folder,provider:{snapshot:{},query:async()=>{oldQueries++;return page;}}};
 const active={folder:f.folder,provider:{snapshot:{},query:async()=>{newQueries++;return page;}}};
 const workspace={folders:()=>[f.folder],project:()=>active,ensurePrepared:async()=>++ready===1?prior:active};
 const view=require('../../extension/src/native-source-catalogue').registerNativeSourceCatalogue(f.vscode,f.context,workspace,{open(){}});
 await view.show();await f.panels.at(-1).receive({command:'ready'});
 assert.equal(oldQueries,0);assert.ok(newQueries>0);assert.ok(ready>=2);
});

test('class search keeps one local project through a pending schema query when the selected folder changes',async()=>{
 const f=setup(),calls=[];let release;
 const make=(name,folder)=>({folder,provider:{snapshot:{},query:async request=>{calls.push({name,...request});
  if(name==='A'&&request.kind==='schema')await new Promise(resolve=>release=resolve);
  return{provider:'jox',projectId:name,generation:name,items:request.kind==='schema'?[{id:name+'-schema',name}]:[],total:0,offset:0,limit:100,nextOffset:null};}}});
 const a=make('A',f.folder),b=make('B',{name:'B',uri:f.vscode.Uri.file('C:/other')});
 const workspace={folders:()=>[a.folder,b.folder],project:folder=>folder===a.folder?a:b,ensurePrepared:async folder=>folder===a.folder?a:b};
 const view=require('../../extension/src/native-source-catalogue').registerNativeSourceCatalogue(f.vscode,f.context,workspace,{open(){}});
 const first=view.show({project:a,entity:{kind:'schema',name:'A'}});await new Promise(resolve=>setImmediate(resolve));
 await view.show({project:b,entity:{kind:'schema',name:'B'}});release();await first;
 assert.ok(calls.some(row=>row.name==='A'&&row.kind==='type'&&row.parentId==='A-schema'));
 assert.equal(calls.some(row=>row.name==='B'&&row.parentId==='A-schema'),false);
});
