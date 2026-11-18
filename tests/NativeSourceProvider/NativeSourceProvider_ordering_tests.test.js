"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { NativeSourceProvider } = require("../../extension/src/NativeSourceProvider");
const { fixture } = require("./fixtures/provider.cjs");
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 50 && !predicate(); i++) await tick(); assert.ok(predicate(), "Expected controlled native dispatch"); }
function controlled() {
  const saves = new Map(); let preparations = 0;
  const f = fixture({ reply: (command, request) => {
    if (command === "source.semantic.prepare" && ++preparations > 1) return { passed: true, code: 0, body: { ...f.snapshot, generation: "observed-later", snapshotHash: f.hash("observed-later") } };
    if (command === "source.semantic.read" && request.entityId === "other") return { passed: true, code: 0, body: document("other") };
    if (command === "source.semantic.applyEdit") return new Promise(resolve => saves.set(request.entityId, { resolve, request }));
  } });
  function document(id) {
    const doc = structuredClone(f.document);
    if (id === "other") { doc.entityId = id; doc.documentId = "other-document"; doc.origin.uri = "file:///C:/project/Other.jox"; doc.projection.cacheUri = "file:///C:/project/.jade/projections/other.jade"; }
    return doc;
  }
  function finish(id, generation) {
    const { resolve, request } = saves.get(id), doc = document(id), memberHash = f.hash(request.replacementText), originHash = f.hash(id + generation);
    resolve({ passed: true, code: 0, body: { provider: "jox", projectId: f.snapshot.projectId, documentId: doc.documentId, entityId: id, saved: true,
      newRevision: { generation, originByteHash: originHash, memberHash }, origin: { ...doc.origin, originByteHash: originHash },
      projection: { ...doc.projection, text: request.replacementText, contentHash: memberHash },
      sourceSnapshot: { provider: "jox", projectId: f.snapshot.projectId, generation, snapshotHash: f.hash(generation) } } });
  }
  return { ...f, saves, finish, provider: new NativeSourceProvider({ client: f.client, config: f.config }) };
}

test("two source saves cannot publish a late older ACK over a later project descriptor", async () => {
  const f = controlled(); await f.provider.prepare();
  const a = await f.provider.read(f.document.entityId), b = await f.provider.read("other");
  const first = f.provider.applyEdit(a, "saved first", "projectionText"), second = f.provider.applyEdit(b, "saved second", "projectionText");
  await until(() => f.saves.has(a.entityId)); await tick();
  const concurrent = f.saves.has(b.entityId);
  if (concurrent) { f.finish(b.entityId, "second-accepted"); await second; }
  f.finish(a.entityId, "first-accepted"); await first;
  if (!concurrent) { await until(() => f.saves.has(b.entityId)); f.finish(b.entityId, "second-accepted"); await second; }
  assert.equal(f.provider.binding().generation, "second-accepted");
  assert.equal(concurrent, false, "Source-changing operations must settle serially per project");
  for (const { request } of f.saves.values()) assert.deepEqual(request.baseRevision, f.document.revision);
});

test("prepare waits for an in-flight saved origin before publishing the later observed snapshot", async () => {
  const f = controlled(); await f.provider.prepare(); const doc = await f.provider.read(f.document.entityId);
  const saved = f.provider.applyEdit(doc, "saved text", "projectionText");
  await until(() => f.saves.has(doc.entityId));
  const prepared = f.provider.prepare(); await tick();
  const concurrent = f.requests.filter(request => request.command === "source.semantic.prepare").length > 1;
  if (concurrent) await prepared;
  f.finish(doc.entityId, "saved-earlier"); await saved; await prepared;
  assert.equal(f.provider.binding().generation, "observed-later");
  assert.equal(concurrent, false, "Preparation must not race a source save ACK");
  assert.deepEqual(f.saves.get(doc.entityId).request.baseRevision, f.document.revision);
});
