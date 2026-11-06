"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  visibleRows,
  pageSummary,
  fieldText,
} = require("../extension/media/object-page");
test("page filtering and display sorting preserve native positions and never mutate cursor data", () => {
  const rows = [
      { index: 1, key: "Tank 10", type: "Fish", value: "Bubbles" },
      { index: 2, key: "Tank 2", type: "Fish", value: "Māori" },
      { index: 3, key: "Tank 2", type: "Fish", value: "Alpha" },
    ],
    before = JSON.stringify(rows);
  assert.deepEqual(
    visibleRows(rows, "", "key-asc").map((r) => r.index),
    [1, 2, 0],
  );
  assert.deepEqual(
    visibleRows(rows, "tank 2", "value-asc").map((r) => r.index),
    [2, 1],
  );
  assert.deepEqual(
    visibleRows(rows, "", "native").map((r) => r.item.index),
    [1, 2, 3],
  );
  assert.equal(JSON.stringify(rows), before);
});
test("page descriptions distinguish native position, current-page filtering and remaining entries", () => {
  assert.match(
    pageSummary({ items: [{ index: 101 }, { index: 102 }], hasMore: true }, 1),
    /101–102/,
  );
  assert.match(
    pageSummary({ items: [{ index: 101 }, { index: 102 }], hasMore: true }, 1),
    /1 of 2/,
  );
  assert.match(
    pageSummary({ items: [], hasMore: false }, 0),
    /Empty collection/,
  );
  assert.equal(fieldText({ value: null }), "null");
  assert.equal(fieldText({ value: false }), "false");
});
