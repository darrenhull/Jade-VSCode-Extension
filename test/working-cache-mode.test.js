"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  vm = require("node:vm"),
  { EventEmitter } = require("node:events"),
  { PassThrough } = require("node:stream"),
  { createRequire } = require("node:module");
test("CLS-only native loads invalidate a previous native project snapshot before starting Jade, even on failure", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-cache-mode-"));
  try {
    const stateFile = path.join(root, "native-project-state.json"),
      before = {
        scopes: { full: "A", test: "B" },
        fullSnapshot: { resources: "A" },
        schemas: ["App"],
        classes: ["App::Fish"],
      };
    fs.writeFileSync(stateFile, JSON.stringify(before));
    const source = path.join(root, "Fish.cls");
    fs.writeFileSync(
      source,
      "schemaDefinition\nApp subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object;",
    );
    const filename = path.join(
        __dirname,
        "../extension/src/working-database.js",
      ),
      localRequire = createRequire(filename),
      loaded = { exports: {} };
    let spawnState;
    vm.runInNewContext(
      "(function(require,module){" + fs.readFileSync(filename, "utf8") + "\n})",
      { Buffer, console, setTimeout, clearTimeout },
    )(
      (name) =>
        name === "node:child_process"
          ? {
              spawn: () => {
                spawnState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
                const child = new EventEmitter();
                child.stdout = new PassThrough();
                child.stderr = new PassThrough();
                setImmediate(() => child.emit("close", 6023));
                return child;
              },
            }
          : localRequire(name),
      loaded,
    );
    const result = await loaded.exports.loadWorkingFiles(
      { root, installPath: root, databasePath: path.join(root, "system") },
      [source],
    );
    assert.equal(result.success, false);
    assert.deepEqual(spawnState.scopes, {});
    assert.equal(spawnState.fullSnapshot, undefined);
    assert.deepEqual(spawnState.schemas, before.schemas);
    assert.deepEqual(spawnState.classes, before.classes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
