"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { InspectionHistory } = require("../../extension/src/inspection-history");

test("history restores snapshot values, selection and scroll without rereading the database", () => {
  const history = new InspectionHistory();
  history.visit({ object: { oid: "51.1", properties: [{ value: 0 }] }, connection: { path: "one", target: "source" } });
  history.saveView({ scrollY: 312, propertiesScroll: 417, entriesScroll: 213, selection: "weight", propertiesFilter: "we" });
  history.visit({ object: { oid: "51.2" }, connection: { path: "one", target: "source" } });
  assert.equal(history.back().view.scrollY, 312);
  assert.equal(history.current().view.propertiesScroll, 417);
  assert.equal(history.current().view.entriesScroll, 213);
  assert.equal(history.current().object.properties[0].value, 0);
  assert.equal(history.forward().object.oid, "51.2");
});

test("history truncates forward navigation, refreshes same object and bounds retained snapshots", () => {
  const history = new InspectionHistory(2);
  history.visit({ object: { oid: "1" } });
  history.visit({ object: { oid: "2" } });
  history.back();
  history.visit({ object: { oid: "3" } });
  assert.equal(history.forward(), undefined);
  history.visit({ object: { oid: "4" } });
  assert.deepEqual(history.entries.map(entry => entry.object.oid), ["3", "4"]);
  history.visit({ object: { oid: "4", className: "new" } });
  assert.equal(history.entries.length, 2);
  assert.equal(history.current().object.className, "new");
});
