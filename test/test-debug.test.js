"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { registerTestDebugging } = require("../extension/src/test-debug");
function setup() {
  let factory, terminated, session, tracker;
  const disposal = { dispose() {} };
  const vscode = {
    workspace: { getWorkspaceFolder: () => ({ name: "workspace" }) },
    debug: {
      registerDebugAdapterTrackerFactory(type, value) {
        factory = value;
        return disposal;
      },
      onDidTerminateDebugSession(fn) {
        terminated = fn;
        return disposal;
      },
      async startDebugging(folder, configuration) {
        session = { id: "owned", type: configuration.type, configuration };
        tracker = factory.createDebugAdapterTracker(session);
        return true;
      },
      async stopDebugging(value) {
        assert.equal(value, session);
        terminated(session);
      },
    },
  };
  const execute = registerTestDebugging(vscode, { subscriptions: [] });
  return {
    execute,
    vscode,
    get session() {
      return session;
    },
    get tracker() {
      return tracker;
    },
    terminate: () => terminated(session),
    foreign: () => terminated({ configuration: { jadeTestRunId: "foreign" } }),
  };
}
const uri = { fsPath: "C:/tests/Test.cls" };
test("Testing debug waits for native exit and cleanup rather than treating launch as pass", async () => {
  const s = setup(),
    output = [];
  let completed = false;
  const job = s
    .execute(uri, "check", undefined, (text) => output.push(text))
    .then((result) => {
      completed = true;
      return result;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  s.foreign();
  assert.equal(completed, false);
  s.tracker.onDidSendMessage({
    type: "event",
    event: "output",
    body: { output: "native result\n" },
  });
  s.tracker.onDidSendMessage({
    type: "event",
    event: "exited",
    body: { exitCode: 0 },
  });
  assert.equal(completed, false);
  s.terminate();
  const result = await job;
  assert.equal(result.report.results[0].status, "passed");
  assert.equal(result.report.cleanup_complete, true);
  assert.deepEqual(output, ["native result\n"]);
});
test("failed native test and missing result cannot become passed tests", async () => {
  for (const code of [1, undefined]) {
    const s = setup(),
      job = s.execute(uri, "check");
    await new Promise((resolve) => setImmediate(resolve));
    if (code !== undefined)
      s.tracker.onDidSendMessage({
        type: "event",
        event: "exited",
        body: { exitCode: code },
      });
    s.terminate();
    const result = await job;
    assert.equal(result.passed, false);
    if (code === 1) assert.equal(result.report.results[0].status, "failed");
    else assert.match(result.error, /complete|result/i);
  }
});
test("cancelling a test debug run stops only its owned session and reports cancellation", async () => {
  const s = setup();
  let cancel;
  const token = {
    onCancellationRequested: (fn) => {
      cancel = fn;
      return { dispose() {} };
    },
  };
  const job = s.execute(uri, "check", token);
  await new Promise((resolve) => setImmediate(resolve));
  cancel();
  assert.equal((await job).cancelled, true);
});
test("a refused debug launch returns a clear error without waiting forever", async () => {
  const s = setup();
  s.vscode.debug.startDebugging = async () => false;
  const result = await s.execute(uri, "check");
  assert.equal(result.passed, false);
  assert.match(result.error, /start|launch/i);
});
