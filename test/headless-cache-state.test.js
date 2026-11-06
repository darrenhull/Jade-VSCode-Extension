"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { startWorking } = require("../extension/src/headless-runner"),
  { digest, targetKey, fileKey } = require("../extension/src/publish-changes");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-cls-cache-")),
    workspace = path.join(root, "source"),
    work = path.join(root, "working");
  fs.mkdirSync(workspace);
  fs.mkdirSync(work);
  const source = path.join(workspace, "Fish.cls"),
    other = path.join(workspace, "Other.cls");
  fs.writeFileSync(
    source,
    "schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object;",
  );
  fs.writeFileSync(
    other,
    "schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\nOther subclassOf Object;",
  );
  const stateFile = path.join(work, "loaded-files.json"),
    working = {
      root: work,
      databasePath: path.join(work, "system"),
      iniPath: path.join(work, "working.ini"),
    },
    config = {
      program: source,
      files: [source, other],
      workspaceRoots: [workspace],
      schema: "App",
    },
    settings = { ...config, ...working, server: "singleUser" };
  let fail = false;
  const loads = [],
    seenStates = [];
  const dependencies = {
    prepareWorkingDatabase: async () => working,
    plan: async (files, root, settings, state) =>
      files
        .map((source) => ({
          source,
          hash: digest(fs.readFileSync(source)),
          config: { ...settings, source, schema: "App" },
        }))
        .filter(
          (entry) =>
            state[targetKey(settings)]?.[fileKey(entry.config)]?.hash !==
            entry.hash,
        ),
    loadWorkingFiles: async (working, files) => {
      loads.push(files);
      seenStates.push(
        fs.existsSync(stateFile)
          ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
          : {},
      );
      return {
        success: !fail,
        code: fail ? 6023 : 0,
        results: files.map((source) => ({ source, diagnostics: [] })),
      };
    },
  };
  return {
    root,
    source,
    other,
    config,
    settings,
    stateFile,
    loads,
    seenStates,
    setFail: (value) => (fail = value),
    run: () =>
      startWorking(
        config,
        "compile",
        () => {},
        () => {},
        dependencies,
      ).completion,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
test("failed CLS-only batch invalidates prior hashes so reverting source reloads it, while retaining foreign targets", async () => {
  const s = setup();
  try {
    assert.equal((await s.run()).passed, true);
    const saved = JSON.parse(fs.readFileSync(s.stateFile, "utf8"));
    saved.foreign = { preserved: { hash: "foreign-hash" } };
    fs.writeFileSync(s.stateFile, JSON.stringify(saved));
    const original = fs.readFileSync(s.source);
    fs.appendFileSync(s.source, "\n// changed");
    s.setFail(true);
    assert.equal((await s.run()).passed, false);
    const state = JSON.parse(fs.readFileSync(s.stateFile, "utf8"));
    assert.ok(
      Object.values(state[targetKey(s.settings)]).every(
        (entry) => entry.hash === null,
      ),
    );
    assert.equal(state.foreign.preserved.hash, "foreign-hash");
    fs.writeFileSync(s.source, original);
    s.setFail(false);
    assert.equal((await s.run()).passed, true);
    assert.equal(s.loads.length, 3);
    assert.equal(s.loads[2].length, 2);
    for (const state of s.seenStates)
      assert.ok(
        Object.values(state[targetKey(s.settings)]).every(
          (entry) => entry.hash === null,
        ),
      );
  } finally {
    s.cleanup();
  }
});
test("failed new CLS loads retain pending source keys so deletion is still blocked after failure", async () => {
  const s = setup();
  try {
    await s.run();
    const fresh = path.join(path.dirname(s.source), "Fresh.cls");
    fs.writeFileSync(
      fresh,
      "schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFresh subclassOf Object;",
    );
    s.config.files.push(fresh);
    s.setFail(true);
    await s.run();
    s.config.files = s.config.files.filter((file) => file !== fresh);
    fs.unlinkSync(fresh);
    const result = await s.run();
    assert.equal(result.passed, false);
    assert.match(result.report.error, /removed or renamed/);
    assert.equal(s.loads.length, 2);
  } finally {
    s.cleanup();
  }
});
