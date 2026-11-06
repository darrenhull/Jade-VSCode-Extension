"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  snapshotProject,
  incrementalPlan,
} = require("../extension/src/incremental-project");
const { parseSource } = require("../extension/src/source_symbols");
const { hash } = require("../extension/src/native-project");
function fixture() {
  const text =
    'schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\nattributeDefinitions\n name: String[50];\njadeMethodDefinitions\ngetName() : String;\n)\ntypeSources\nFish (\njadeMethodSources\ngetName\n{\ngetName() : String;\nbegin\nreturn "old";\nend;\n}\n)';
  const entry = {
    file: "C:/source/Fish.cls",
    owner: "Fish",
    extension: ".cls",
    text,
    hash: hash(Buffer.from(text)),
    model: parseSource(text, "Fish.cls"),
  };
  return {
    migrations: [],
    schemas: [
      {
        name: "Pets",
        parent: "RootSchema",
        header: { file: "Pets.scm", hash: "header" },
        entries: [entry],
        classes: [entry],
      },
    ],
  };
}
function change(project, before, after) {
  const entry = project.schemas[0].classes[0];
  entry.text = entry.text.replace(before, after);
  entry.hash = hash(Buffer.from(entry.text));
  entry.model = parseSource(entry.text, entry.file);
}
test("one edited method body uses a native CLS load only after a full successful baseline", () => {
  const project = fixture(),
    state = {
      scopes: { full: "baseline" },
      fullSnapshot: snapshotProject(project),
    };
  change(project, '"old"', '"new"');
  const plan = incrementalPlan(project, state);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].owner, "Fish");
  assert.equal(incrementalPlan(project, { scopes: {} }), undefined);
});
test("metadata and literal constants, new classes, resources and migrations require native full assembly", () => {
  for (const mutate of [
    (p) => change(p, "String[50]", "String[70]"),
    (p) =>
      p.schemas[0].entries.push({
        file: "extra.ddx",
        extension: ".ddx",
        hash: "form",
      }),
    (p) => p.migrations.push({ file: "rename.jcf" }),
    (p) =>
      p.schemas[0].classes.push({
        ...p.schemas[0].classes[0],
        owner: "NewClass",
        file: "NewClass.cls",
      }),
  ]) {
    const project = fixture(),
      state = {
        scopes: { full: "baseline" },
        fullSnapshot: snapshotProject(project),
      };
    mutate(project);
    assert.equal(incrementalPlan(project, state), undefined);
  }
  const project = fixture();
  change(
    project,
    "attributeDefinitions",
    'constantDefinitions\n DefaultName: String = "old constant";\nattributeDefinitions',
  );
  const state = {
    scopes: { full: "baseline" },
    fullSnapshot: snapshotProject(project),
  };
  change(project, "old constant", "new constant");
  assert.equal(incrementalPlan(project, state), undefined);
});
test("several edited method bodies load only the edited existing classes", () => {
  const project = fixture(),
    first = project.schemas[0].classes[0],
    second = {
      ...first,
      file: "C:/source/Other.cls",
      owner: "Other",
      text: first.text.replaceAll("Fish", "Other"),
    };
  second.model = parseSource(second.text, second.file);
  second.hash = hash(Buffer.from(second.text));
  project.schemas[0].classes.push(second);
  project.schemas[0].entries.push(second);
  const state = {
    scopes: { full: "baseline" },
    fullSnapshot: snapshotProject(project),
  };
  change(project, '"old"', '"new"');
  second.text = second.text.replace('"old"', '"another"');
  second.model = parseSource(second.text, second.file);
  second.hash = hash(Buffer.from(second.text));
  assert.equal(incrementalPlan(project, state).length, 2);
});
test("a source-only method addition or signature change cannot take the body-only fast path", () => {
  const project = fixture(),
    state = {
      scopes: { full: "baseline" },
      fullSnapshot: snapshotProject(project),
    };
  change(
    project,
    "getName() : String;\nbegin",
    "getName(p: Integer) : String;\nbegin",
  );
  assert.equal(incrementalPlan(project, state), undefined);
});
test("scoped method-body edits reuse only the matching latest successful scope snapshot", () => {
  const project = fixture(),
    scope = "C:/source/FishTests.cls",
    state = {
      scopes: { [scope]: "baseline" },
      scopeSnapshot: { scope, snapshot: snapshotProject(project) },
    };
  change(project, '"old"', '"new"');
  assert.equal(incrementalPlan(project, state, scope).length, 1);
  assert.equal(
    incrementalPlan(project, state, "C:/source/OtherTests.cls"),
    undefined,
  );
  assert.equal(
    incrementalPlan(project, { ...state, scopes: {} }, scope),
    undefined,
  );
  assert.equal(
    incrementalPlan(project, state),
    undefined,
    "A scoped snapshot is not a complete workspace snapshot.",
  );
});
test("scoped declarations, resources, signatures and dependency-set changes require native assembly", () => {
  for (const mutate of [
    (p) => change(p, "String[50]", "String[80]"),
    (p) => change(p, "getName() : String", "getName(pValue : String) : String"),
    (p) =>
      p.schemas[0].entries.push({
        file: "locale.sec",
        hash: "new-resource",
        extension: ".sec",
      }),
    (p) =>
      p.schemas[0].classes.push({
        ...p.schemas[0].classes[0],
        owner: "Dependency",
        file: "Dependency.cls",
      }),
  ]) {
    const project = fixture(),
      scope = "scope",
      state = {
        scopes: { [scope]: "baseline" },
        scopeSnapshot: { scope, snapshot: snapshotProject(project) },
      };
    mutate(project);
    assert.equal(incrementalPlan(project, state, scope), undefined);
  }
});
