'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { InspectorTransport } = require('../extension/src/object-transport');
const { ClassBrowserModel } = require('../extension/src/class-browser-model');

test('native readonly catalogue returns the private 30k class fixture through the production 8MiB transport',
  { skip: process.env.JADE_NATIVE_CLASS_SCALE !== '1', timeout: 150000 }, async () => {
    const prior = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../evidence/large-workspace-control.json'), 'utf8'));
    const expectedRoot = path.join(process.env.LOCALAPPDATA, 'JadeHeadless/large-workspace-control/1793920485093');
    const canonical = value => fs.realpathSync.native(value).toLowerCase();
    assert.equal(canonical(prior.root), canonical(expectedRoot), 'Only the exact private generated 30k fixture');
    const databasePath = path.join(prior.root, 'working/system'), originalIni = path.join(prior.root, 'working/working.ini');
    assert.ok(fs.existsSync(path.join(databasePath, '_control.dat')));
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-native-class-scale-'));
    const iniPath = path.join(temporary, 'inspection.ini'), session = path.join(temporary, 'session.json');
    fs.copyFileSync(originalIni, iniPath);
    fs.writeFileSync(session, JSON.stringify({ installPath: 'C:/Jade2025', databasePath, iniPath,
      server: 'singleUser', schema: 'RootSchema', readOnly: true }));
    const evidence = { syntheticNativeFixture: true, databasePath, recordedUtc: new Date().toISOString(),
      maxTransportBytes: 8 * 1024 * 1024, timeoutMilliseconds: 120000, nativeMetadataStreaming: false };
    const start = performance.now(), helper = path.resolve(__dirname, '../extension/native/jade-inspect-helper.exe');
    const transport = new InspectorTransport(helper, session,
      { readyTimeout: 120000, requestTimeout: 120000, stopTimeout: 10000 });
    let outputBytes = 0, errors = '';
    transport.child.stdout.on('data', chunk => { outputBytes += chunk.length; });
    transport.on('output', value => { errors += value; });
    transport.on('failure', error => { evidence.failure = error.message; });
    try {
      const ready = await transport.ready;
      evidence.connectMilliseconds = performance.now() - start;
      assert.equal(ready.readOnly, true);
      const beforeBytes = outputBytes, catalogStart = performance.now();
      const catalog = await transport.request('catalog', { includeSystem: false });
      evidence.catalogMilliseconds = performance.now() - catalogStart;
      evidence.catalogWireBytes = outputBytes - beforeBytes;
      evidence.catalogBodyJsonBytes = Buffer.byteLength(JSON.stringify(catalog));
      evidence.schemas = catalog.schemas.map(schema => ({ name: schema.name, classes: schema.classes.length }));
      const large = catalog.schemas.find(schema => schema.classes.length >= prior.classes);
      assert.ok(large, 'The native response includes the generated 30k schema');
      evidence.largeSchema = large.name;
      evidence.totalClasses = catalog.schemas.reduce((sum, schema) => sum + schema.classes.length, 0);
      const modelStart = performance.now(), browser = new ClassBrowserModel({ scope: 'native-scale-private' });
      browser.setClasses(catalog.schemas.flatMap(schema => schema.classes.map(row => ({ ...row, schema: schema.name }))));
      evidence.modelMilliseconds = performance.now() - modelStart;
      const page = browser.page({ schema: large.name });
      assert.equal(page.items.length, 100);
      const last = large.classes.at(-1), searchStart = performance.now();
      const result = browser.search(large.name + '::' + last.name);
      evidence.finalClassSearchMilliseconds = performance.now() - searchStart;
      assert.equal(result.total, 1);
      assert.equal(result.items[0].name, last.name);
      evidence.lastClass = last.name;
      evidence.renderedClassRows = page.items.length;
      evidence.fullMetadataPacketUnderLimit = evidence.catalogBodyJsonBytes < evidence.maxTransportBytes;
      assert.equal(evidence.fullMetadataPacketUnderLimit, true);
      evidence.passed = true;
    } catch (error) {
      evidence.passed = false; evidence.failure = error.message; throw error;
    } finally {
      const closing = performance.now();
      await transport.stop(); await transport.exited;
      evidence.closeMilliseconds = performance.now() - closing;
      evidence.totalMilliseconds = performance.now() - start;
      evidence.nativeOutput = errors;
      fs.writeFileSync(path.resolve(__dirname, '../evidence/native-class-catalogue-scale.json'), JSON.stringify(evidence, null, 2));
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
