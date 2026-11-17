"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { CliWorkingSession } = require("../../extension/src/cli-client");
function fixture(callbacks = {}) {
  const packets = [], child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.write = line => { packets.push(JSON.parse(line)); return true; }; child.stdin.end = () => queueMicrotask(() => child.emit("close", 0, null)); child.kill = () => {};
  const session = new CliWorkingSession({ entry: "jade-cli.exe", spawn: () => child });
  const op = session.startWorkingBaselineVerification({ databasePath: "C:/source", iniPath: "C:/source.ini", user: "", password: "", workingJadeGitPolicy: "disabled" }, { destination: "C:/example", scope: "all" }, callbacks);
  const emit = value => child.stdout.emit("data", Buffer.from(JSON.stringify(value) + "\n"));
  const id = packets[0].id;
  emit({ id, event: "source.started", lease: "owned", scope: "all", authoritative: false });
  return { packets, op, emit, id, session };
}
function complete(f, extra = {}) {
  f.emit({ id: f.id, event: "source.stage", stage: "inventory", totalFiles: 0, completedFiles: 0 });
  f.emit({ id: f.id, event: "result", result: { passed: true, code: 0, status: "completed", scope: "all", version: "current", authoritative: true, partial: false, counts: {}, completedFiles: 0,
    workingBaseline: { status: "verified", origin: "same-generation-native-extraction", scope: "all", identity: "opaque", nativeCompilationVerified: false }, ...extra } });
}
test("verification uses Working config and terminal native-private promotion", async () => {
  const f = fixture();
  assert.equal(f.packets[0].command, "working.baseline.verify");
  assert.equal(f.packets[0].promotion, "terminal");
  assert.equal(f.packets[0].config.workingJadeGitPolicy, "disabled");
  assert.equal(f.packets[0].config.user, ""); assert.equal(f.packets[0].config.password, "");
  complete(f); assert.equal((await f.op.completion).passed, true); f.session.dispose();
});
test("unexpected verification permit is refused even if a callback would approve", async () => {
  let decisions = 0;
  const f = fixture({ onPermit: () => { decisions++; return true; } });
  f.emit({ id: f.id, event: "source.permitRequired", lease: "owned", ticket: "ticket", expiresInMs: 30000, path: "schemas/Example.scm", artifact: { schema: "Example", kind: "schema", component: "section" } });
  assert.equal(decisions, 0);
  assert.equal(f.packets.some(p => p.command === "source.permit" && p.allow), false);
  assert.equal(f.packets.at(-1).command, "source.cancel");
  complete(f); const result = await f.op.completion;
  assert.equal(result.passed, false); assert.match(result.clientError, /permission|permit/i); f.session.dispose();
});
test("private file events count toward result without workspace file callbacks", async () => {
  let fileCallbacks = 0;
  const f = fixture({ onFile: () => fileCallbacks++ });
  f.emit({ id: f.id, event: "source.stage", stage: "inventory", totalFiles: 1, completedFiles: 0 });
  f.emit({ id: f.id, event: "source.file", path: "schemas/Example.scm", artifact: { schema: "Example", kind: "schema", component: "section" }, bytes: 1, sha256: "a".repeat(64), outcome: "added" });
  f.emit({ id: f.id, event: "result", result: { passed: true, code: 0, status: "completed", scope: "all", version: "current", authoritative: true, partial: false, counts: { added: 1 }, completedFiles: 1, workingBaseline: { status: "verified", origin: "same-generation-native-extraction", scope: "all", identity: "opaque" } } });
  assert.equal((await f.op.completion).passed, true);
  assert.equal(fileCallbacks, 0); f.session.dispose();
});
test("refused late source.cancel preserves authoritative native success", async () => {
  const f = fixture(); f.op.stop();
  const cancel = f.packets.at(-1);
  assert.equal(cancel.command, "source.cancel");
  f.emit({ id: cancel.id, event: "result", result: { passed: false, cancelled: false, code: 2 } });
  complete(f); assert.equal((await f.op.completion).passed, true); f.session.dispose();
});
test("verification requires native baseline provenance", async () => {
  const f = fixture(); complete(f, { workingBaseline: undefined });
  const result = await f.op.completion; assert.equal(result.passed, false); assert.match(result.clientError, /baseline.*verified/i); f.session.dispose();
});
