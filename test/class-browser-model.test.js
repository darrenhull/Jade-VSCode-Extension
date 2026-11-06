'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ClassBrowserModel } = require('../extension/src/class-browser-model');

test('class browsing keeps schema identity and searches all names case-insensitively', () => {
  const browser = new ClassBrowserModel({ scope: 'workspace' });
  browser.setClasses([{ schema: 'Orders', name: 'Fish' }, { schema: 'Pets', name: 'Fish' },
    { schema: 'Pets', name: 'Hampster' }, { schema: 'Pets', name: 'Fish' }]);
  assert.deepEqual(browser.schemas(), [{ name: 'Orders', total: 1 }, { name: 'Pets', total: 2 }]);
  assert.equal(browser.search('fIsH').total, 2);
  assert.equal(browser.search('PETS::FISH').total, 1);
  assert.equal(browser.search('hamp', { schema: 'Pets' }).items[0].name, 'Hampster');
  assert.equal(browser.search('fish', { schema: 'Orders' }).items[0].schema, 'Orders');
  assert.equal(browser.search('Pets fish').total, 1);
});

test('30,000 classes render bounded pages and full search reaches the last class', t => {
  const browser = new ClassBrowserModel({ scope: 'workspace' });
  const input = Array.from({ length: 30000 }, (_, i) => ({ schema: 'LargeSchema',
    name: 'Class' + String(i).padStart(5, '0') }));
  const start = performance.now();
  browser.setClasses(input);
  const indexedMs = performance.now() - start;
  const first = browser.page({ schema: 'LargeSchema' });
  assert.equal(first.total, 30000);
  assert.equal(first.items.length, 100);
  assert.equal(first.items[0].position, 1);
  assert.equal(first.items.at(-1).position, 100);
  assert.equal(first.label, '1–100 of 30,000 classes');
  assert.equal(first.nextOffset, 100);
  const second = browser.page({ schema: 'LargeSchema', offset: first.nextOffset });
  assert.equal(second.items[0].name, 'Class00100');
  assert.equal(second.previousOffset, 0);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.browserId)).size, 200);
  const searching = performance.now(), found = browser.search('CLASS29999');
  assert.equal(found.total, 1);
  assert.equal(found.items[0].name, 'Class29999');
  assert.ok(found.items.length <= 100);
  const position = browser.positionOf({ schema: 'LargeSchema', name: 'Class29999' });
  assert.equal(position.offset, 29900);
  assert.equal(position.position, 30000);
  assert.equal(browser.page({ schema: 'LargeSchema', offset: position.offset }).items.at(-1).browserId,
    found.items[0].browserId);
  t.diagnostic(JSON.stringify({ classes: 30000, indexMilliseconds: indexedMs,
    fullSearchMilliseconds: performance.now() - searching }));
});

test('IDs survive page/filter/reload and distinguish source database, working and workspace', () => {
  const row = { schema: 'Pets', name: 'Fish', oid: 'native-id', extra: { unchanged: true } };
  const source = new ClassBrowserModel({ scope: 'database:source' });
  source.setClasses([row]);
  const id = source.page({}).items[0].browserId;
  assert.equal(source.search('fi').items[0].browserId, id);
  source.setClasses([{ schema: 'Pets', name: 'Cat' }, row]);
  assert.equal(source.find(row).browserId, id);
  assert.equal(row.browserId, undefined, 'The input source model is not mutated');
  assert.equal(source.find(row).extra, row.extra);
  for (const scope of ['database:working', 'workspace']) {
    const other = new ClassBrowserModel({ scope }); other.setClasses([row]);
    assert.notEqual(other.find(row).browserId, id);
  }
});

test('empty queries, stale page offsets and bounds remain useful after filtering', () => {
  const browser = new ClassBrowserModel({ scope: 'workspace', pageSize: 25 });
  browser.setClasses([{ schema: 'Pets', name: 'Fish' }]);
  assert.equal(browser.page({ offset: 500 }).offset, 0);
  assert.equal(browser.page({ limit: 30000 }).limit, 100);
  assert.equal(browser.search('absent').label, '0 classes');
  assert.equal(browser.search('absent').hasMore, false);
  assert.equal(browser.search('absent').nextOffset, null);
  assert.equal(browser.positionOf({ schema: 'Pets', name: 'Missing' }), undefined);
  assert.throws(() => browser.page({ offset: -1 }), /offset/i);
  assert.throws(() => browser.page({ limit: 0 }), /limit/i);
});

test('schema/class delimiter characters cannot collide in stable identities', () => {
  const browser = new ClassBrowserModel({ scope: 'workspace' });
  browser.setClasses([{ schema: 'A::B', name: 'C' }, { schema: 'A', name: 'B::C' }]);
  assert.equal(browser.page({}).items.length, 2);
  assert.notEqual(browser.page({}).items[0].browserId, browser.page({}).items[1].browserId);
});
test('non-aligned page offsets advance without repeating the previous tail', () => {
  const browser = new ClassBrowserModel();
  browser.setClasses(Array.from({ length: 123 }, (_, i) => ({ schema: 'Pets', name: String(i).padStart(3, '0') })));
  const first = browser.page({ offset: 17 });
  const next = browser.page({ offset: first.nextOffset });
  assert.equal(next.offset, 117);
  assert.equal(next.items.length, 6);
  assert.equal(new Set([...first.items, ...next.items].map(row => row.browserId)).size, 106);
});
