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

test("native primitive identity protects a recovered local override without reading source", () => {
  const r = new MethodDraftRecovery({ get: () => [], update: async () => {} });
  r.records.set("override", {
    identity: {
      projectId: "file:///project",
      schema: "CardSchema",
      owner: "String",
    },
    pristine: false,
    get text() {
      assert.fail("Do not read source for permits");
    },
  });
  assert.equal(
    r.hasDraftForArtifact("file:///project", {
      schema: "CardSchema",
      name: "String",
      kind: "primitive",
      component: "source",
    }),
    true,
  );
  assert.equal(
    r.hasDraftForArtifact("file:///project", {
      schema: "OtherSchema",
      name: "String",
      kind: "primitive",
      component: "source",
    }),
    false,
  );
});
