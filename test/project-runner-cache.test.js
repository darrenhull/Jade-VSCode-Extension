"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-runner-cache-")),
    program = path.join(root, "Tests.cls");
  fs.writeFileSync(program, "test source");
  const stateFile = path.join(root, "native-project-state.json"),
    legacyFile = path.join(root, "loaded-files.json");
  let loads = 0,
    fail = false,
    incremental = false,
    observed;
  const events = [],
    mutationStates = [];
  const exported = { exports: {} };
  const source = fs.readFileSync(
    path.join(__dirname, "../extension/src/project-runner.js"),
    "utf8",
  );
  vm.runInNewContext("(function(require,module){" + source + "\n})", {
    Buffer,
    console,
  })(
    (name) =>
      name === "./native-project"
        ? {
            hash: (bytes) =>
              crypto.createHash("sha256").update(bytes).digest("hex"),
          }
        : name === "./native-project-build"
          ? {
              joinProject: async () => ({ directory: root }),
              loadProject: async () => load("full"),
            }
          : name === "./publish-changes"
            ? {
                targetKey: () => "current-target",
                fileKey: (entry) => entry.source,
              }
            : name === "./source_symbols"
              ? {
                  parseSource: () => ({
                    schema: "App",
                    classes: [{ name: "Tests" }],
                  }),
                }
              : name === "./working-database"
                ? {
                    nativeProcess: async () => ({ success: true }),
                    runNativeTests: async () => ({ success: true, code: 0 }),
                    loadWorkingFiles: async () => load("incremental"),
                  }
                : name === "./incremental-project"
                  ? {
                      snapshotProject: (project) => {
                        if (fs.existsSync(stateFile))
                          observed = JSON.parse(
                            fs.readFileSync(stateFile, "utf8"),
                          );
                        return {
                          hash: project.hash,
                          classes: Object.fromEntries(
                            project.schemas.flatMap((schema) =>
                              schema.classes.map((cls) => [
                                schema.name + "::" + cls.owner,
                                {
                                  shape:
                                    project.hash === "A" || incremental
                                      ? "shape"
                                      : "changed-" + project.hash,
                                },
                              ]),
                            ),
                          ),
                        };
                      },
                      incrementalPlan: (project, state) => {
                        observed = JSON.parse(JSON.stringify(state));
                        return incremental && state.fullSnapshot
                          ? [project.schemas[0].classes[0]]
                          : undefined;
                      },
                    }
                  : name === "./native-renames"
                    ? { applyRenames: async () => record("rename") }
                    : name === "./native-source-inventory"
                      ? require("../extension/src/native-source-inventory")
                      : name === "./native-project-stage-lifecycle"
                        ? require("../extension/src/native-project-stage-lifecycle")
                        : require(name),
    exported,
  );
  function record(mode) {
    events.push(mode);
    mutationStates.push({
      state: JSON.parse(fs.readFileSync(stateFile, "utf8")),
      legacy: JSON.parse(fs.readFileSync(legacyFile, "utf8")),
    });
  }
  function load(mode) {
    loads++;
    record(mode);
    return {
      success: !fail,
      code: fail ? 6023 : 0,
      diagnostics: [],
      results: [],
    };
  }
  function project(version) {
    const header = { file: path.join(root, "App.scm"), hash: "header" },
      classes = [
        {
          file: program,
          owner: "Tests",
          hash: version,
          model: { code: "static body" },
        },
        {
          file: path.join(root, "Other.cls"),
          owner: "Other",
          hash: "other",
          model: { code: "static body" },
        },
      ];
    return {
      hash: version,
      schemas: [
        {
          name: "App",
          parent: "RootSchema",
          header,
          classes,
          entries: classes.map((c) => ({ ...c, extension: ".cls" })),
        },
      ],
      entries: [header, ...classes],
      migrations: [],
    };
  }
  const config = { program, testDependencyScope: "dependencies" },
    working = {
      root,
      databasePath: path.join(root, "system"),
      installPath: root,
    };
  return {
    root,
    stateFile,
    legacyFile,
    project,
    events,
    mutationStates,
    get loads() {
      return loads;
    },
    get observed() {
      return observed;
    },
    setFail: (value) => (fail = value),
    setIncremental: (value) => (incremental = value),
    run: (version, operation = "compile") =>
      exported.exports.runProject(
        config,
        working,
        project(version),
        operation,
        [program],
      ),
    state: () => JSON.parse(fs.readFileSync(stateFile, "utf8")),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
test("a successful scoped load invalidates the old full and other scoped cache before reverting a full build", async () => {
  const s = setup();
  try {
    await s.run("A");
    const state = s.state();
    state.scopes.another = "old-scope";
    fs.writeFileSync(s.stateFile, JSON.stringify(state));
    await s.run("B", "test");
    assert.equal(s.state().fullSnapshot, undefined);
    assert.deepEqual(Object.keys(s.state().scopes), [
      path.join(s.root, "Tests.cls"),
    ]);
    await s.run("A");
    assert.equal(
      s.loads,
      3,
      "Reverting to A still rebuilds because the shared database contains B.",
    );
  } finally {
    s.cleanup();
  }
});
for (const incremental of [false, true])
  test(
    "a failed " +
      (incremental ? "incremental" : "full") +
      " load cannot leave successful cache hashes that skip a reverted rebuild",
    async () => {
      const s = setup();
      try {
        await s.run("A");
        fs.writeFileSync(
          s.legacyFile,
          JSON.stringify({
            "current-target": { old: { hash: "A" } },
            unrelated: { preserved: { hash: "foreign" } },
          }),
        );
        s.setIncremental(incremental);
        s.setFail(true);
        const failed = await s.run("B");
        assert.equal(failed.passed, false);
        const invalid = s.state();
        assert.deepEqual(invalid.scopes, {});
        assert.equal(invalid.fullSnapshot, undefined);
        assert.deepEqual(invalid.schemas, ["App"]);
        assert.deepEqual(invalid.classes, ["App::Tests", "App::Other"]);
        const legacy = JSON.parse(fs.readFileSync(s.legacyFile, "utf8"));
        assert.ok(
          Object.values(legacy["current-target"]).every(
            (entry) => entry.hash === null,
          ),
        );
        assert.equal(legacy["current-target"].old.pending, true);
        assert.equal(legacy.unrelated.preserved.hash, "foreign");
        if (incremental)
          assert.equal(
            s.observed.fullSnapshot.hash,
            "A",
            "Delta must be computed from the successful snapshot before invalidation.",
          );
        s.setFail(false);
        await s.run("A");
        assert.equal(s.loads, 3);
        assert.equal(s.state().scopes.full, "A");
      } finally {
        s.cleanup();
      }
    },
  );

test("scope and legacy invalidation are durably written before every native mutation", async () => {
  const s = setup();
  try {
    await s.run("A");
    await s.run("B", "test");
    assert.ok(s.mutationStates.length >= 3);
    for (const entry of s.mutationStates) {
      assert.deepEqual(entry.state.scopes, {});
      assert.deepEqual(entry.state.nativeInputs, {});
      assert.equal(entry.state.fullSnapshot, undefined);
      assert.ok(
        Object.values(entry.legacy["current-target"]).every(
          (row) => row.hash === null,
        ),
      );
    }
    assert.equal(
      Object.values(
        JSON.parse(fs.readFileSync(s.legacyFile, "utf8"))["current-target"],
      ).filter((entry) => entry.hash !== null).length,
      1,
      "A successful scoped load only re-establishes its successfully loaded class hashes.",
    );
  } finally {
    s.cleanup();
  }
});
test("legacy same-hash project claims are rebuilt once on format upgrade, then a verified warm build is reused", async () => {
  const s = setup();
  try {
    fs.writeFileSync(
      s.stateFile,
      JSON.stringify({
        scopes: { full: "A" },
        fullSnapshot: { hash: "A" },
        scopeSnapshot: { scope: "old", snapshot: { hash: "old" } },
        schemas: ["App"],
        classes: ["App::Tests", "App::Other"],
      }),
    );
    await s.run("A");
    assert.equal(
      s.loads,
      1,
      "Legacy same-hash claims must not skip the migration build.",
    );
    assert.equal(s.state().formatVersion, 3);
    assert.equal(s.state().scopeSnapshot, undefined);
    await s.run("A");
    assert.equal(
      s.loads,
      1,
      "The new successful format3 baseline should avoid a second load.",
    );
    assert.deepEqual(s.state().schemas, ["App"]);
  } finally {
    s.cleanup();
  }
});
