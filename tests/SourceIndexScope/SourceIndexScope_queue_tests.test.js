"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const {
  isIndexableSourcePath,
  queueSourceIndexScope,
} = require("../../extension/src/source-index-scope");
test("language index excludes XML/schema resources that have separate viewers", () => {
  for (const file of [
    "Fish.cls",
    "scratch.jade",
    "schemas/Pets/schemaDefinitions.sec",
  ])
    assert.equal(isIndexableSourcePath(file), true);
  for (const file of ["Fish.ddx", "Pets.scm", "applicationDefinitions.sec"])
    assert.equal(isIndexableSourcePath(file), false);
});
test("uncertain pull queues only its destination language sources and preserves nested snapshot exclusion", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-index-scope-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, "project", "src"),
    snapshot = path.join(destination, "old-copy");
  fs.mkdirSync(snapshot, { recursive: true });
  fs.writeFileSync(path.join(snapshot, ".jade-extraction"), "owned fixture");
  const uri = (file) => ({
      scheme: "file",
      fsPath: file,
      toString: () => "file:///" + file,
    }),
    uris = [
      uri(path.join(destination, "Fish.cls")),
      uri(path.join(destination, "Fish.ddx")),
      uri(path.join(root, "other-project", "Cow.cls")),
      uri(path.join(snapshot, "Fish.cls")),
    ],
    queued = [];
  let calls = 0;
  const vscode = {
    Uri: { file: uri },
    RelativePattern: class {
      constructor(base, pattern) {
        assert.equal(base.fsPath, destination);
        assert.match(pattern, /cls/);
      }
    },
    workspace: {
      getWorkspaceFolder: () => ({ uri: uri(path.join(root, "project")) }),
      findFiles: async () => {
        calls++;
        return uris;
      },
    },
  };
  assert.equal(
    await queueSourceIndexScope(
      vscode,
      { schedule: (value) => queued.push(value) },
      destination,
    ),
    1,
  );
  assert.deepEqual(queued, [uris[0].toString()]);
  assert.equal(calls, 1);
});
