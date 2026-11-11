"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { startExtract } = require("../../extension/src/extract");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-extract-phases-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, "incoming");
}
function child() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  return c;
}
test("native exit transitions to discovery and actual hashed counters before completion", async (t) => {
  const destination = fixture(t),
    c = child(),
    events = [];
  const operation = startExtract(
    { executable: "unused", databasePath: "fixture" },
    destination,
    () => {},
    () => c,
    (event) => events.push(event),
  );
  fs.writeFileSync(path.join(destination, "schemas.mul"), "native");
  fs.writeFileSync(path.join(destination, "Pets.scm"), "native");
  fs.writeFileSync(path.join(destination, "Fish.cls"), "native");
  c.emit("close", 0);
  const result = await operation.completion;
  assert.equal(result.success, true);
  assert.equal(events[0].phase, "Discovering extracted files");
  const hashed = events.filter(
    (event) => event.phase === "Hashing extracted files",
  );
  assert.equal(hashed[0].completed, 0);
  assert.equal(hashed.at(-1).completed, 3);
  assert.equal(hashed.at(-1).total, 3);
  assert.equal(hashed.at(-1).bytes, 18);
});
test("native failure never starts hashing and observer failure cannot mask native result", async (t) => {
  const destination = fixture(t),
    c = child();
  let called = 0;
  const operation = startExtract(
    { executable: "unused" },
    destination,
    () => {},
    () => c,
    () => {
      called++;
      throw Error("observer error");
    },
  );
  c.emit("close", 1049);
  const result = await operation.completion;
  assert.equal(result.code, 1049);
  assert.equal(result.success, false);
  assert.equal(called, 0);
});

test("a throwing progress observer does not fail a successful native extraction", async (t) => {
  const destination = fixture(t),
    c = child();
  const operation = startExtract(
    { executable: "unused" },
    destination,
    () => {},
    () => c,
    () => {
      throw Error("disposed progress observer");
    },
  );
  fs.writeFileSync(path.join(destination, "schemas.mul"), "native");
  fs.writeFileSync(path.join(destination, "Pets.scm"), "native");
  c.emit("close", 0);
  assert.equal((await operation.completion).success, true);
});
test("cancellation during snapshot hashing does not return a successful extraction", async (t) => {
  const destination = fixture(t),
    c = child();
  c.exitCode = 0;
  const operation = startExtract(
    { executable: "unused" },
    destination,
    () => {},
    () => c,
    (event) => {
      if (event.phase === "Hashing extracted files") operation.stop();
    },
  );
  fs.writeFileSync(path.join(destination, "schemas.mul"), "native");
  fs.writeFileSync(path.join(destination, "Pets.scm"), "native");
  c.emit("close", 0);
  const result = await operation.completion;
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
});
