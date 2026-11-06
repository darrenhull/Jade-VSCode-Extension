"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { LanguageModel } = require("../extension/src/language-model");
const { parseSource } = require("../extension/src/source_symbols");
const { ImpactModel } = require("../extension/src/impact-model");
function cls(schema, name, parent, methods, fields = "") {
  return `schemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${name} subclassOf ${parent} transient;\ntypeDefinitions\n${name} completeDefinition\n(\nattributeDefinitions\n${fields}\njadeMethodDefinitions\n${Object.keys(
    methods,
  )
    .map((n) => n + "();")
    .join(
      "\n",
    )}\n)\ntypeSources\n${name} (\njadeMethodSources\n${Object.entries(methods)
    .map(([n, body]) => `${n}\n{\n${n}();\n${body}\n}\n`)
    .join("")}\n)`;
}
function setup() {
  const project = new LanguageModel();
  const put = (uri, text) => {
    const model = parseSource(text, uri);
    project.update(model);
    return model;
  };
  const fish = put(
    "file:///odd/Fish.cls",
    cls(
      "Pets",
      "Fish",
      "Object",
      {
        feed: "begin\n self.swim(); self.swim();\nend;",
        swim: 'begin\n self.name := "swim()"; // feed()\nend;',
      },
      "name: String[30];",
    ),
  );
  const child = put(
    "file:///unrelated/Child.cls",
    cls("Pets", "SmallFish", "Fish", {
      swim: "begin\n inheritMethod();\nend;",
    }),
  );
  const other = put(
    "file:///same-name/Fish.cls",
    cls("Other", "Fish", "Object", { swim: "begin\nend;" }),
  );
  const caller = put(
    "file:///tests/Runner.cls",
    cls("Pets", "Runner", "Object", {
      run: "vars\n fish: Fish;\nbegin\n fish.feed(); fish.swim();\nend;",
    }),
  );
  return {
    project,
    put,
    fish,
    child,
    other,
    caller,
    impact: new ImpactModel(project),
  };
}
test("call hierarchy groups repeated call sites and resolves typed receivers and recursive calls", () => {
  const s = setup(),
    feed = s.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "feed");
  const outgoing = s.impact.outgoing(feed);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].symbol.name, "swim");
  assert.equal(outgoing[0].sites.length, 2);
  const incoming = s.impact.incoming(feed);
  assert.deepEqual(
    incoming.map((c) => c.symbol.name),
    ["run"],
  );
});
test("call hierarchy ignores strings, comments, declarations and unrelated same-name schemas", () => {
  const s = setup(),
    swim = s.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "swim");
  assert.deepEqual(
    s.impact
      .incoming(swim)
      .map((c) => c.symbol.owner + "::" + c.symbol.name)
      .sort(),
    ["Fish::feed", "Runner::run", "SmallFish::swim"],
  );
  assert.equal(s.impact.outgoing(swim).length, 0);
  assert.equal(
    s.impact.incoming(s.project.type("Fish", "Other").members[0]).length,
    0,
  );
});
test("inheritMethod resolves the superclass implementation and callers retain declaration identity", () => {
  const s = setup(),
    swim = s.project.type("SmallFish", "Pets").members[0],
    calls = s.impact.outgoing(swim);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].symbol.owner, "Fish");
  assert.equal(
    s.child.text.slice(calls[0].sites[0].start, calls[0].sites[0].end),
    "inheritMethod",
  );
});
test("references include property reads and writes but exclude local shadowing and optionally declarations", () => {
  const s = setup(),
    name = s.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "name");
  assert.equal(s.impact.references(name, false).length, 1);
  assert.equal(s.impact.references(name, true).length, 2);
  s.put(
    "file:///shadow.cls",
    cls("Pets", "Shadow", "Fish", {
      run: 'vars\n name: String;\nbegin\n name := "a";\nend;',
    }),
  );
  assert.equal(s.impact.references(name, false).length, 1);
});
test("implementations respect inheritance, schema identity and partial method bodies", () => {
  const s = setup(),
    swim = s.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "swim");
  assert.deepEqual(
    s.impact.implementations(swim).map((m) => m.owner),
    ["SmallFish"],
  );
  assert.deepEqual(
    s.impact.implementations(s.project.type("Fish", "Pets")).map((m) => m.name),
    ["SmallFish"],
  );
});
test("class references include type annotations and superclass uses without repeated owner headings", () => {
  const s = setup(),
    type = s.project.type("Fish", "Pets"),
    references = s.impact.references(type, false);
  assert.equal(references.length, 2);
  assert.ok(
    references.some(
      (r) =>
        r.model === s.caller &&
        s.caller.text.slice(r.start - 6, r.end).includes(": Fish"),
    ),
  );
  assert.ok(references.some((r) => r.model === s.child));
});
test("unsaved model replacement and deletion invalidate the impact graph", () => {
  const s = setup(),
    feed = s.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "feed");
  assert.equal(s.impact.incoming(feed).length, 1);
  s.put(s.caller.uri, cls("Pets", "Runner", "Object", { run: "begin\nend;" }));
  assert.equal(s.impact.incoming(feed).length, 0);
  s.project.remove(s.child.uri);
  assert.equal(
    s.impact.implementations(s.project.type("Fish", "Pets")).length,
    0,
  );
});
test("cancelled impact queries return no partial results", () => {
  const s = setup();
  assert.deepEqual(
    s.impact.incoming(s.project.type("Fish", "Pets").members[0], {
      isCancellationRequested: true,
    }),
    [],
  );
});
test("closed-file metadata is lazily hydrated for calls and references without retaining full source", async () => {
  const { SourceIndex } = require("../extension/src/workspace-index");
  const files = new Map([
    [
      "file:///Fish.cls",
      cls(
        "Pets",
        "Fish",
        "Object",
        {
          feed: "begin\n self.swim();\nend;",
          swim: 'begin\n self.name := "a";\nend;',
        },
        "name: String[30];",
      ),
    ],
    [
      "file:///Runner.cls",
      cls("Pets", "Runner", "Object", {
        run: "vars\n fish: Fish;\nbegin\n fish.feed();\nend;",
      }),
    ],
  ]);
  let reads = 0;
  const index = new SourceIndex({
    list: async () => [...files.keys()],
    read: async (uri) => {
      reads++;
      return files.get(uri);
    },
  });
  try {
    await index.ready();
    assert.equal(index.project.models.get("file:///Runner.cls").code, "");
    const impact = new ImpactModel(index.project);
    await impact.ready(index.read);
    const feed = index.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "feed");
    assert.equal(impact.incoming(feed).length, 1);
    assert.equal(impact.outgoing(feed).length, 1);
    const before = reads;
    await impact.ready(index.read);
    assert.equal(reads, before);
    const property = index.project
      .type("Fish", "Pets")
      .members.find((m) => m.name === "name");
    assert.equal(
      (await impact.referencesAsync(property, false, index.read)).length,
      1,
    );
    assert.equal(index.project.models.get("file:///Fish.cls").code, "");
    assert.ok(impact.calls.every((call) => call.model.code === ""));
  } finally {
    index.dispose();
  }
});
