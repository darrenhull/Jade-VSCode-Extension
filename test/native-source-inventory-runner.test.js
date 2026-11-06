"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm"),
  { createRequire } = require("node:module");
const { parseSource } = require("../extension/src/source_symbols"),
  { hash } = require("../extension/src/native-project"),
  { canonical } = require("../extension/src/native-source-inventory");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-inventory-run-")),
    filename = path.resolve(__dirname, "../extension/src/project-runner.js"),
    localRequire = createRequire(filename),
    module = { exports: {} },
    bodies = { A: "old", B: "old", Shared: "old" };
  let resource = "ddx",
    runs = 0,
    fail = false,
    nativePass = true;
  const loads = [],
    joins = [];
  let removeB = false;
  vm.runInNewContext(
    "(function(require,module){" + fs.readFileSync(filename, "utf8") + "\n})",
    { Buffer, console },
  )(
    (name) =>
      name === "./native-project-build"
        ? {
            joinProject: async (_, project) => {
              joins.push(
                project.schemas[0].classes.map((entry) => entry.owner),
              );
              return { directory: root };
            },
            loadProject: async () => {
              loads.push({ kind: "joined" });
              return { success: !fail, code: fail ? 6023 : 0, diagnostics: [] };
            },
          }
        : name === "./working-database"
          ? {
              loadWorkingFiles: async (_, files) => {
                loads.push({ kind: "cls", files });
                const state = JSON.parse(
                  fs.readFileSync(
                    path.join(root, "native-project-state.json"),
                    "utf8",
                  ),
                );
                assert.deepEqual(state.nativeInputs, {});
                return { success: !fail, code: fail ? 6023 : 0, results: [] };
              },
              runNativeTests: async () => {
                runs++;
                return {
                  success: nativePass,
                  code: nativePass ? 0 : 1,
                  results: [],
                  tests_completed: true,
                  cleanup_complete: true,
                };
              },
            }
          : name === "./native-renames"
            ? { applyRenames: async () => {} }
            : localRequire(name),
    module,
  );
  function project() {
    const classes = Object.entries(bodies)
        .filter(([name]) => name !== "B" || !removeB)
        .map(([owner, body]) => {
          const file = path.join(root, owner + ".cls"),
            text = `schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf JadeTestCase transient;\ntypeDefinitions\n${owner} completeDefinition\n(\njadeMethodDefinitions\ncheck() unitTest;\n)\ntypeSources\n${owner} (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\nwrite "${body}";\nend;\n}\n)\n`;
          fs.writeFileSync(file, text);
          return {
            file,
            owner,
            text,
            extension: ".cls",
            hash: hash(Buffer.from(text)),
            model: parseSource(text, file),
          };
        }),
      header = { file: path.join(root, "App.scm"), hash: "header" },
      ddx = {
        file: path.join(root, "App.ddx"),
        extension: ".ddx",
        hash: resource,
      };
    return {
      hash: classes.map((entry) => entry.hash).join("") + resource,
      entries: [header, ddx, ...classes],
      schemas: [
        {
          name: "App",
          parent: "RootSchema",
          header,
          classes,
          entries: [ddx, ...classes],
        },
      ],
      migrations: [],
    };
  }
  return {
    root,
    bodies,
    loads,
    joins,
    get runs() {
      return runs;
    },
    fail: (value) => (fail = value),
    resource: (value) => (resource = value),
    nativeResult: (value) => (nativePass = value),
    removeB: () => (removeB = true),
    state: () =>
      JSON.parse(
        fs.readFileSync(path.join(root, "native-project-state.json"), "utf8"),
      ),
    run: (owner = "A", operation = "test.run") =>
      module.exports.runProject(
        {
          program: path.join(root, owner + ".cls"),
          testDependencyScope: "dependencies",
        },
        { root, installPath: root, databasePath: path.join(root, "system") },
        project(),
        operation,
        [path.join(root, owner + ".cls"), path.join(root, "Shared.cls")],
      ),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
test("A then B then A reuses installed source without reloading DDX, but executes every selected test again", async () => {
  const s = setup();
  try {
    await s.run("A");
    await s.run("A");
    await s.run("B");
    await s.run("A");
    assert.equal(s.joins.length, 2);
    assert.equal(s.runs, 4);
    s.bodies.A = "edited";
    await s.run("A");
    assert.equal(s.joins.length, 2);
    assert.equal(s.loads.at(-1).kind, "cls");
    assert.deepEqual(s.loads.at(-1).files, [path.join(s.root, "A.cls")]);
    assert.equal(s.runs, 5);
  } finally {
    s.cleanup();
  }
});
test("a changed shared dependency is loaded and a failed partial load cannot restore old input claims after source reverts", async () => {
  const s = setup();
  try {
    await s.run("A");
    await s.run("B");
    s.bodies.Shared = "changed dependency";
    await s.run("A");
    assert.equal(s.loads.at(-1).kind, "cls");
    assert.deepEqual(s.loads.at(-1).files, [path.join(s.root, "Shared.cls")]);
    s.bodies.A = "bad body";
    s.fail(true);
    assert.equal((await s.run("A")).passed, false);
    assert.deepEqual(s.state().nativeInputs, {});
    s.bodies.A = "old";
    s.fail(false);
    const before = s.joins.length;
    await s.run("A");
    assert.equal(s.joins.length, before + 1);
    assert.equal(s.runs, 4);
  } finally {
    s.cleanup();
  }
});
test("changed resources rejoin and successful full deletion removes obsolete native inventory claims", async () => {
  const s = setup();
  try {
    await s.run("A");
    s.resource("changed ddx");
    await s.run("A");
    assert.equal(s.joins.length, 2);
    await s.run("A", "compile");
    assert.ok(s.state().nativeInputs[canonical(path.join(s.root, "B.cls"))]);
    s.removeB();
    await s.run("A", "compile");
    assert.equal(
      s.state().nativeInputs[canonical(path.join(s.root, "B.cls"))],
      undefined,
    );
    assert.equal(s.state().formatVersion, 3);
  } finally {
    s.cleanup();
  }
});
test("unchanged installed source still executes native tests and reports a changed runtime outcome", async () => {
  const s = setup();
  try {
    assert.equal((await s.run("A")).passed, true);
    s.nativeResult(false);
    const failed = await s.run("A");
    assert.equal(failed.passed, false);
    assert.equal(failed.report.loaded_files, 0);
    assert.equal(s.runs, 2);
    assert.equal(s.joins.length, 1);
    assert.ok(
      Object.values(s.state().nativeInputs).every(
        (input) =>
          input.result === undefined &&
          input.status === undefined &&
          input.tests === undefined,
      ),
    );
  } finally {
    s.cleanup();
  }
});
