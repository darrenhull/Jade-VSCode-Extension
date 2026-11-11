"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { CliWorkingSession } = require("../../extension/src/cli-client");
function fixture() {
  const packets = [],
    child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = (line) => {
    packets.push(JSON.parse(line));
    return true;
  };
  child.kill = () => {};
  const session = new CliWorkingSession({
    entry: "jade-cli.exe",
    spawn: () => child,
  });
  return {
    session,
    packets,
    emit: (value) =>
      child.stdout.emit("data", Buffer.from(JSON.stringify(value) + "\n")),
  };
}
const hash = "a".repeat(64),
  artifact = { schema: "Pets", kind: "schema", component: "section" };
function begin(f, scope = "all") {
  const id = f.packets[0].id;
  f.emit({
    id,
    event: "source.started",
    scope,
    lease: "owned",
    authoritative: false,
  });
  return id;
}
function end(
  f,
  id,
  {
    scope = "all",
    count = 1,
    counts = { added: 1 },
    passed = true,
    code = 0,
    status = "completed",
    authoritative = true,
  } = {},
) {
  f.emit({
    id,
    event: "result",
    result: {
      passed,
      code,
      status,
      scope,
      version: "current",
      authoritative,
      partial: !passed && count > 0,
      completedFiles: count,
      counts,
    },
  });
}
test("full all request needs no CLS selection and consumes native schema file permits", async () => {
  const f = fixture(),
    seen = [];
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/empty", scope: "all", version: "current" },
    {
      onPermit: (event) => {
        seen.push(event.artifact);
        return true;
      },
    },
  );
  const req = f.packets[0];
  assert.equal(req.scope, "all");
  assert.equal(req.selection, undefined);
  assert.equal(req.schemas, undefined);
  const id = begin(f);
  f.emit({
    id,
    event: "source.stage",
    stage: "inventory",
    completedFiles: 0,
    totalFiles: 1,
  });
  const item = { path: "schemas/Pets.scm", artifact };
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "header",
    expiresInMs: 30000,
    ...item,
  });
  const permit = f.packets.at(-1);
  assert.equal(permit.allow, true);
  f.emit({ id: permit.id, event: "result", result: { passed: true, code: 0 } });
  f.emit({
    id,
    event: "source.file",
    sha256: hash,
    bytes: 120,
    outcome: "added",
    ...item,
  });
  end(f, id);
  const value = await op.completion;
  assert.equal(value.passed, true);
  assert.equal(value.authoritative, true);
  assert.deepEqual(seen, [artifact]);
  f.session.dispose();
});
test("explicit schema request stays native and rejects a foreign-schema path", async () => {
  const f = fixture();
  let permitted = false;
  const op = f.session.startSourceExtraction(
    {},
    { destination: "C:/empty", scope: "schemas", schemas: ["Pets"] },
    {
      onPermit: () => {
        permitted = true;
        return true;
      },
    },
  );
  assert.deepEqual(f.packets[0].schemas, ["Pets"]);
  const id = begin(f, "schemas");
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "foreign",
    expiresInMs: 30000,
    path: "schemas/Other.scm",
    artifact: { ...artifact, schema: "Other" },
  });
  assert.equal(permitted, false);
  assert.equal(f.packets.at(-1).command, "source.cancel");
  end(f, id, {
    scope: "schemas",
    passed: false,
    code: 130,
    status: "cancelled",
    count: 0,
    counts: {},
    authoritative: false,
  });
  await op.completion;
  f.session.dispose();
});
test("empty native inventory is valid completion and does not imply deletions", async () => {
  const f = fixture(),
    op = f.session.startSourceExtraction(
      {},
      { destination: "C:/empty", scope: "all" },
      { onPermit: () => false },
    );
  const id = begin(f);
  f.emit({
    id,
    event: "source.stage",
    stage: "inventory",
    completedFiles: 0,
    totalFiles: 0,
  });
  end(f, id, { count: 0, counts: {} });
  const value = await op.completion;
  assert.equal(value.passed, true);
  assert.equal(value.completedFiles, 0);
  assert.equal(value.authoritative, true);
  f.session.dispose();
});

test("full schema DDX uses a separately permitted native aggregate resource event", async () => {
  const f = fixture(),
    op = f.session.startSourceExtraction(
      {},
      { destination: "C:/empty", scope: "all" },
      { onPermit: () => true },
    ),
    id = begin(f);
  f.emit({
    id,
    event: "source.stage",
    stage: "inventory",
    completedFiles: 0,
    totalFiles: 1,
  });
  const item = {
    path: "schemas/Pets/schemaResources.ddx",
    artifact: { schema: "Pets", kind: "schema", component: "schema-resources" },
  };
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "resources",
    expiresInMs: 30000,
    ...item,
  });
  const permit = f.packets.at(-1);
  assert.equal(permit.allow, true);
  f.emit({ id: permit.id, event: "result", result: { passed: true, code: 0 } });
  f.emit({
    id,
    event: "source.file",
    outcome: "added",
    sha256: hash,
    bytes: 40000000,
    ...item,
  });
  end(f, id);
  assert.equal((await op.completion).passed, true);
  f.session.dispose();
});

test("full native primitive override keeps its exact permit and outcome identity", async () => {
  const f = fixture(),
    op = f.session.startSourceExtraction(
      {},
      { destination: "C:/empty", scope: "all" },
      { onPermit: () => true },
    ),
    id = begin(f);
  f.emit({
    id,
    event: "source.stage",
    stage: "inventory",
    completedFiles: 0,
    totalFiles: 1,
  });
  const item = {
    path: "schemas/Pets/types/String.cls",
    artifact: { schema: "Pets", name: "String", kind: "primitive", component: "source" },
  };
  f.emit({
    id,
    event: "source.permitRequired",
    lease: "owned",
    ticket: "resources",
    expiresInMs: 30000,
    ...item,
  });
  const permit = f.packets.at(-1);
  assert.equal(permit.allow, true);
  f.emit({ id: permit.id, event: "result", result: { passed: true, code: 0 } });
  f.emit({
    id,
    event: "source.file",
    outcome: "added",
    sha256: hash,
    bytes: 1234,
    ...item,
  });
  end(f, id);
  assert.equal((await op.completion).passed, true);
  f.session.dispose();
});
