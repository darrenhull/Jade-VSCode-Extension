"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const manifest = require("../../extension/package.json");
const { requireNativeVersion } = require("../../scripts/NativeCompatibility.cjs");
test("Jade Tools rejects pre-shared-session backends and accepts its declared native minimum", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jade-creation-compat-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "distribution.json"), JSON.stringify({ packageVersion: "0.4.3" }));
  assert.throws(() => requireNativeVersion(directory, manifest.jadeNative.minimumCliVersion), error => error.message.includes("requires Jade CLI " + manifest.jadeNative.minimumCliVersion));
  fs.writeFileSync(path.join(directory, "distribution.json"), JSON.stringify({ packageVersion: manifest.jadeNative.minimumCliVersion }));
  assert.equal(requireNativeVersion(directory, manifest.jadeNative.minimumCliVersion), manifest.jadeNative.minimumCliVersion);
});
