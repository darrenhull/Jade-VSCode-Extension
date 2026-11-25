'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('../../extension/package.json');
const { NativeSourceProvider } = require('../../extension/src/NativeSourceProvider');
const { fixture } = require('../NativeSourceProvider/fixtures/provider.cjs');
const name = 'sourcePreparationTimeoutSeconds';

function explicitSettings(values = {}, scope = 'workspaceFolderValue') {
  const settings = {
    get: key => Object.hasOwn(values, key) ? values[key] : manifest.contributes.configuration.properties['jadeNative.' + key]?.default,
    inspect: key => ({ defaultValue: manifest.contributes.configuration.properties['jadeNative.' + key]?.default,
      ...(Object.hasOwn(values, key) ? { [scope]: values[key] } : {}) })
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../../extension/src/extension.js'), 'utf8');
  const load = id => id === 'vscode' ? { workspace: { getConfiguration: () => settings } }
    : id.startsWith('node:') ? require(id)
    : id === './config' ? require('../../extension/src/config') : {};
  vm.runInNewContext('(function(require,module){' + source + '\nmodule.exports.readConfigurationForControl=explicitDefaults;\n})',
    { process, Buffer, console })(load, module);
  return JSON.parse(JSON.stringify(module.exports.readConfigurationForControl({ scheme: 'file', fsPath: 'C:/project' })));
}

test('semantic preparation has a configurable fifteen-minute resource default', () => {
  const setting = manifest.contributes.configuration.properties['jadeNative.' + name];
  assert.ok(setting, 'Semantic preparation needs an inspectable setting');
  assert.equal(setting.type, 'integer');
  assert.equal(setting.default, 900);
  assert.equal(setting.minimum, 1);
  assert.equal(setting.maximum, 7200);
  assert.equal(setting.scope, 'resource');
});

test('built-in preparation defaults never override native project configuration', () => {
  const config = explicitSettings({ testTimeoutSeconds: 240 });
  assert.equal(Object.hasOwn(config, name), false);
  assert.equal(Object.hasOwn(config, 'timeoutMilliseconds'), false);
  assert.equal(config.testTimeoutSeconds, 240);
});

for (const scope of ['globalValue', 'workspaceValue', 'workspaceFolderValue', 'globalLanguageValue', 'workspaceLanguageValue', 'workspaceFolderLanguageValue']) {
  test('an explicit preparation fallback from ' + scope + ' reaches the native source request unchanged', async () => {
    const config = explicitSettings({ [name]: 1234, testTimeoutSeconds: 45 }, scope);
    assert.equal(config[name], 1234);
    const f = fixture();
    const supplied = { ...f.config, ...config, timeoutMilliseconds: 240000 };
    const provider = new NativeSourceProvider({ client: f.client, config: supplied });
    await provider.prepare();
    const sent = f.requests.find(row => row.command === 'source.semantic.prepare').body.config;
    assert.equal(sent[name], 1234);
    assert.equal(sent.timeoutMilliseconds, 240000, 'An explicit native/project timeout remains authoritative');
    assert.equal(sent.testTimeoutSeconds, 45, 'Native test execution keeps its separate limit');
    assert.deepEqual(supplied, { ...f.config, ...config, timeoutMilliseconds: 240000 });
  });
}
test('setup and reviewed sync retain the fallback and authoritative native/project deadline', async () => {
  let f;
  f = fixture({ flags: { checkoutInitialization: true, sync: true, reviewedWorkingSync: true }, reply: command => {
    if (command === 'working.initialize') {
      const { provider, projectId, generation, snapshotHash, projectRoot, sourceRoots } = f.snapshot;
      return { passed: true, code: 0, body: { projectRoot, sourceRoots, sourceSnapshot: { provider, projectId, generation, snapshotHash },
        capabilities: f.flags, working: { identity: 'target-A', root: 'C:/private/generation' },
        report: { workingMode: 'git-first', workingPrepared: true, publicationEstablished: true } } };
    }
    if (command === 'sync') return { passed: true, code: 0, report: { inSync: true, reviewedWorkingIdentity: 'target-A' } };
  } });
  const supplied = { ...f.config, ...explicitSettings({ [name]: 1234, testTimeoutSeconds: 45 }), timeoutMilliseconds: 240000 };
  const provider = new NativeSourceProvider({ client: f.client, config: supplied });
  await provider.initializeCheckout({ expectedWorkingIdentity: 'target-A' });
  await provider.sync({ expectedWorkingIdentity: 'target-A' });
  for (const command of ['working.initialize', 'source.semantic.prepare', 'sync']) {
    const sent = f.requests.find(row => row.command === command).body.config;
    assert.equal(sent[name], 1234, command);
    assert.equal(sent.timeoutMilliseconds, 240000, command);
    assert.equal(sent.testTimeoutSeconds, 45, command);
  }
});