"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const file = path.resolve(__dirname, "../../test/vscode-class-workspace-ui-smoke.js");
function mode() {
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {module, require:name => name === "vscode" ? {} : name.startsWith(".") ? {} : require(name), process:{env:{}}}, {filename:file});
  return module.exports.embeddedProjectionProof;
}
test("ordinary class-workspace host smoke uses native editing, not legacy projection assertions", () => {
  assert.equal(typeof mode(), "function");
  assert.equal(mode()({}), false);
  assert.equal(mode()({JADE_CLASS_WORKSPACE_EMBEDDED_PROJECTION_PROOF:"0"}), false);
});
test("legacy projection, CRLF and recovery components require explicit opt-in", () => {
  for (const key of ["JADE_CLASS_WORKSPACE_EMBEDDED_PROJECTION_PROOF", "JADE_CLASS_WORKSPACE_CRLF_ONLY", "JADE_CLASS_WORKSPACE_RECOVERY_ONLY"]) assert.equal(mode()({[key]:"1"}), true);
});
