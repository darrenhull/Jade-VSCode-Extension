"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  { createRequire } = require("node:module");
const { parseSource } = require("../extension/src/source_symbols");
const source = (name, parent, reference = "") =>
  `schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${name} subclassOf ${parent} transient;\ntypeDefinitions\n${name} completeDefinition\n(\n)\ntypeSources\n${name} (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nvars\nvalue: ${reference || "Integer"};\nbegin\nend;\n}\n)\n`;
function fixture() {
  const root = path.resolve("dependency-snapshot-fixture"),
    program = path.join(root, "Tests.cls"),
    pet = path.join(root, "Pet.cls"),
    other = path.join(root, "Other.cls"),
    resource = path.join(root, "constantDefinitions.sec");
  const records = new Map([
    [program, source("Tests", "JadeTestCase", "Pet")],
    [pet, source("Pet", "Object")],
    [other, source("Other", "Object")],
    [resource, "constantDefinitions\nLimit: Integer = 20;"],
  ]);
  return {
    records,
    files: [program, pet, other],
    program,
    pet,
    other,
    resource,
  };
}
function planner(records) {
  const filename = path.resolve(
      __dirname,
      "../extension/src/test-dependencies.js",
    ),
    localRequire = createRequire(filename),
    module = { exports: {} },
    reads = [],
    parses = [];
  vm.runInNewContext(
    "(function(require,module){" + fs.readFileSync(filename, "utf8") + "\n})",
    { console },
  )(
    (name) =>
      name === "node:fs"
        ? {
            promises: {
              readFile: async (file) => {
                reads.push(file);
                if (!records.has(file)) throw Error("Missing " + file);
                return records.get(file);
              },
            },
          }
        : name === "./source_symbols"
          ? {
              parseSource: (text, file) => {
                parses.push(file);
                return parseSource(text, file);
              },
            }
          : localRequire(name),
    module,
  );
  return { run: module.exports.testDependencies, reads, parses };
}
test("dependency selection reuses fresh scanProject class models and native resource text without rereading or reparsing classes", async () => {
  const f = fixture(),
    p = planner(f.records),
    entries = [...f.records].map(([file, text]) => ({ file, text })),
    project = {
      entries,
      schemas: [
        {
          classes: f.files.map((file) => ({
            file,
            model: parseSource(f.records.get(file), file),
          })),
        },
      ],
    },
    resources = [
      {
        file: f.resource,
        text: f.records.get(f.resource),
        schema: "App",
        extension: ".sec",
      },
    ];
  const selected = await p.run(f.files, f.program, resources, { project });
  assert.deepEqual(new Set(selected), new Set([f.program, f.pet]));
  assert.equal(p.reads.length, 0);
  assert.deepEqual(p.parses, [f.resource]);
});
test("legacy CLS snapshot text is parsed once per file and dependency traversal performs no second disk read", async () => {
  const f = fixture(),
    p = planner(f.records),
    project = {
      schemas: [],
      entries: f.files.map((file) => ({ file, text: f.records.get(file) })),
    };
  await p.run(f.files, f.program, [], { project });
  assert.equal(p.reads.length, 0);
  assert.equal(p.parses.length, f.files.length);
  assert.equal(new Set(p.parses).size, f.files.length);
});
test("without a supplied snapshot each input is read and parsed once, with no cache retained into the next invocation", async () => {
  const f = fixture(),
    p = planner(f.records);
  assert.deepEqual(
    new Set(await p.run(f.files, f.program)),
    new Set([f.program, f.pet]),
  );
  assert.equal(p.reads.length, f.files.length);
  assert.equal(p.parses.length, f.files.length);
  f.records.set(f.program, source("Tests", "JadeTestCase", "Other"));
  assert.deepEqual(
    new Set(await p.run(f.files, f.program)),
    new Set([f.program, f.other]),
  );
  assert.equal(p.reads.length, 2 * f.files.length);
});
