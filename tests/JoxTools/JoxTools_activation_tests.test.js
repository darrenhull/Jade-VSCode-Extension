'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs');
const manifest=require('../../extension/package.json');
const commands=['jadeNative.setupProject','jadeNative.discover','jadeNative.refreshClassView','jadeNative.refreshTests'];
async function activate(empty=false){
 const f=setup({testing:true}),loaded=[],views=new Map();
 if(empty)f.vscode.workspace.workspaceFolders=[];
 f.vscode.workspace.getConfiguration=()=>({get:()=>undefined,inspect:()=>({})});
 f.vscode.ThemeIcon=class{constructor(id){this.id=id;}};
 const create=f.vscode.window.createTreeView;
 f.vscode.window.createTreeView=(id,options)=>{create(id,options);const view={disposed:false,dispose(){this.disposed=true;}};views.set(id,view);return view;};
 f.client.dispose=async()=>{};
 const extension=path.resolve(__dirname,'../../extension/src'),module={exports:{}};
 const load=name=>{
  loaded.push(name);
  if(name==='vscode')return f.vscode;
  if(name==='./cli-client')return{CliWorkingSession:class{constructor(){return f.client;}}};
  if(name==='./cli-gateway')return{configure(){}};
  if(name==='./object-explorer')return{registerObjectExplorer:()=>({releaseForOperation:async()=>{}})};
  assert.ok(!['./sidebar','./language-tools','./workspace-index','./SourceIndexCache','./class-view','./testing','./navigation'].includes(name),'Active JOX activation loaded legacy handlers: '+name);
  return name.startsWith('./')?require(path.join(extension,name.slice(2))):require(name);
 };
 vm.runInNewContext('(function(require,module,__dirname){'+fs.readFileSync(path.join(extension,'extension.js'),'utf8')+'\n})',{process,Buffer,console})(load,module,extension);
 const context={...f.context,extensionPath:path.resolve(extension,'..'),workspaceState:{get:()=> 'initial'}};
 const registered=module.exports.activate(context);await new Promise(resolve=>setImmediate(resolve));
 return{...f,context,registered,loaded,views,dispose(){for(const subscription of [...context.subscriptions].reverse())subscription.dispose?.();}};
}
for(const empty of [true,false])test('active JOX activation fills the existing Tools view without native work: empty='+empty,async()=>{
 const f=await activate(empty);try{
  const provider=f.trees.get('jadeNative.tools');assert.ok(provider,'Active JOX activation never registered the declared Jade Tools view');
  const rows=await provider.getChildren();assert.equal(rows.length,4);assert.deepEqual(rows.map(row=>row.command.command),commands);
  assert.deepEqual(rows.map(row=>row.label),['Set Up Project','Detect Runtime Settings','Refresh Object Explorer','Refresh Tests']);
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
  for(const row of rows){assert.equal(provider.getTreeItem(row),row);assert.equal(row.collapsibleState,f.vscode.TreeItemCollapsibleState.None);assert.ok(row.iconPath?.id);assert.equal(typeof f.commands.get(row.command.command),'function');assert.deepEqual(await provider.getChildren(row),[]);}
  assert.deepEqual((await provider.getChildren()).map(row=>row.id),rows.map(row=>row.id));
  const toolbar=manifest.contributes.menus['view/title'].filter(item=>item.when==='view == jadeNative.tools');
  assert.deepEqual(toolbar.map(item=>item.command),commands.slice(0,2));
  for(const item of toolbar)assert.equal(typeof f.commands.get(item.command),'function');
  assert.equal(f.client.probes,0);assert.deepEqual(f.requests,[]);
 }finally{f.dispose();}
 assert.equal(f.views.get('jadeNative.tools')?.disposed,true,'Tools registration was not owned by extension disposal');
});
test('Tools refresh actions work in an initially empty window and do not start a CLI or database operation',async()=>{
 const f=await activate(true);try{
  const provider=f.trees.get('jadeNative.tools');assert.ok(provider);
  for(const row of (await provider.getChildren()).slice(2))await f.commands.get(row.command.command)();
  assert.deepEqual(f.requests,[]);assert.equal(f.client.probes,0);assert.equal(f.registered.testing.controller.items.size,0);
 }finally{f.dispose();}
});
