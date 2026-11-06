"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  readline = require("node:readline");
test(
  "persistent native runner repeats native lifecycle without reopening database",
  { skip: process.env.JADE_WARM_TEST_CONNECTED !== "1", timeout: 60000 },
  async () => {
    const root = path.resolve(__dirname, ".."),
      config = path.resolve(
        root,
        "../debugger-experiment/feature-working-database/working.json",
      ),
      child = spawn(
        path.join(root, "test-runner/build/warm-test-probe.exe"),
        [config],
        { windowsHide: true },
      ),
      pending = new Map(),
      events = [];
    let serial = 0,
      errors = "";
    child.stderr.on("data", (s) => (errors += s));
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      events.push(m);
      if (m.id) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p?.reject(Error(m.error)) : p?.resolve(m);
      }
    });
    const request = (command) =>
      new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ ...command, id }) + "\n");
      });
    try {
      for (let i = 0; i < 3; i++) {
        const result = await request({
          command: "run",
          tests: [{ class: "DebugLifecycleProbe", method: "proof" }],
        });
        assert.equal(result.failures, 1);
        assert.equal(result.connection, 1);
        assert.ok(result.milliseconds >= 0);
      }
      const directory = path.join(root, "evidence/warm-native-test-reports");
      fs.mkdirSync(directory, { recursive: true });
      for (let i = 0; i < 2; i++) {
        const control = path.join(directory, `control-${i}.xml`),
          logFile = path.join(directory, `result-${i}.log`);
        fs.rmSync(logFile, { force: true });
        fs.writeFileSync(
          control,
          `<?xml version="1.0" encoding="utf-8"?><unitTest><reporter logFile="${logFile}"/><options logCallStack="true"/><tests><test name="WorkspaceTests"><schema name="SJetSchema"/><class name="DebugLifecycleProbe"><method name="proof"/></class></test></tests></unitTest>`,
        );
        const result = await request({ command: "runXml", control, logFile });
        assert.equal(result.connection, 1);
        assert.ok(
          fs.existsSync(logFile),
          "Native reporting must write actual report",
        );
        const bytes = fs.readFileSync(logFile),
          log =
            bytes[0] === 255 && bytes[1] === 254
              ? bytes.subarray(2).toString("utf16le")
              : bytes.toString("utf8");
        assert.match(log, /DebugLifecycleProbe/);
        assert.match(log, /total tests=1 failed=1 skipped=0 succeeded=0/);
        assert.match(log, /DebugLifecycleProbe::finalise: assertTrue/);
        assert.match(log, /Call Stack:/);
      }
      await request({ command: "close" });
      const reopened = await request({
        command: "run",
        tests: [{ class: "DebugLifecycleProbe", method: "proof" }],
      });
      assert.equal(reopened.connection, 2);
      assert.equal(reopened.failures, 1);
      fs.writeFileSync(
        path.join(root, "evidence/warm-native-test-probe.json"),
        JSON.stringify({ events, stderr: errors }, null, 2),
      );
    } finally {
      child.stdin.end();
      await new Promise((resolve) => child.once("close", resolve));
    }
  },
);
