'use strict';
// One-off verification of the two demo databases explicitly authorized by the
// user. No fixture creation, schema loading, backup or data writes occur here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./inspector-native-connected.test');
const evidenceRoot = path.resolve(__dirname, '../evidence/explorer-demo');
const normalWorking = path.join(process.env.APPDATA, 'Code/User/globalStorage/jade-local-tools.jade-native-runner-cpp-preview/native/working-databases/6567ed9ed0934fc0255b2d4b/system');
const canonical = value => fs.realpathSync.native(value).toLowerCase();

async function inspect(label, allowedPath) {
  const config = JSON.parse(fs.readFileSync(path.join(evidenceRoot, label + '-config.json'), 'utf8'));
  assert.equal(canonical(config.databasePath), canonical(allowedPath), 'Exact authorized demo database only');
  const client = open({ ...config, readOnly: true });
  try {
    const ready = await client.ready;
    assert.equal(ready.readOnly, true);
    const catalog = await client.request('catalog');
    const schema = catalog.schemas.find(s => s.name === 'SJetSchema');
    assert.ok(schema);
    const instances = {};
    for (const [name, count] of [['ExplorerDemoPet', 6], ['ExplorerDemoStore', 1], ['ExplorerDemoPetsByName', 1]]) {
      const cls = schema.classes.find(c => c.name === name);
      assert.ok(cls, name + ' exists in ' + label);
      const page = await client.request('instances', { classOid: cls.oid, limit: 100, includeSubclasses: false });
      assert.equal(page.items.length, count, name + ' count');
      assert.equal(page.hasMore, false);
      instances[name] = page.items;
    }
    const petObjects = await Promise.all(instances.ExplorerDemoPet.map(item => client.request('object', { oid: item.oid })));
    const property = (object, name) => object.properties.find(p => p.name === name);
    const pets = new Map(petObjects.map(object => [property(object, 'name').value, object]));
    const names = ['Atlas', 'Bubbles', 'Clover', 'Daisy', 'Echo', 'Finn'];
    assert.deepEqual([...pets.keys()].sort(), names);
    const store = await client.request('object', { oid: instances.ExplorerDemoStore[0].oid });
    assert.equal(property(store, 'name').value, 'VS Code Explorer Demo');
    const collectionOid = property(store, 'pets').oid;
    assert.equal(collectionOid, instances.ExplorerDemoPetsByName[0].oid);
    assert.equal(property(store, 'featuredPet').oid, pets.get('Atlas').oid);
    const collectionObject = await client.request('object', { oid: collectionOid });
    assert.equal(collectionObject.collection, true);
    const entries = await client.request('collection', { oid: collectionOid, limit: 100 });
    assert.equal(entries.hasMore, false);
    assert.equal(entries.items.length, 6);
    assert.deepEqual(entries.items.map(item => item.key), names, 'Native dictionary keys in native order');
    for (const item of entries.items) assert.equal(item.oid, pets.get(item.key).oid);
    const groups = [['Atlas', 'Bubbles', 'Clover'], ['Daisy', 'Echo', 'Finn']];
    for (const group of groups) {
      for (let index = 0; index < group.length; index++)
        assert.equal(property(pets.get(group[index]), 'bestFriend').oid, pets.get(group[(index + 1) % group.length]).oid,
          group[index] + ' reference cycle');
    }
    return { selection: label, databasePath: config.databasePath, readOnly: ready.readOnly,
      counts: { pets: 6, stores: 1, dictionaries: 1 }, dictionaryOid: collectionOid,
      dictionaryKeys: entries.items.map(item => item.key), referenceGroups: groups,
      store, pets: petObjects, collectionObject, entries };
  } finally {
    await client.close();
  }
}

async function main() {
  if (process.env.JADE_AUTHORIZED_EXPLORER_DEMO !== '1')
    throw Error('Explicit authorized demo verification opt-in required');
  // The seeding owner must release both bases before this script is started.
  const source = await inspect('source', 'C:/Jade2025/system');
  const working = await inspect('working', normalWorking);
  const evidence = { verifiedUtc: new Date().toISOString(), passed: true, source, working };
  fs.writeFileSync(path.join(evidenceRoot, 'readonly-verification.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, source: source.counts, working: working.counts,
    dictionaryKeys: source.dictionaryKeys, referenceGroups: source.referenceGroups }));
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { inspect };
