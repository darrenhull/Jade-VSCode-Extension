'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { createNativeClassWorkspaceModel } = require('../../extension/src/native-class-workspaces');
test('Class Workspace renders the bounded native member page and keeps opaque identities', async () => {
  const calls = [], row = { project: { folder: { name: 'Generic', uri: { fsPath: 'C:/project', toString: () => 'file:///C:/project' } },
    provider: { binding: () => ({ provider: 'jox', projectId: 'opaque-project', generation: 'g1' }), query: async request => {
      calls.push(request); return { items: [{ id: 'opaque-method', kind: 'method', name: 'value', parentId: 'opaque-type', qualifiedName: { schema: 'Example', type: 'Generic', member: 'value' }, signature: 'value(): Integer;' }], total: 250, offset: 100, nextOffset: 200 };
    } } }, entity: { id: 'opaque-type', name: 'Generic', kind: 'class', qualifiedName: { schema: 'Example', type: 'Generic' } }, file: 'jade-source:/owned/class.jade' };
  const model = createNativeClassWorkspaceModel();
  const result = await model.load(row, { kind: 'method', query: 'value', offset: 100 });
  assert.deepEqual(calls, [{ kind: 'member', parentId: 'opaque-type', memberKind: 'method', search: 'value', includeInherited: false, offset: 100, limit: 100 }]);
  assert.equal(result.groups[0].items[0].id, 'opaque-method'); assert.equal(result.total, 250); assert.equal(result.hasMore, true);
  assert.equal(result.identity.entityId, 'opaque-type'); assert.equal(result.identity.projectId, 'opaque-project');
});
test('existing Class Workspace shell opens native projected members without a CLS document binding', async () => {
  const { createClassWorkspaces } = require('../../extension/src/class-workspace');
  let receive; const messages = [], opened = [];
  const member = { id: 'opaque-method', name: 'value', kind: 'method', owner: 'Generic' };
  const panel = { active: true, webview: { cspSource: 'vscode:', asWebviewUri: value => value, postMessage: async message => messages.push(message), onDidReceiveMessage: fn => { receive = fn; return { dispose() {} }; } }, onDidDispose: () => ({ dispose() {} }) };
  const shell = createClassWorkspaces({ Uri: { joinPath: () => 'vscode:asset' } }, { workspaceState: { get() {}, update: async () => {} } }, {
    load: async () => ({ identity: { qualifiedName: 'Example::Generic' }, groups: [{ label: 'Methods', items: [member] }], total: 1 })
  });
  shell.attach({ panel, row: { provider: 'jox', projectId: 'opaque-project', entityId: 'opaque-type' }, services: {
    openMember: async selected => { opened.push(selected.id); return { available: true, editorMode: 'native', readOnly: true, text: 'value(): Integer;', member: selected.name, owner: 'Generic' }; }
  } });
  await receive({ command: 'ready' }); await receive({ command: 'select', id: member.id });
  assert.deepEqual(opened, ['opaque-method']);
  assert.equal(messages.filter(message => message.command === 'editorSnapshot').at(-1).snapshot.editorMode, 'native');
  shell.dispose();
});
test('shared class catalogue keeps two native entities with identical display names distinct', () => {
  const { ClassBrowserModel } = require('../../extension/src/class-browser-model');
  const browser = new ClassBrowserModel({ scope: 'workspace' });
  browser.setClasses(['original', 'copy'].map(entityId => ({ provider: 'jox', projectId: 'opaque-project', entityId, schema: 'Example', name: 'Generic' })));
  assert.equal(browser.rows.length, 2);
  assert.notEqual(browser.rows[0].browserId, browser.rows[1].browserId);
  for (const row of browser.rows) assert.equal(browser.findBrowserId(row.browserId).entityId, row.entityId);
});

test('Class Workspace shows native base and property metadata while unsupported editing stays native-owned', async () => {
  const property = { id: 'property-id', kind: 'property', name: 'title', qualifiedName: { schema: 'Example', type: 'Generic' },
    metadata: { type: { name: 'String' }, length: 80, access: 'readonly' }, flags: { readOnly: true } };
  const row = { project: { folder: { name: 'Generic', uri: { fsPath: 'C:/project' } }, provider: {
    binding: () => ({ provider: 'jox', projectId: 'project', generation: 'g' }),
    query: async () => ({ items: [property], total: 1, offset: 0, nextOffset: null }) } },
    entity: { id: 'type-id', name: 'Generic', qualifiedName: { schema: 'Example', type: 'Generic' },
      metadata: { baseClass: { id: 'base-id', name: 'NativeBase', qualifiedName: { schema: 'Example', type: 'NativeBase' } } } }, file: 'jade-source:/class.jade' };
  const result = await createNativeClassWorkspaceModel().load(row);
  assert.equal(result.identity.superclass, 'NativeBase');
  assert.equal(result.overview.superclass, 'NativeBase');
  assert.match(result.groups[0].items[0].detail, /String/);
  assert.match(result.groups[0].items[0].detail, /readonly/);
  assert.equal(result.groups[0].items[0].nativeEntity.flags.readOnly, true);
  assert.equal(result.overview.superclassIdentity, undefined);
});


test('restored Class Workspace reconstructs exact native class context without open or pending state and preserves dirty text', async () => {
 const {setup}=require('../NativeSourceWorkspace/fixtures/vscode.cjs');
 const {NativeSourceWorkspace}=require('../../extension/src/NativeSourceWorkspace');
 const {registerNativeClassWorkspaces}=require('../../extension/src/native-class-workspaces');
 const f=setup({flags:{documentReopen:true},reply(command,request){
  if(command==='source.semantic.reopen')return{passed:true,code:0,body:structuredClone(f.document)};
  if(command==='source.semantic.query')return{passed:true,code:0,body:{provider:'jox',projectId:f.snapshot.projectId,generation:request.generation,items:[],offset:0,limit:100,total:0,nextOffset:null}};
 }});
 f.document.entityId=f.document.documentId='opaque-restored-type';
 f.document.entity={id:f.document.entityId,kind:'class',name:'RepeatedName',qualifiedName:{schema:'ExactNativeSchema',type:'RepeatedName'}};
 f.document.documentBinding={format:1,key:'a'.repeat(32),projectUri:'file:///C:/project'};
 const uri={scheme:'jade-source',path:'/.jade/projections/'+f.document.documentBinding.key+'.jade',query:new URLSearchParams({project:'file:///C:/project',binding:f.snapshot.projectId}).toString(),toString(){return this.scheme+':'+this.path+'?'+this.query;}};
 const dirtyText='unsaved restored text';const document={uri,isDirty:true,version:7,getText:()=>dirtyText,save:()=>assert.fail('Restoring a class must not save its document')};f.documents.push(document);
 const workspace=new NativeSourceWorkspace({vscode:f.vscode,client:f.client,configFor:()=>f.config});workspace.register(f.context);
 const classes=registerNativeClassWorkspaces(f.vscode,f.context,workspace);const panel=f.vscode.window.createWebviewPanel();
 try{
  await classes.provider.resolveCustomTextEditor(document,panel);await panel.receive({command:'ready'});
  const snapshot=panel.sent.find(message=>message.command==='workspace').snapshot;
  assert.equal(snapshot.identity.entityId,'opaque-restored-type');assert.equal(snapshot.identity.schema,'ExactNativeSchema');
  assert.equal(snapshot.identity.qualifiedName,'ExactNativeSchema::RepeatedName');
  assert.deepEqual(workspace.record(uri).document.revision,f.document.revision);
  assert.equal(document.getText(),dirtyText);assert.equal(document.isDirty,true);
  assert.equal(f.requests.filter(row=>row.command==='source.semantic.prepare').length,1);
  assert.equal(f.requests.filter(row=>row.command==='source.semantic.reopen').length,1);
  assert.equal(f.requests.find(row=>row.command==='source.semantic.query').body.parentId,'opaque-restored-type');
  assert.equal(f.requests.some(row=>row.command==='source.semantic.applyEdit'||row.command==='source.semantic.read'),false);
 }finally{classes.provider.dispose();workspace.dispose();}
});
