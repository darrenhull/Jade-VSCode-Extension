'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../../extension/package.json');
const {registerSidebar} = require('../../extension/src/sidebar');

test('new definition is discoverable without removing existing authoring commands', () => {
  const commands = new Map(manifest.contributes.commands.map(item => [item.command, item]));
  assert.equal(commands.get('jadeNative.createDefinition')?.title, 'Jade: Create Schema, Class or Collection');
  assert.ok(commands.has('jadeNative.createSchema'));
  assert.ok(commands.has('jadeNative.createKeyedCollection'));
});

test('Tools exposes the shared designer alongside compatible creation commands', () => {
  let provider;
  const vscode = {
    commands: {registerCommand() { return {dispose() {}}; }},
    workspace: {workspaceFolders: []},
    window: {
      createOutputChannel() { return {dispose() {}}; },
      registerTreeDataProvider(id, value) { if (id === 'jadeNative.tools') provider = value; return {dispose() {}}; }
    },
    EventEmitter: class { fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } },
    ThemeIcon: class {}, TreeItemCollapsibleState: {None: 0}
  };
  registerSidebar(vscode, {subscriptions: [], workspaceState: {get() {}}}, {});
  const rows = provider.getChildren();
  assert.ok(rows.some(row => row.command.command === 'jadeNative.createDefinition'));
  assert.ok(rows.some(row => row.command.command === 'jadeNative.createSchema'));
  assert.ok(rows.some(row => row.command.command === 'jadeNative.createKeyedCollection'));
});
