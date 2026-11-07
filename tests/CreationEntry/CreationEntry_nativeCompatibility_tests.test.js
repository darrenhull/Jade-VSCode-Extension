"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const manifest = require("../../extension/package.json");
const { requireNativeVersion } = require("../../scripts/NativeCompatibility.cjs");
test("the shared designer rejects a backend that omits native package resources and accepts CLI 0.4.2", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jade-creation-compat-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "distribution.json"), JSON.stringify({ packageVersion: "0.4.1" }));
  assert.throws(() => requireNativeVersion(directory, manifest.jadeNative.minimumCliVersion), /requires.*0\.4\.2/i);
  fs.writeFileSync(path.join(directory, "distribution.json"), JSON.stringify({ packageVersion: "0.4.2" }));
  assert.equal(requireNativeVersion(directory, manifest.jadeNative.minimumCliVersion), "0.4.2");
});
