"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { CliWorkingSession } = require("../../extension/src/cli-client");

function fixture(method) {
  const packets = [], child = new EventEmitter();
  let ended = false, kills = 0, spawns = 0;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.write = line => { packets.push(JSON.parse(line)); return true; };
  child.stdin.end = () => { ended = true; queueMicrotask(() => child.emit("close", 0, null)); };
  child.kill = () => { kills++; queueMicrotask(() => child.emit("close", 2, null)); };
  const session = new CliWorkingSession({ entry: "C:/fixture/jade-cli.exe", spawn: () => { spawns++; return child; }, shutdownTimeoutMilliseconds: 100, killTimeoutMilliseconds: 100 });
  const operation = session[method]({ databasePath: "C:/source", user: "", password: "", workingJadeGitPolicy: "disabled" },
    { destination: "C:/project", scope: "all" }, { onPermit: () => { throw Error("No workspace permission expected during closure"); } });
  const emit = packet => child.stdout.emit("data", Buffer.from(JSON.stringify(packet) + "\n"));
  emit({ id: operation.id, event: "source.started", lease: "owned-baseline", scope: "all", authoritative: false });
  return { session, packets, operation, emit, ended: () => ended, kills: () => kills, spawns: () => spawns };
}

for (const method of ["startWorkingSync", "startWorkingBaselineVerification"]) {
  for (const committed of [false, true]) {
    test(method + " drains its original " + (committed ? "committed baseline despite late cancellation refusal" : "native failure") + " before graceful owned exit", async () => {
      const f = fixture(method), connection = f.operation.request.client;
      const closing = f.session.dispose();
      assert.equal(f.session.dispose(), closing, "Closure must be idempotent");
      const cancel = f.packets.find(packet => packet.command === "source.cancel");
      assert.ok(cancel); assert.equal(cancel.lease, "owned-baseline");
      assert.equal(f.ended(), false, "EOF must wait for the authoritative terminal result");
      assert.equal(f.kills(), 0);
      assert.throws(() => f.session[method]({}, { destination: "C:/project", scope: "all" }, { onPermit: () => false }), /disposed/);
      assert.equal(f.spawns(), 1);
      f.emit({ id: cancel.id, event: "result", result: { passed: !committed, code: committed ? 2 : 0, cancelled: !committed } });
      f.emit({ id: f.operation.id, event: "source.stage", stage: "inventory", totalFiles: 0, completedFiles: 0 });
      const expected = {
        passed: committed, code: committed ? 0 : 6295, status: committed ? "completed" : "failed",
        scope: "all", version: "current", authoritative: committed, partial: false, counts: {}, completedFiles: 0,
        ...(committed ? { workingBaseline: { status: "verified", origin: "same-generation-native-extraction", scope: "all", identity: "opaque" } } : { report: { error: "Original native refusal" } }),
      };
      f.emit({ id: f.operation.id, event: "result", result: expected });
      assert.deepEqual(await f.operation.completion, expected);
      await closing;
      assert.equal(f.ended(), true); assert.equal(connection.closed, true);
      assert.equal(f.kills(), 0); assert.equal(f.session.activeSources.size, 0); assert.equal(f.session.ownedClients.size, 0);
      assert.equal(f.packets.some(packet => ["shutdown", "broker.retire"].includes(packet.command)), false);
      assert.equal(f.spawns(), 1);
    });
  }
}
