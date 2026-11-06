'use strict';
// Opt-in proof only. No production seed path is changed by this test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { open } = require('./inspector-native-connected.test');
const { prepareWorkingDatabase, decodeNativeText } = require('../extension/src/working-database');
const { nativeTestReport } = require('../extension/src/native-reports');

const enabled = process.env.JADE_ONLINE_BACKUP_PROOF === '1';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function listening(port) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    })) return;
    await delay(100);
  }
  throw Error('Private online-backup server did not start');
}

test('online native seed backup preserves connected client and restores a compilable private database',
  { skip: !enabled, timeout: 180000 }, async () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../inspector/build/notification-config.json'), 'utf8'));
    const expected = path.resolve(__dirname, '../inspector/build/notification-database/system');
    assert.equal(fs.realpathSync.native(config.databasePath).toLowerCase(), fs.realpathSync.native(expected).toLowerCase());
    const root = path.join(process.env.LOCALAPPDATA, 'JadeVSCode', 'online-backup-proof', crypto.randomUUID());
    fs.mkdirSync(root, { recursive: true });
    const directories = Object.fromEntries(['logs', 'journals', 'transient', 'scratch', 'environment', 'backup', 'system']
      .map(name => [name, path.join(root, name)]));
    for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
    const baseIni = fs.readFileSync(config.iniPath, 'utf8');
    const port = 61507;
    const serverIni = path.join(root, 'source-server.ini');
    const networkIni = baseIni.replace(/^NetworkSpecification\d+=.*\r?\n?/gmi, '')
      .replace('[JadeServer]', '[JadeServer]\r\nNetworkSpecification1=TcpIpV4,Enabled,' + port + ',127.0.0.1')
      .replace(/^ServerNodeSpecifications=.*/mi, 'ServerNodeSpecifications=TcpIp,127.0.0.1,' + port);
    fs.writeFileSync(serverIni, networkIni);
    const clientIni = path.join(root, 'source-client.ini');
    fs.writeFileSync(clientIni, networkIni);
    const multi = { ...config, root, iniPath: clientIni, server: 'multiUser', schema: 'RootSchema', readOnly: true };
    const serverConfig = path.join(root, 'server-config.json');
    fs.writeFileSync(serverConfig, JSON.stringify({ ...multi, iniPath: serverIni }));
    const launcher = path.join(root, 'start-server.ps1');
    fs.writeFileSync(launcher, fs.readFileSync(path.resolve(__dirname, '../inspector/start-test-server.ps1'), 'utf8')
      .replace('policy-database', 'notification-database'));
    const commands = [];
    function native(name, args) {
      const start = performance.now();
      try {
        const output = execFileSync(path.join(config.installPath, 'bin', name), args,
          { windowsHide: true, timeout: 90000, encoding: 'utf8', cwd: root });
        commands.push({ name, args, code: 0, milliseconds: performance.now() - start, output });
        return output;
      } catch (error) {
        commands.push({ name, args, code: error.status, milliseconds: performance.now() - start,
          output: String(error.stdout || '') + String(error.stderr || '') });
        throw error;
      }
    }
    let client, restoredClient, serverPid;
    const evidence = { root, sourceDatabasePath: config.databasePath, port, commands };
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', '& { ' + fs.readFileSync(launcher, 'utf8') +
        " } -Config '" + serverConfig.replaceAll("'", "''") + "'"],
        { windowsHide: true, stdio: 'ignore', timeout: 15000 });
      serverPid = Number(fs.readFileSync(path.join(root, 'server.pid'), 'utf8').trim());
      await listening(port);
      client = open(multi);
      assert.equal((await client.ready).server, 'multiUser');
      assert.ok((await client.request('catalog')).schemas.some(s => s.name === 'SJetSchema'));
      const sourceIniBeforePreparation = fs.readFileSync(clientIni);

      // The red control recreates the old exclusive backup while a real client is held.
      let working;
      if (process.env.JADE_ONLINE_BACKUP_USE_OFFLINE === '1') {
        native('jdbutilb.exe', ['path=' + config.databasePath, 'ini=' + serverIni, 'backup',
          'backupDir=' + directories.backup, 'verify', 'nostatus']);
      } else {
        const messages = [];
        working = await prepareWorkingDatabase({ ...multi,
          workingDatabaseDirectory: path.join(root, 'product-working'), timeoutMilliseconds: 90000 },
        text => messages.push(text));
        evidence.productPrepareWorkingDatabase = true;
        evidence.preparationOutput = messages.join('');
        evidence.preparationCommands = fs.readFileSync(path.join(working.root, 'native-commands.jsonl'), 'utf8')
          .trim().split(/\r?\n/).map(line => JSON.parse(line));
        assert.deepEqual(fs.readFileSync(clientIni), sourceIniBeforePreparation,
          'Product preparation must not modify the existing source connection INI');
      }
      assert.equal(client.child.exitCode, null, 'The original client must remain connected');
      assert.ok((await client.request('catalog')).schemas.some(s => s.name === 'SJetSchema'));
      evidence.clientSurvivedBackup = true;
      assert.ok(working, 'Online production preparation must create the working base');
      evidence.backupFiles = fs.readdirSync(path.join(working.root, 'backup'));
      evidence.backupMode = 'native online quiesced (clients remain connected, updates briefly paused)';
      const { databasePath, iniPath } = working;
      const restored = { ...config, ...working, server: 'singleUser', readOnly: true };
      restoredClient = open(restored);
      await restoredClient.ready;
      assert.ok((await restoredClient.request('catalog')).schemas.some(s => s.name === 'SJetSchema'));
      await restoredClient.close(); restoredClient = undefined;

      const source = path.join(root, 'InspectorOnlineBackupTest.cls');
      fs.writeFileSync(source, `jadeVersionNumber "25.0.02";\nschemaDefinition\nSJetSchema subschemaOf RootSchema partialDefinition;\ntypeHeaders\nInspectorOnlineBackupTest subclassOf JadeTestCase transient, transientAllowed, subclassTransientAllowed;\ntypeDefinitions\nInspectorOnlineBackupTest completeDefinition\n(\njadeMethodDefinitions\nbackupCloneExecutes() unitTest;\n)\ntypeSources\nInspectorOnlineBackupTest (\njadeMethodSources\nbackupCloneExecutes\n{\nbackupCloneExecutes() unitTest;\nbegin\n assertTrue(true);\nend;\n}\n)\n`);
      native('jadloadb.exe', ['path=' + databasePath, 'ini=' + iniPath, 'server=singleUser',
        'schemaFile=' + source, 'targetSchema=SJetSchema', 'loadStyle=currentSchemaVersion',
        'replayableReorg=true', 'dontSaveSources=false']);
      const control = path.join(root, 'test.xml'), log = path.join(root, 'test.log');
      fs.writeFileSync(control, `<unitTest><reporter logFile="${log}"/><tests><test name="OnlineBackupProof"><schema name="SJetSchema"/><class name="InspectorOnlineBackupTest"/></test></tests></unitTest>`);
      native('jadclient.exe', ['path=' + databasePath, 'ini=' + iniPath, 'server=singleUser',
        'schema=RootSchema', 'app=JadeUnitTestBatch', 'startAppParameters', control, 'OnlineBackupProof', log, 'endAppParameters']);
      evidence.report = nativeTestReport(decodeNativeText(fs.readFileSync(log)),
        { schema: 'SJetSchema', owner: 'InspectorOnlineBackupTest', methods: ['backupCloneExecutes'] });
      assert.equal(evidence.report.tests_completed, true);
      assert.equal(evidence.report.failures, 0);
      evidence.compiledAndRanNativeTest = true;
    } finally {
      if (restoredClient) await restoredClient.close();
      if (client) await client.close();
      if (serverPid) execFileSync(path.resolve(__dirname, '../inspector/build/stop-server.exe'), [String(serverPid)],
        { windowsHide: true, timeout: 25000 });
      fs.writeFileSync(path.resolve(__dirname, '../evidence/native-online-backup.json'), JSON.stringify(evidence, null, 2));
    }
  });
