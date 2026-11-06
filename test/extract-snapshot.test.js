"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  { EventEmitter } = require("node:events");
const { startExtract } = require("../extension/src/extract");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-extract-snapshot-")),
    destination = path.join(root, "incoming"),
    child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.kill = () => {};
  const operation = startExtract(
    {
      executable: "native-extractor",
      databasePath: "private-base",
      iniPath: "private.ini",
      server: "singleUser",
    },
    destination,
    () => {},
    () => child,
  );
  fs.writeFileSync(
    path.join(destination, "schemas.mul"),
    "#MULTIPLE_SCHEMA_EXTRACT\nPets.scm\n",
  );
  fs.writeFileSync(
    path.join(destination, "Pets.scm"),
    "schemaDefinition\nPets subschemaOf RootSchema completeDefinition;\n",
  );
  return {
    operation,
    child,
    root,
    destination,
    close() {
      child.exitCode = 0;
      child.emit("close", 0);
    },
    cleanup() {
      if (
        path.dirname(root) === path.resolve(os.tmpdir()) &&
        path.basename(root).startsWith("jade-extract-snapshot-")
      )
        fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
test("raw extraction snapshot preserves exact native bytes and stable content hashes", async () => {
  const s = setup();
  try {
    fs.mkdirSync(path.join(s.destination, "Pets"));
    const bytes = Buffer.from("\uFEFFnative source\r\n");
    fs.writeFileSync(path.join(s.destination, "Pets", "Fish.cls"), bytes);
    s.close();
    const result = await s.operation.completion;
    assert.equal(result.success, true);
    assert.equal(result.classCount, 1);
    const manifest = JSON.parse(
        fs.readFileSync(path.join(s.destination, "extract-manifest.json")),
      ),
      file = manifest.files.find((f) => f.path === "Pets/Fish.cls");
    assert.equal(file.bytes, bytes.length);
    assert.equal(
      file.sha256,
      crypto.createHash("sha256").update(bytes).digest("hex"),
    );
  } finally {
    s.cleanup();
  }
});
test("cancellation remains effective while raw source files are being hashed after native exit", async () => {
  const s = setup();
  try {
    s.close();
    s.operation.stop();
    const result = await s.operation.completion;
    assert.equal(result.success, false);
    assert.equal(result.cancelled, true);
    assert.equal(
      fs.existsSync(path.join(s.destination, "extract-manifest.json")),
      false,
    );
  } finally {
    s.cleanup();
  }
});
