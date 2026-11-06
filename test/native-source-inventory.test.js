"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const {
    snapshotInputs,
    inventoryPlan,
  } = require("../extension/src/native-source-inventory"),
  { parseSource } = require("../extension/src/source_symbols"),
  { hash } = require("../extension/src/native-project");
function project(body = "old", resource = "ddx", name = "A") {
  const text = `schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${name} subclassOf Object transient;\ntypeDefinitions\n${name} completeDefinition\n(\njadeMethodDefinitions\nvalue() : String;\n)\ntypeSources\n${name} (\njadeMethodSources\nvalue\n{\nvalue() : String;\nbegin\nreturn "${body}";\nend;\n}\n)`,
    entry = {
      file: path.resolve(name + ".cls"),
      owner: name,
      extension: ".cls",
      text,
      hash: hash(Buffer.from(text)),
      model: parseSource(text, name + ".cls"),
    },
    header = { file: path.resolve("App.scm"), hash: "header" },
    ddx = { file: path.resolve("App.ddx"), hash: resource, extension: ".ddx" };
  return {
    schemas: [
      {
        name: "App",
        parent: "RootSchema",
        header,
        classes: [entry],
        entries: [entry, ddx],
      },
    ],
    migrations: [],
  };
}
test("native source inventory tracks source hashes and class shapes, not test outcomes or scope names", () => {
  const a = project(),
    b = project("old", "ddx", "B"),
    inventory = { ...snapshotInputs(a), ...snapshotInputs(b) };
  assert.equal(inventoryPlan(a, inventory).covered, true);
  const changed = project("new");
  assert.equal(inventoryPlan(changed, inventory).delta.length, 1);
  assert.equal(
    inventoryPlan(project("new", "changed"), inventory).delta,
    undefined,
  );
  assert.ok(
    Object.values(inventory).every(
      (value) => value.result === undefined && value.tests === undefined,
    ),
  );
});
test("unknown classes, changed declarations or removed resource inputs never use a body-only load", () => {
  const original = project(),
    inventory = snapshotInputs(original);
  assert.equal(
    inventoryPlan(project("old", "ddx", "NewClass"), inventory).delta,
    undefined,
  );
  const changed = project();
  const entry = changed.schemas[0].classes[0];
  entry.text = entry.text.replace(
    "value() : String",
    "value(arg : Integer) : String",
  );
  entry.hash = hash(Buffer.from(entry.text));
  entry.model = parseSource(entry.text, entry.file);
  assert.equal(inventoryPlan(changed, inventory).delta, undefined);
  const removed = project();
  removed.schemas[0].entries = removed.schemas[0].entries.filter(
    (entry) => entry.extension !== ".ddx",
  );
  const plan = inventoryPlan(removed, inventory);
  assert.equal(plan.covered, false);
  assert.equal(plan.delta, undefined);
});
