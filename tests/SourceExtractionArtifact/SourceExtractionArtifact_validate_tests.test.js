"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  os = require("node:os");
const {
  sourceArtifact,
} = require("../../extension/src/source-extraction-artifact");
const root = path.join(os.tmpdir(), "native-artifact-layout");
test("schema resource labels are bounded metadata rather than class identifier syntax", () => {
  assert.doesNotThrow(() =>
    sourceArtifact(root, "schemas/Pets/locales/en-NZ.sec", {
      schema: "Pets",
      kind: "schema",
      component: "section",
      name: "en-NZ",
    }),
  );
});
test("native resource paths stay inside their declared schema and supported formats", () => {
  for (const file of [
    "../Pets.scm",
    ".vscode/settings.json",
    "schemas/Other.scm",
    "schemas/Other/types/Fish.cls",
    "schemas/Pets/private.exe",
  ]) {
    assert.throws(
      () =>
        sourceArtifact(root, file, {
          schema: "Pets",
          kind: "class",
          component: "source",
          name: "Fish",
        }),
      /source|schema|artifact|relative/i,
    );
  }
});
test("class/interface artifacts require logical names for virtual draft protection", () => {
  assert.throws(
    () =>
      sourceArtifact(root, "schemas/Pets/types/Fish.cls", {
        schema: "Pets",
        kind: "class",
        component: "source",
      }),
    /metadata/i,
  );
});

test("full extraction accepts only the canonical native schema resource aggregate", () => {
  assert.doesNotThrow(() =>
    sourceArtifact(root, "schemas/Pets/schemaResources.ddx", {
      schema: "Pets",
      kind: "schema",
      component: "schema-resources",
    }),
  );
  assert.throws(
    () =>
      sourceArtifact(root, "schemas/Pets/types/Fish.ddx", {
        schema: "Pets",
        kind: "class",
        name: "Fish",
        component: "forms",
      }),
    /resource|metadata|layout/i,
  );
  assert.throws(
    () =>
      sourceArtifact(root, "schemas/Pets/other.ddx", {
        schema: "Pets",
        kind: "schema",
        component: "schema-resources",
      }),
    /resource|layout/i,
  );
});

test("native primitive overrides require their named source identity", () => {
  assert.doesNotThrow(() =>
    sourceArtifact(root, "schemas/CardSchema/types/String.cls", {
      schema: "CardSchema",
      name: "String",
      kind: "primitive",
      component: "source",
    }),
  );
  assert.throws(
    () =>
      sourceArtifact(root, "schemas/CardSchema/types/String.cls", {
        schema: "CardSchema",
        kind: "primitive",
        component: "source",
      }),
    /metadata/i,
  );
});
