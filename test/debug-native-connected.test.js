"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn } = require("node:child_process"),
  readline = require("node:readline");
test(
  "C++ debugger hits native breakpoint, steps and reads changing locals without IDE",
  { skip: process.env.JADE_DEBUG_CONNECTED !== "1", timeout: 30000 },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_DATABASE_CONFIG ||
            process.env.JADE_TEST_CONFIG,
        ),
      ),
      folder = fs.mkdtempSync(path.join(os.tmpdir(), "jade-debug-native-")),
      file = path.join(folder, "session.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...working,
        schema: "SJetSchema",
        owner: "NativeDebugProbe",
        method: "calculate",
        abi: path.join(base, "extension/native/debugger-abi.json"),
      }),
    );
    const child = spawn(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        [file],
        { windowsHide: true },
      ),
      events = [],
      waiters = [],
      pending = new Map();
    let seq = 0,
      stderr = "";
    child.stderr.on("data", (b) => (stderr += b));
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      events.push(message);
      if (message.id) {
        const p = pending.get(message.id);
        pending.delete(message.id);
        message.success
          ? p?.resolve(message.body)
          : p?.reject(Error(message.message));
      }
      for (const w of [...waiters])
        if (w.match(message)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(message);
        }
    });
    const next = (name) =>
      new Promise((resolve, reject) => {
        const error = events.find((e) => e.event === "error");
        if (error) return reject(Error(error.message));
        waiters.push({ match: (m) => m.event === name, resolve });
        setTimeout(
          () =>
            reject(
              Error(
                "No " + name + ": " + JSON.stringify(events) + " " + stderr,
              ),
            ),
          10000,
        ).unref();
      });
    const request = (command, args = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, command, ...args }) + "\n");
      });
    try {
      await next("ready");
      fs.unlinkSync(file);
      assert.equal(
        fs.existsSync(file),
        false,
        "Native session input must be closed before ready",
      );
      const first = await next("stopped");
      assert.equal(first.method.method, "calculate");
      const get = async () => {
        const r = await request("variables", { names: ["answer"] });
        return r.variables.find((v) => v.name === "answer")?.value;
      };
      assert.equal(await get(), "0");
      await assert.rejects(
        request("resume", { mode: 999 }),
        /supported step mode/,
      );
      await assert.rejects(
        request("variables", { names: [42] }),
        /variable name/,
      );
      await assert.rejects(
        request("breakpoints", { positions: [-1] }),
        /non-negative/,
      );
      assert.equal(await get(), "0");
      const returnPos = first.method.source.indexOf("return answer");
      const set = await request("breakpoints", { positions: [returnPos] });
      let stopped = next("stopped");
      await request("resume", { mode: 0 });
      await stopped;
      assert.equal(await get(), "40");
      stopped = next("stopped");
      await request("resume", { mode: 2 });
      const breakpoint = await stopped;
      assert.equal(await get(), "42");
      assert.equal(breakpoint.method.position, set.positions[0]);
      await request("breakpoints", { positions: [] });
      const ended = next("exited");
      await request("resume", { mode: 2 });
      const result = await ended;
      assert.equal(result.exitCode, 0);
      assert.equal(result.result.value, "42");
      await new Promise((resolve, reject) =>
        child.once("close", (code) =>
          code === 0 ? resolve() : reject(Error("Helper exit " + code)),
        ),
      );
    } finally {
      child.stdin.end();
      child.kill();
      fs.writeFileSync(
        path.join(base, "evidence/debug-native-events.json"),
        JSON.stringify({ events, stderr }, null, 2),
      );
    }
  },
);
test(
  "native debugger shuts down a paused session while stdin remains open",
  { skip: process.env.JADE_DEBUG_CONNECTED !== "1", timeout: 30000 },
  async () => {
    const { NativeDebugger } = require("../extension/src/debug-transport"),
      base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_DATABASE_CONFIG ||
            process.env.JADE_TEST_CONFIG,
        ),
      ),
      folder = fs.mkdtempSync(path.join(os.tmpdir(), "jade-debug-stop-")),
      file = path.join(folder, "session.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...working,
        schema: "SJetSchema",
        owner: "NativeDebugProbe",
        method: "calculate",
        abi: path.join(base, "extension/native/debugger-abi.json"),
      }),
    );
    const client = new NativeDebugger(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        file,
      ),
      events = [];
    client.on("message", (m) => events.push(m));
    client.on("output", (text) => events.push({ output: text }));
    try {
      await new Promise((resolve, reject) => {
        client.on("failure", reject);
        client.on("message", (m) => {
          if (m.event === "error") reject(Error(m.message));
          if (m.event === "stopped") resolve();
        });
      });
      const closed = new Promise((resolve) => client.once("close", resolve));
      client.stop();
      const code = await closed;
      fs.writeFileSync(
        path.join(base, "evidence/debug-native-stop.json"),
        JSON.stringify({ code, events }, null, 2),
      );
      assert.equal(code, 0, JSON.stringify(events));
      assert.equal(client.pending.size, 0);
      assert.equal(
        events.find((m) => m.event === "exited").result,
        null,
        "Stop must abort rather than finish the method body.",
      );
      const reopened = new NativeDebugger(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        file,
      );
      let returned;
      await new Promise((resolve, reject) => {
        reopened.on("failure", reject);
        reopened.on("message", (m) => {
          if (m.event === "error") reject(Error(m.message));
          if (m.event === "stopped")
            reopened.request("resume", { mode: 2 }).catch(reject);
          if (m.event === "exited") returned = m.result;
        });
        reopened.once("close", (code) =>
          code === 0 ? resolve() : reject(Error("Reopen exit " + code)),
        );
      });
      assert.equal(returned.value, "42");
    } finally {
      client.stop();
    }
  },
);
