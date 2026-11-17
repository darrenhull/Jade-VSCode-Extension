"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { NativeSourceProvider } = require("../../extension/src/NativeSourceProvider");
const { fixture, clone } = require("./fixtures/provider.cjs");
function setup(options) { const f = fixture(options); return { ...f, provider: new NativeSourceProvider({ client: f.client, config: f.config }) }; }

test("native preparation uses one semantic authority and a live-process capability", async () => {
  const f = setup(); await f.provider.prepare(); await f.provider.prepare();
  assert.equal(f.client.probes, 1);
  assert.deepEqual(f.requests.map(r => r.command), ["source.semantic.prepare", "source.semantic.prepare"]);
  assert.deepEqual(f.requests[0].body.config, f.config);
  assert.equal(f.requests[0].body.config.user, ""); assert.equal(f.requests[0].body.config.password, "");
});
test("old native runtime refuses without legacy CLS preparation", async () => {
  const f = setup({ unsupported: true }); await assert.rejects(f.provider.prepare(), /update|support/i); assert.equal(f.requests.length, 0);
});
test("query is bounded and preserves exact native project and generation", async () => {
  const f = setup(); await f.provider.prepare(); await f.provider.query({ kind: "member", parentId: "ExactType", limit: 37 });
  assert.deepEqual(f.requests.at(-1).body, { provider: "jox", projectId: "native-project-A", generation: "generation-1", kind: "member", parentId: "ExactType", offset: 0, limit: 37 });
  await assert.rejects(f.provider.query({ kind: "member", limit: 10001 }), /limit|bound/i);
});
test("foreign query binding cannot enter the UI model", async () => {
  const f = setup({ reply: (command, body) => command === "source.semantic.query" ? { passed: true, code: 0, body: { provider: "jox", projectId: "foreign", generation: "generation-1", items: [], total: 0, offset: body.offset, limit: body.limit, nextOffset: null } } : undefined });
  await f.provider.prepare(); await assert.rejects(f.provider.query({ kind: "type" }), /binding|project/i);
});
test("read returns native projection and immutable base revision without CLS parsing", async () => {
  const f = setup(); await f.provider.prepare(); const doc = await f.provider.read(f.document.entityId);
  assert.equal(doc.projection.text, f.document.projection.text); assert.deepEqual(doc.revision, f.document.revision);
  assert.deepEqual(f.requests.map(r => r.command), ["source.semantic.prepare", "source.semantic.read"]);
});
for (const invalid of ["hash", "origin", "cache", "generation"]) test("read refuses invalid " + invalid, async () => {
  const f = setup({ reply: command => {
    if (command !== "source.semantic.read") return;
    const d = clone(f.document);
    if (invalid === "hash") d.projection.contentHash = "0".repeat(64);
    if (invalid === "origin") d.origin.uri = "file:///C:/other/Type.jox";
    if (invalid === "cache") d.projection.cacheUri = "file:///C:/project/not-managed/document.jade";
    if (invalid === "generation") d.revision.generation = "foreign";
    return { passed: true, code: 0, body: d };
  } });
  await f.provider.prepare(); await assert.rejects(f.provider.read(f.document.entityId), /hash|origin|cache|generation|binding/i);
});
test("save uses the original opened revision even after background preparation", async () => {
  const f = setup(); await f.provider.prepare(); const doc = await f.provider.read(f.document.entityId);
  f.snapshot.generation = "generation-2"; await f.provider.prepare();
  const saved = await f.provider.applyEdit(doc, "value(): Integer;\nbegin\n return 2;\nend;", "methodSource");
  assert.deepEqual(f.requests.at(-1).body.baseRevision, f.document.revision);
  assert.equal(saved.revision.generation, "generation-2");
  assert.equal(doc.revision.generation, "generation-1");
});
test("stale edit keeps the original native result and never retries/rebases", async () => {
  const failed = { passed: false, code: 409, report: { error: "Saved JOX changed", reason: "stale-generation" } };
  const f = setup({ reply: command => command === "source.semantic.applyEdit" ? failed : undefined });
  await f.provider.prepare(); const doc = await f.provider.read(f.document.entityId);
  await assert.rejects(f.provider.applyEdit(doc, "new source", "methodSource"), e => e.result.code === 409 && e.message === "Saved JOX changed");
  assert.equal(f.requests.filter(r => r.command === "source.semantic.applyEdit").length, 1);
  assert.equal(doc.revision.generation, "generation-1");
});
test("unqualified editing and forged document bindings fail before native write", async () => {
  const f = setup({ flags: { projectionEdit: false } }); await f.provider.prepare(); const doc = await f.provider.read(f.document.entityId);
  await assert.rejects(f.provider.applyEdit(doc, "changed", "methodSource"), /support|read.only/i);
  await assert.rejects(f.provider.applyEdit(clone(doc), "changed", "methodSource"), /document|binding/i);
  assert.equal(f.requests.some(r => r.command === "source.semantic.applyEdit"), false);
});
test("native process replacement requires a fresh preparation, not stale snapshot reuse", async () => {
  const f = setup(); await f.provider.prepare(); f.client.client = {};
  await assert.rejects(f.provider.query({ kind: "type" }), /connection|prepare/i);
  await f.provider.prepare(); assert.equal(f.client.probes, 2);
});
test("failed capability probes retry on the same process", async () => {
  const f = setup(), probe = f.client.sourceCapabilities.bind(f.client);
  let first = true;
  f.client.sourceCapabilities = async () => { if (first) { first = false; throw Error("Probe unavailable"); } return probe(); };
  await assert.rejects(f.provider.prepare(), /Probe unavailable/);
  await f.provider.prepare(); assert.equal(f.requests.length, 1);
});
test("mutating UI revision data cannot change the native save precondition", async () => {
  const f = setup(); await f.provider.prepare(); const doc = await f.provider.read(f.document.entityId);
  doc.revision.originByteHash = "0".repeat(64); doc.entityId = "foreign";
  await f.provider.applyEdit(doc, "new source", "methodSource");
  assert.equal(f.requests.at(-1).body.entityId, f.document.entityId);
  assert.deepEqual(f.requests.at(-1).body.baseRevision, f.document.revision);
});
test("each execution prepares saved changes once then runs again with native identity", async () => {
  const result = { passed: true, code: 0, report: { tests_completed: true, cleanup_complete: true, results: [] } };
  const f = setup({ reply: command => command === "test" ? result : undefined });
  for (let i = 0; i < 2; i++) assert.deepEqual(await f.provider.execute("test", { entityIds: [f.document.entityId] }, { settings: { methods: ["value"] } }), result);
  assert.deepEqual(f.requests.map(r => r.command), ["source.semantic.prepare", "test", "source.semantic.prepare", "test"]);
  assert.deepEqual(f.requests.at(-1).body.sourceSnapshot, { provider: "jox", projectId: f.snapshot.projectId, generation: f.snapshot.generation, snapshotHash: f.snapshot.snapshotHash });
  assert.deepEqual(f.requests.at(-1).body.config.methods, ["value"]);
  assert.equal(f.requests.at(-1).body.config.password, "");
});
test("parser-only native capabilities never enable execution", async () => {
  const f = setup({ flags: { deploymentFromSavedSnapshot: false, nativeTests: false } });
  await assert.rejects(f.provider.execute("test", { entityIds: ["a"] }), /does not yet support/);
  assert.deepEqual(f.requests.map(r => r.command), ["source.semantic.prepare"]);
});
test("cancel refusal after native completion preserves authoritative success", async () => {
  let resolve, cancel;
  const terminal = new Promise(done => { resolve = done; });
  const f = setup({ reply: command => command === "test" ? terminal : command === "cancel" ? { passed: false, code: 0, cancelled: false } : undefined });
  const operation = f.provider.execute("test", { entityIds: ["a"] }, { token: { onCancellationRequested: fn => { cancel = fn; return { dispose() {} }; } } });
  while (!cancel) await new Promise(done => setImmediate(done));
  cancel(); const success = { passed: true, code: 0, report: { executed: true } }; resolve(success);
  assert.deepEqual(await operation, success);
  assert.equal(f.requests.filter(r => r.command === "cancel").length, 1);
});
