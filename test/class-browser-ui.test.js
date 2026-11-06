'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { ClassBrowserModel } = require('../extension/src/class-browser-model');
const { pickClass } = require('../extension/src/class-browser-ui');
function fixture() {
  const picker = { value: '', selectedItems: [], items: [], disposed: false,
    onDidChangeValue(fn) { this.change = fn; return { dispose() {} }; },
    onDidAccept(fn) { this.accept = fn; return { dispose() {} }; },
    onDidHide(fn) { this.hideEvent = fn; return { dispose() {} }; },
    show() { this.shown = true; }, dispose() { this.disposed = true; } };
  return { picker, vscode: { window: { createQuickPick: () => picker } } };
}
test('native class picker bounds every rendered result and finds last class beyond first page', async () => {
  const f = fixture(), browser = new ClassBrowserModel();
  browser.setClasses(Array.from({ length: 30000 }, (_, i) => ({ schema: 'Large', name: 'Class' + String(i).padStart(5, '0') })));
  const pending = pickClass(f.vscode, browser, { title: 'Find class' });
  assert.equal(f.picker.items.length, 100);
  assert.match(f.picker.title, /30,000/);
  f.picker.value = 'LARGE::CLASS29999'; f.picker.change(f.picker.value);
  assert.equal(f.picker.items.length, 1);
  assert.equal(f.picker.items[0].label, 'Large::Class29999');
  assert.equal(f.picker.items[0].alwaysShow, true);
  f.picker.selectedItems = [f.picker.items[0]]; f.picker.accept();
  assert.equal((await pending).name, 'Class29999');
  assert.equal(f.picker.disposed, true);
});
test('class picker schema scope and cancellation dispose without selecting an arbitrary class', async () => {
  const f = fixture(), browser = new ClassBrowserModel();
  browser.setClasses([{ schema: 'Pets', name: 'Fish' }, { schema: 'Orders', name: 'Fish' }]);
  const pending = pickClass(f.vscode, browser, { schema: 'Pets' });
  assert.equal(f.picker.items.length, 1);
  assert.equal(f.picker.items[0].row.schema, 'Pets');
  f.picker.hideEvent();
  assert.equal(await pending, undefined);
  assert.equal(f.picker.disposed, true);
});
test('class picker starts at the supplied class query instead of unrelated first-page rows', async () => {
  const f = fixture(), browser = new ClassBrowserModel();
  browser.setClasses([{ schema: 'Pets', name: 'Fish' }, { schema: 'Orders', name: 'Car' }]);
  const pending = pickClass(f.vscode, browser, { query: 'Fish' });
  assert.equal(f.picker.value, 'Fish');
  assert.equal(f.picker.items.length, 1);
  assert.equal(f.picker.items[0].row.name, 'Fish');
  f.picker.hideEvent(); await pending;
});
