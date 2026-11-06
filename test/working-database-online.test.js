'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-online-seed-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const install = path.join(root, 'install'), seed = path.join(root, 'seed');
  fs.mkdirSync(path.join(install, 'bin'), { recursive: true });
  fs.mkdirSync(seed);
  for (const name of ['jdbutilb.exe', 'jadloadb.exe', 'jadclient.exe', ...(options.noAdmin ? [] : ['jdbadmin.exe'])])
    fs.writeFileSync(path.join(install, 'bin', name), 'test placeholder');
  fs.writeFileSync(path.join(seed, '_control.dat'), 'fixture');
  const iniPath = path.join(root, 'source-connection.ini');
  const sourceIni = '[Jade]\nServer=MultiUser\n[JadeClient]\nServerNodeSpecifications=TcpIp,fixture-host,61507\n[JadeLog]\nLogDirectory=C:/source-logs\n';
  fs.writeFileSync(iniPath, sourceIni);
  const calls = [];
  function spawn(exe, args) {
    calls.push({ exe, args: [...args] });
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => child.emit('close', 2);
    queueMicrotask(() => {
      if (options.nativeIniDefaults && path.basename(exe) === 'jdbadmin.exe') {
        const ini = args.find(x => x.startsWith('ini=')).slice(4);
        fs.appendFileSync(ini, '\nNativeDefault=<default>\n');
      }
      if (args.includes('restore')) {
        const destination = args.find(x => x.startsWith('path=')).slice(5);
        fs.writeFileSync(path.join(destination, '_control.dat'), 'restored fixture');
      }
      if (options.backupFailure && !args.includes('restore')) {
        child.stderr.emit('data', Buffer.from('native backup denied'));
        child.emit('close', 1713);
      } else child.emit('close', 0);
    });
    return child;
  }
  const module = { exports: {} };
  const filename = path.resolve(__dirname, '../extension/src/working-database.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, process, setTimeout, clearTimeout,
    require: name => name === 'node:child_process' ? { spawn } :
      name.startsWith('./') ? require(path.resolve(path.dirname(filename), name)) : require(name),
  }, { filename });
  return {
    config: { installPath: install, databasePath: seed, iniPath, server: 'multiUser',
      storagePath: path.join(root, 'storage'), workingDatabaseDirectory: path.join(root, 'working') },
    calls, sourceIni, prepare: module.exports.prepareWorkingDatabase,
  };
}

test('MultiUser seed copies native source connection INI and preserves the original bytes', async t => {
  const f = fixture(t, { nativeIniDefaults: true }), output = [];
  const working = await f.prepare(f.config, value => output.push(value));
  assert.equal(path.basename(f.calls[0].exe), 'jdbadmin.exe');
  const args = f.calls[0].args;
  for (const option of ['action=Backup', 'server=multiUser', 'quiesced=true', 'verify=true',
    'ini=' + path.join(working.root, 'source-backup.ini'), 'path=' + f.config.databasePath]) assert.ok(args.includes(option), option);
  assert.equal(path.basename(f.calls[1].exe), 'jdbutilb.exe');
  for (const option of ['restore', 'noRecovery', 'clearFilePaths', 'ini=' + working.iniPath])
    assert.ok(f.calls[1].args.includes(option), option);
  assert.equal(fs.readFileSync(f.config.iniPath, 'utf8'), f.sourceIni);
  assert.equal(fs.readFileSync(path.join(working.root, 'source-backup.ini'), 'utf8'), f.sourceIni + '\nNativeDefault=<default>\n');
  assert.match(output.join(''), /quiesc|temporar|pause/i);
  assert.ok(fs.existsSync(path.join(working.root, 'working-database.json')));
});

test('SingleUser seed keeps the existing offline native backup path without jdbadmin', async t => {
  const f = fixture(t, { noAdmin: true });
  f.config.server = 'singleUser';
  const working = await f.prepare(f.config);
  assert.equal(path.basename(f.calls[0].exe), 'jdbutilb.exe');
  assert.ok(f.calls[0].args.includes('backup'));
  assert.ok(f.calls[0].args.includes('ini=' + working.iniPath));
  assert.ok(!f.calls.some(call => call.args.includes('server=multiUser')));
});

test('Missing online utility fails before starting any native tool, without offline fallback', async t => {
  const f = fixture(t, { noAdmin: true });
  await assert.rejects(f.prepare(f.config), /jdbadmin\.exe/);
  assert.equal(f.calls.length, 0);
});

test('Failed online backup never restores, marks readiness or falls back to exclusive backup', async t => {
  const f = fixture(t, { backupFailure: true });
  await assert.rejects(f.prepare(f.config), /1713.*native backup denied/);
  assert.equal(f.calls.length, 1);
  assert.equal(path.basename(f.calls[0].exe), 'jdbadmin.exe');
  assert.equal(fs.existsSync(path.join(f.config.workingDatabaseDirectory, 'working-database.json')), false);
});

test('Cold backup and restore await owned runtime release; cached readiness starts no utility', async t => {
  const f = fixture(t), releasedBeforeCalls = [];
  f.config.beforeNativeProcess = async () => { releasedBeforeCalls.push(f.calls.length); };
  const working = await f.prepare(f.config);
  assert.deepEqual(releasedBeforeCalls, [0, 1]);
  assert.equal(working.beforeNativeProcess, f.config.beforeNativeProcess);
  await f.prepare(f.config);
  assert.equal(f.calls.length, 2);
  assert.equal(releasedBeforeCalls.length, 2);
});
