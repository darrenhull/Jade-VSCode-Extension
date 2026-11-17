'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { registerJoxWorkspace } = require('../../extension/src/register-jox-workspace');
const { setup } = require('./fixtures/vscode.cjs');
test('JOX activation registers a native file system and paged native source tree without a CLS index', async () => {
  const f = setup({ reply: (command, request) => {
    if (command !== 'source.semantic.query') return;
    const items = request.kind === 'schema' ? [{ id: 'native-schema', name: 'Example', kind: 'schema' }]
      : request.kind === 'type' ? [{ id: 'native-type', name: 'ExampleType', kind: 'class' }] : [];
    return { passed: true, code: 0, body: { provider: 'jox', projectId: f.snapshot.projectId, generation: f.snapshot.generation, items, total: items.length, offset: 0, limit: 100, nextOffset: null } };
  } });
  const registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  assert.ok(f.fileSystems.has('jade-source')); assert.equal(registered.language?.index, undefined);
  const tree = f.trees.get('jadeNative.classes'), roots = await tree.getChildren();
  const schemas = await tree.getChildren(roots[0]), types = await tree.getChildren(schemas[0]);
  assert.equal(schemas[0].entity.id, 'native-schema'); assert.equal(types[0].entity.id, 'native-type');
  assert.deepEqual(f.requests.map(value => value.command), ['source.semantic.prepare', 'source.semantic.query', 'source.semantic.query']);
});
test('actual native editor command retains dirty base across refresh and routes saves through native', async () => {
  const f = setup(), registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  const project = await registered.workspace.prepare(f.folder);
  const row = { project, entity: { id: f.document.entityId, kind: 'method' } };
  const uri = await f.commands.get('jadeNative.showClassMember')(row);
  f.snapshot.generation = 'generation-2'; await registered.workspace.prepare(f.folder);
  const same = await f.commands.get('jadeNative.showClassMember')(row); assert.equal(same.toString(), uri.toString());
  await f.fileSystems.get('jade-source').writeFile(uri, Buffer.from('saved through native'), { overwrite: true });
  assert.equal(f.requests.at(-1).command, 'source.semantic.applyEdit');
  assert.equal(f.requests.at(-1).body.baseRevision.generation, 'generation-1');
});
test('closed project and dirty JOX origin block execution before upload', async () => {
  const f = setup(), registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  const project = await registered.workspace.prepare(f.folder);
  f.documents.push({ uri: f.vscode.Uri.parse(f.document.origin.uri), isDirty: true });
  await assert.rejects(registered.workspace.execute(project, 'test', { entityIds: ['a'] }), /Save the JOX/);
  f.vscode.workspace.workspaceFolders = [];
  await assert.rejects(registered.workspace.execute(project, 'test', { entityIds: ['a'] }), /no longer open/);
  assert.equal(f.requests.some(value => value.command === 'test'), false);
});
test('one FileSystemProvider routes two native projects without accepting a foreign editor URI', async () => {
  const f = setup(), other = { name: 'Other', uri: f.vscode.Uri.file('C:/other') };
  f.vscode.workspace.workspaceFolders.push(other);
  const registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: folder => ({ ...f.config, workspaceRoots: [folder.uri.fsPath] }) });
  const first = registered.workspace.project(f.folder), second = registered.workspace.project(other);
  assert.notEqual(first.provider, second.provider); assert.equal(f.fileSystems.size, 1);
  assert.throws(() => f.fileSystems.get('jade-source').readFile(f.vscode.Uri.from({ scheme: 'jade-source', path: '/foreign.jade' })), /binding|owned|found/);
});
test('native test discovery and two actual UI runs use opaque identity without CLS discovery or result reuse', async () => {
  const f = setup({ testing: true, reply: (command, request) => {
    if (command === 'test') return { passed: true, code: 0, report: { tests_completed: true, cleanup_complete: true, results: [{ method: 'value', status: 'passed' }] } };
    if (command !== 'source.semantic.query') return;
    const items = [{ id: f.document.entityId, name: 'value', kind: 'method', testIdentity: { schema: 'ExactSchema', class: 'ExactTests', method: 'value' } }];
    return { passed: true, code: 0, body: { provider: 'jox', projectId: f.snapshot.projectId, generation: f.snapshot.generation, items, total: 1, offset: 0, limit: 100, nextOffset: null } };
  } });
  const registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  await registered.testing.discover();
  for (let i = 0; i < 2; i++) await registered.testing.run({});
  const executions = f.requests.filter(value => value.command === 'test');
  assert.equal(executions.length, 2); assert.deepEqual(executions[0].body.semanticSelection.entityIds, [f.document.entityId]);
  assert.deepEqual(executions[0].body.testIdentity, { schema: 'ExactSchema', class: 'ExactTests', method: 'value' });
  assert.deepEqual(executions[0].body.config.methods, ['value']);
  assert.equal(f.requests.filter(value => value.command === 'source.semantic.prepare').length, 3, 'one discovery preparation then one per execution');
  assert.ok(f.testRuns.every(events => events.filter(event => event.name === 'passed').length === 1 && events.at(-1).name === 'end'));
  assert.ok(f.requests.every(value => !value.command.startsWith('source.index.') && !value.command.startsWith('working.baseline.')));
});
test('shipped activation uses one shared CLI and never loads legacy source index/parser registrations', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const f = setup(), loaded = [], settings = { installPath: 'C:/Jade', databasePath: 'C:/Source/system', iniPath: 'C:/Source/source.ini' };
  f.vscode.workspace.getConfiguration = () => ({ get: key => settings[key], inspect: () => ({}) });
  let inspection, disposed = false;
  f.client.dispose = async () => { disposed = true; };
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/src/extension.js'), 'utf8');
  const exported = { exports: {} };
  const require_ = name => {
    loaded.push(name);
    if (name === 'vscode') return f.vscode;
    if (name === './cli-client') return { CliWorkingSession: class { constructor() { return f.client; } } };
    if (name === './cli-gateway') return { configure: value => { assert.ok(value === f.client || value === undefined); } };
    if (name === './object-explorer') return { registerObjectExplorer: (_vscode, _context, options) => { inspection = options; return { releaseForOperation: async () => {} }; } };
    if (['./language-tools', './workspace-index', './SourceIndexCache', './class-view', './testing', './navigation'].includes(name)) assert.fail('JOX activation loaded legacy machinery: ' + name);
    return name.startsWith('./') ? require('../../extension/src/' + name.slice(2)) : require(name);
  };
  vm.runInNewContext('(function(require,module,__dirname){' + source + '\n})', { process, Buffer, console })(require_, exported, path.resolve(__dirname, '../../extension/src'));
  const registered = exported.exports.activate({ ...f.context, extensionPath: 'C:/extension', workspaceState: { get: () => 'initial' } });
  assert.equal(registered.nativeTests, f.client); assert.equal(inspection.client, f.client);
  const config = inspection.config(undefined, f.folder);
  assert.equal(config.databasePath, settings.databasePath); assert.equal(config.iniPath, settings.iniPath);
  assert.equal(config.user, ''); assert.equal(config.password, '');
  assert.equal(config.sourceFormat, 'jox');
  assert.ok(f.fileSystems.has('jade-source'));
  await exported.exports.deactivate(); assert.equal(disposed, true);
});
test('native class row preserves existing menu context and opens actual Class Workspace renderer', async () => {
  const f = setup({ reply: (command, request) => {
    if (command === 'source.semantic.read') return { passed: true, code: 0, body: { ...structuredClone(f.document), entityId: request.entityId } };
    if (command !== 'source.semantic.query') return;
    const items = request.kind === 'schema' ? [{ id: 'schema', kind: 'schema', name: 'Example' }]
      : request.kind === 'type' ? [{ id: 'type', kind: 'class', name: 'Generic', qualifiedName: { schema: 'Example', type: 'Generic' } }]
        : [{ id: f.document.entityId, kind: 'method', name: 'value', parentId: 'type', qualifiedName: { schema: 'Example', type: 'Generic', member: 'value' } }];
    return { passed: true, code: 0, body: { provider: 'jox', projectId: f.snapshot.projectId, generation: f.snapshot.generation, items, total: items.length, offset: 0, limit: 100, nextOffset: null } };
  } });
  registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  const tree = f.trees.get('jadeNative.classes'), roots = await tree.getChildren(), schemas = await tree.getChildren(roots[0]), types = await tree.getChildren(schemas[0]);
  assert.equal(tree.getTreeItem(types[0]).contextValue, 'jadeSourceClass');
  await f.commands.get('jadeNative.openClassWorkspace')(types[0]);
  const panel = f.panels[0]; assert.match(panel.webview.html, /CLASS WORKSPACE/); assert.match(panel.webview.html, /Browse members/);
  await panel.receive({ command: 'ready' });
  assert.equal(panel.sent.find(message => message.command === 'workspace').snapshot.groups[0].items[0].id, f.document.entityId);
  await panel.receive({ command: 'select', id: f.document.entityId });
  assert.equal(panel.sent.filter(message => message.command === 'editorSnapshot').at(-1).snapshot.editorMode, 'native');
  assert.ok(f.commands.has('jadeNative.browseSourceClasses'));
  assert.equal(f.requests.some(request => request.command.startsWith('source.index.')), false);
});
test('existing class menus have real command handlers and unqualified Source actions cannot fall back to CLS', async () => {
  const f = setup(); registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  const manifest = require('../../extension/package.json');
  for (const item of manifest.contributes.menus['view/item/context'].filter(item => item.when.includes('view == jadeNative.classes')))
    assert.equal(typeof f.commands.get(item.command), 'function', item.command + ' must not be a dead menu');
  for (const command of ['jadeNative.compileClass', 'jadeNative.buildWorkspace', 'jadeNative.runLocalTests', 'jadeNative.browseSourceClasses', 'jadeNative.openClassWorkspace'])
    assert.equal(typeof f.commands.get(command), 'function');
  assert.throws(() => f.commands.get('jadeNative.publishClass')(), /not yet supported/);
  assert.equal(f.requests.length, 0);
});
test('actual compile command uses the selected native identity and preserves original native failure', async () => {
  const failure = { passed: false, code: 6295, report: { error: 'Native loader refused the selected saved changes', nativeOutput: 'Original native output' } };
  const f = setup({ reply: command => command === 'build' ? failure : undefined });
  const registered = registerJoxWorkspace(f.vscode, f.context, { client: f.client, configFor: () => f.config });
  const project = await registered.workspace.prepare(f.folder), uri = await registered.workspace.open(project, f.document.entityId);
  const before = f.requests.length, result = await f.commands.get('jadeNative.compileClass')(uri);
  assert.deepEqual(result, failure);
  assert.deepEqual(f.requests.slice(before).map(request => request.command), ['source.semantic.prepare', 'build']);
  assert.deepEqual(f.requests.at(-1).body.semanticSelection, { entityIds: [f.document.entityId] });
  assert.equal(f.requests.at(-1).body.config.password, '');
});
