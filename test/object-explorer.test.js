"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events"),
  { PassThrough } = require("node:stream");
const {
  InspectionSession,
  inspectionTarget,
} = require("../extension/src/object-session");
const { InspectorTransport } = require("../extension/src/object-transport");
const config = {
  installPath: "C:/Jade",
  databasePath: "C:/Jade/system",
  iniPath: "C:/Jade/system/jade.ini",
  server: "multiUser",
  schema: "Pets",
  storagePath: "C:/cache",
  workspaceRoots: ["C:/source"],
};
test("source selection preserves configured connection; working selection never creates a database", () => {
  const source = inspectionTarget(config, "source");
  assert.equal(source.server, "multiUser");
  assert.equal(source.databasePath, config.databasePath);
  assert.equal(source.readOnly, true);
  assert.throws(
    () => inspectionTarget(config, "working", { exists: () => false }),
    /Compile or run tests/,
  );
  assert.throws(() => inspectionTarget(config, "other"), /selection/);
});
function client() {
  const c = new EventEmitter();
  c.ready = Promise.resolve();
  c.closed = Promise.resolve();
  c.request = async (command, args) => ({ command, args, readOnly: true });
  c.stop = () => {
    c.stopped = true;
  };
  return c;
}
test("switching databases cancels the previous connection and drops its history and stale results", async () => {
  let resolve;
  const first = client(),
    second = client();
  first.request = () => new Promise((r) => (resolve = r));
  const session = new InspectionSession({
    connect: async (target) => (target === "working" ? first : second),
  });
  await session.connect();
  session.visit({ oid: "old" });
  const pending = session.request("object", { oid: "old" });
  await session.select("source");
  assert.equal(first.stopped, true);
  assert.equal(session.history.length, 0);
  await session.connect();
  resolve({ oid: "old", readOnly: true });
  await assert.rejects(pending, /changed|cancelled/i);
  assert.equal(
    (await session.request("object", { oid: "new" })).args.oid,
    "new",
  );
  await session.disconnect();
});
test("inspector rejects mutation operations and limits history to its current connection", async () => {
  const session = new InspectionSession({ connect: async () => client() });
  await session.connect();
  await assert.rejects(
    session.request("execute", { source: "delete all" }),
    /read.only/i,
  );
  session.visit({ oid: "a" });
  session.visit({ oid: "b" });
  assert.equal(session.back().oid, "a");
  assert.equal(session.forward().oid, "b");
  await session.disconnect();
  assert.equal(session.history.length, 0);
  await assert.rejects(session.request("object", { oid: "a" }), /connect/i);
});
function child() {
  const c = new EventEmitter();
  c.stdin = new PassThrough();
  c.stdout = new PassThrough();
  c.stderr = new PassThrough();
  c.kill = () => {
    c.killed = true;
    c.emit("close", 2);
  };
  return c;
}
test("native inspection protocol handles fragmented unicode and closes pending requests", async () => {
  const c = child(),
    transport = new InspectorTransport("helper", "session", { spawn: () => c });
  c.stdout.write(
    JSON.stringify({
      protocol: "jade-inspect/1",
      event: "ready",
      readOnly: true,
    }) + "\n",
  );
  await transport.ready;
  const waiting = transport.request("object", { oid: "test" }),
    b = Buffer.from(
      JSON.stringify({
        protocol: "jade-inspect/1",
        id: 1,
        success: true,
        body: { value: "Māori 🐟", readOnly: true },
      }) + "\n",
    );
  c.stdout.write(b.subarray(0, b.length - 5));
  c.stdout.write(b.subarray(b.length - 5));
  assert.equal((await waiting).value, "Māori 🐟");
  const pending = transport.request("catalog");
  c.emit("close", 0);
  await assert.rejects(pending, /closed/);
  assert.equal(transport.pending.size, 0);
});
test("stopping inspection is bounded and a helper missing readonly readiness is rejected", async () => {
  const c = child(),
    transport = new InspectorTransport("helper", "session", {
      spawn: () => c,
      stopTimeout: 10,
    });
  c.stdout.write(
    '{"protocol":"jade-inspect/1","event":"ready","readOnly":false}\n',
  );
  await assert.rejects(transport.ready, /read.only/);
  assert.equal(c.killed, true);
});
test("native authentication error codes survive transport startup failure", async () => {
  const c = child(),
    transport = new InspectorTransport("helper", "session", { spawn: () => c });
  c.stdout.write(
    JSON.stringify({
      protocol: "jade-inspect/1",
      event: "error",
      code: 1713,
      message: "Access denied",
    }) + "\n",
  );
  await assert.rejects(transport.ready, (error) => error.code === 1713);
});
