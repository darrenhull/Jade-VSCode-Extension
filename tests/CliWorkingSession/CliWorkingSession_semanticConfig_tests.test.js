'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CliWorkingSession } = require('../../extension/src/cli-client');
function fixture() {
  const packets = [], child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = () => queueMicrotask(() => child.emit('close', 0));
  child.kill = () => { throw Error('Graceful synthetic child must not need a kill'); };
  child.stdin.write = line => {
    const packet = JSON.parse(line); packets.push(packet);
    queueMicrotask(() => child.stdout.emit('data', Buffer.from(JSON.stringify({ id: packet.id, event: 'result',
      result: { code: 0, passed: true, config: packet.config || {}, body: {} } }) + '\n')));
  };
  return { packets, session: new CliWorkingSession({ entry: 'generic-cli.exe', spawn: () => child }) };
}
const config = { sourceFormat: 'jox', workingJadeGitPolicy: 'disabled', user: '', password: '',
  iniPath: 'C:/generic/source.ini', connectionProfile: 'selected-private-profile' };
test('semantic project preparation retains the selected future Working policy and exact credentials', async () => {
  const f = fixture();
  try {
    await f.session.request('source.semantic.prepare', { cwd: 'C:/generic', config }).promise;
    assert.deepEqual(f.packets[0].config, config);
    assert.equal(f.packets[0].config.workingJadeGitPolicy, 'disabled');
  } finally { await f.session.dispose(); }
});
test('real Source extraction/index/inspection retain their protected config and never receive Working policy', async () => {
  const f = fixture();
  try {
    await f.session.request('source.extract', { config }).promise;
    await f.session.request('source.index.prepare', { config }).promise;
    await f.session.inspectionTarget(config, 'source');
    for (const packet of f.packets) {
      assert.equal(Object.hasOwn(packet.config, 'workingJadeGitPolicy'), false);
      assert.equal(packet.config.iniPath, config.iniPath);
      assert.equal(packet.config.user, ''); assert.equal(packet.config.password, '');
    }
    assert.equal(config.workingJadeGitPolicy, 'disabled');
  } finally { await f.session.dispose(); }
});
