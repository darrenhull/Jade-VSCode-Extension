"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm"),
  { createRequire } = require("node:module");
const { parseSource } = require("../extension/src/source_symbols"),
  { hash } = require("../extension/src/native-project");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-scoped-body-")),
    program = path.join(root, "Tests.cls"),
    filename = path.resolve(__dirname, "../extension/src/project-runner.js"),
    localRequire = createRequire(filename),
    loaded = { exports: {} };
  let joins = 0,
    loads = 0,
    fail = false,
    body = "old",
    resource = "old",
    otherBody = "old";
  const joinedClasses = [];
  vm.runInNewContext(
    "(function(require,module){" + fs.readFileSync(filename, "utf8") + "\n})",
    { Buffer, console },
  )(
    (name) =>
      name === "./native-project-build"
        ? {
            joinProject: async (_, project) => {
              joins++;
              joinedClasses.push(
                project.schemas.flatMap((schema) =>
                  schema.classes.map((cls) => cls.owner),
                ),
              );
              return { directory: root };
            },
            loadProject: async () => ({
              success: true,
              code: 0,
              diagnostics: [],
            }),
          }
        : name === "./native-renames"
          ? { applyRenames: async () => {} }
          : name === "./working-database"
            ? {
                loadWorkingFiles: async () => {
                  loads++;
                  return { success: !fail, code: fail ? 6023 : 0, results: [] };
                },
                runNativeTests: async () => ({
                  success: true,
                  code: 0,
                  results: [],
                  tests_completed: true,
                  cleanup_complete: true,
                }),
              }
            : localRequire(name),
    loaded,
  );
  function project() {
    const text = `jadeVersionNumber "25.0.02";\nschemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\nTests subclassOf JadeTestCase transient;\ntypeDefinitions\nTests completeDefinition\n(\njadeMethodDefinitions\ncheck() unitTest;\n)\ntypeSources\nTests (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\nwrite "${body}";\nend;\n}\n)\n`;
    fs.writeFileSync(program, text);
    const entry = {
        file: program,
        owner: "Tests",
        extension: ".cls",
        text,
        hash: hash(Buffer.from(text)),
        model: parseSource(text, program),
      },
      header = {
        file: path.join(root, "App.scm"),
        hash: "header",
        text: 'jadeVersionNumber "25.0.02";',
      },
      locale = {
        file: path.join(root, "locale.sec"),
        extension: ".sec",
        hash: resource,
      };
    const otherFile = path.join(root, "Other.cls"),
      otherText = text
        .replaceAll("Tests", "Other")
        .replace('write "' + body + '"', 'write "' + otherBody + '"'),
      other = {
        file: otherFile,
        owner: "Other",
        extension: ".cls",
        text: otherText,
        hash: hash(Buffer.from(otherText)),
        model: parseSource(otherText, otherFile),
      };
    return {
      hash: entry.hash + resource + other.hash,
      schemas: [
        {
          name: "App",
          parent: "RootSchema",
          header,
          classes: [entry, other],
          entries: [entry, other, locale],
        },
      ],
      entries: [header, entry, other, locale],
      migrations: [],
    };
  }
  return {
    root,
    program,
    joinedClasses,
    otherBody: (value) => (otherBody = value),
    get joins() {
      return joins;
    },
    get loads() {
      return loads;
    },
    body: (value) => (body = value),
    resource: (value) => (resource = value),
    fail: (value) => (fail = value),
    state: () =>
      JSON.parse(
        fs.readFileSync(path.join(root, "native-project-state.json"), "utf8"),
      ),
    run: (operation = "test.run") =>
      loaded.exports.runProject(
        { program, testDependencyScope: "dependencies" },
        { root, installPath: root, databasePath: path.join(root, "system") },
        project(),
        operation,
        [program],
      ),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
test("successful scoped test loads establish a scope snapshot and later body edits bypass native joining", async () => {
  const s = setup();
  try {
    await s.run();
    assert.equal(s.state().scopeSnapshot?.scope, s.program);
    s.body("changed");
    const result = await s.run();
    assert.equal(s.joins, 1);
    assert.equal(s.loads, 1);
    assert.equal(result.report.incremental, true);
    assert.equal(s.state().fullSnapshot, undefined);
  } finally {
    s.cleanup();
  }
});
test("resource changes in a scoped test fall back to native assembly", async () => {
  const s = setup();
  try {
    await s.run();
    s.body("changed");
    s.resource("new-locale");
    const result = await s.run();
    assert.equal(s.joins, 2);
    assert.equal(s.loads, 0);
    assert.notEqual(result.report.incremental, true);
  } finally {
    s.cleanup();
  }
});
test("failed scoped partial loads invalidate the scope snapshot, so reverting source cannot skip or use it", async () => {
  const s = setup();
  try {
    await s.run();
    s.body("changed");
    s.fail(true);
    assert.equal((await s.run()).passed, false);
    assert.equal(s.state().scopeSnapshot, undefined);
    assert.deepEqual(s.state().scopes, {});
    s.body("old");
    s.fail(false);
    assert.equal((await s.run()).passed, true);
    assert.equal(s.joins, 2);
    assert.equal(s.loads, 1);
  } finally {
    s.cleanup();
  }
});
test("F5 full compilation is reused by an unchanged selected test without another native join/load", async () => {
  const s = setup();
  try {
    await s.run("compile");
    const result = await s.run();
    assert.equal(s.joins, 1);
    assert.equal(s.loads, 0);
    assert.equal(result.report.loaded_files, 0);
    assert.equal(result.passed, true);
  } finally {
    s.cleanup();
  }
});
test("a selected test body edit after full compilation can use the full snapshot native CLS fast path", async () => {
  const s = setup();
  try {
    await s.run("compile");
    s.body("test body edit");
    const result = await s.run();
    assert.equal(s.joins, 1);
    assert.equal(s.loads, 1);
    assert.equal(result.report.incremental, true);
  } finally {
    s.cleanup();
  }
});
test("an unrelated method edit after full compilation does not get loaded by the selected dependency-scoped test", async () => {
  const s = setup();
  try {
    await s.run("compile");
    s.otherBody("unrelated changed method");
    const result = await s.run();
    assert.equal(s.joins, 1);
    assert.equal(s.loads, 0);
    assert.equal(result.report.loaded_files, 0);
  } finally {
    s.cleanup();
  }
});
test("legacy cache upgrade rebuilds the selected test scope without compiling unrelated workspace classes", async () => {
  const s = setup();
  try {
    await s.run();
    const state = s.state();
    delete state.formatVersion;
    fs.writeFileSync(
      path.join(s.root, "native-project-state.json"),
      JSON.stringify(state),
    );
    s.otherBody("unrelated invalid body");
    await s.run();
    assert.equal(
      s.joins,
      2,
      "Matching legacy selected hashes must not skip the upgrade load.",
    );
    assert.deepEqual(s.joinedClasses.at(-1), ["Tests"]);
    assert.equal(s.state().formatVersion, 3);
    assert.equal(s.state().fullSnapshot, undefined);
  } finally {
    s.cleanup();
  }
});
