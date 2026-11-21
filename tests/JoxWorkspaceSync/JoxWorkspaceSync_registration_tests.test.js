'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../NativeSourceWorkspace/fixtures/vscode.cjs');
const { registerJoxWorkspaceSync } = require('../../extension/src/jox-workspace-sync');
const manifest = require('../../extension/package.json');

test('Only a trusted, selected project with explicit sync capability exposes the palette command', async () => {
  const state = setup();
  const context = new Map(), sync = 'jadeNative.syncWorkspaceToWorking', key = 'jadeNative.workspaceSyncAvailable';
  state.commands.set('setContext', (name, value) => context.set(name, value));
  state.vscode.workspace.isTrusted = true;
  let advertised, change;
  state.vscode.window.onDidChangeActiveTextEditor = fn => { change = fn; return { dispose() {} }; };
  const project = { folder: state.folder, provider: { capability: async () => ({ sync: advertised }) } };
  registerJoxWorkspaceSync(state.vscode, state.context, { projectForUri: () => project });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  assert.equal(context.get(key), false);
  assert.equal(manifest.contributes.commands.find(row => row.command === sync).enablement, key);
  assert.equal(manifest.contributes.menus.commandPalette.find(row => row.command === sync).when, key);
  advertised = true;
  change(); await settle();
  assert.equal(context.get(key), true);
  state.vscode.workspace.isTrusted = false;
  change(); await settle();
  assert.equal(context.get(key), false);
});

test('The command reports native refusal and does not report ambiguous success as synced', async () => {
  const state = setup(), errors = [], info = [];
  state.vscode.workspace.isTrusted = true;
  state.vscode.window.showErrorMessage = async text => { errors.push(text); };
  state.vscode.window.showInformationMessage = async text => { info.push(text); };
  const project = { folder: state.folder, provider: { capability: async () => ({ sync: true }) } };
  const responses = [{ passed: false, code: 2, report: { error: 'Initialize the owned JOX Working copy before execution' } },
    { passed: true, code: 0 }, { passed: true, code: 0, report: { inSync: true } },
    { passed: false, code: 6295, report: { publicationBlocked: true, deployment: { message: 'Native loader refused the class' } } },
    ...[0, 1, 2].map(savedOverlayFiles => ({ passed: true, code: 0, report: { inSync: true, uploaded: false,
      repositoryHead: 'a42b5c9e'.padEnd(40, '0'), savedOverlayFiles } }))];
  registerJoxWorkspaceSync(state.vscode, state.context, { projectForUri: () => project,
    sync: async selected => { assert.equal(selected, project); return responses.shift(); } });
  const command = state.commands.get('jadeNative.syncWorkspaceToWorking');
  while (responses.length) await command();
  assert.match(errors[0], /Initialize the owned JOX Working copy/);
  assert.match(errors[1], /did not confirm/);
  assert.match(errors[2], /Native loader refused the class.*Working may be partially updated.*before retrying/);
  assert.deepEqual(info, ['Working is up to date with the saved JOX snapshot for Example.',
    'Working matches commit a42b5c9e for Example.',
    'Working matches commit a42b5c9e plus 1 saved file change for Example.',
    'Working matches commit a42b5c9e plus 2 saved file changes for Example.']);
});
