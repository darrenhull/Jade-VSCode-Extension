"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  MethodDraftRecovery,
} = require("../../extension/src/method-draft-recovery");
test("artifact lookup reads bounded draft identity metadata without cloning source bodies", () => {
  const r = new MethodDraftRecovery({ get: () => [], update: async () => {} });
  r.records.set("x", {
    identity: { projectId: "file:///project", schema: "Pets", owner: "Fish" },
    pristine: false,
    get text() {
      assert.fail("Do not read draft source for permits");
    },
  });
  const artifact = { schema: "Pets", name: "Fish", kind: "class" };
  assert.equal(r.hasDraftForArtifact("file:///project", artifact), true);
  assert.equal(r.hasDraftForArtifact("file:///other", artifact), false);
  r.records = new Map();
  assert.equal(r.hasDraftForArtifact("file:///project", artifact), false);
});
