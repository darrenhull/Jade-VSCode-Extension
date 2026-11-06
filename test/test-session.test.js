"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { NativeTestSession } = require("../extension/src/test-session");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-test-session-")),
    working = {
      root,
      databasePath: path.join(root, "system"),
      iniPath: path.join(root, "working.ini"),
      installPath: "C:/Jade2025",
      sourceDatabasePath: "C:/source/system",
    },
    clients = [];
  const pool = new NativeTestSession({
    executable: "helper.exe",
    connect: (exe, file) => {
      const c = new EventEmitter();
      c.ready = Promise.resolve({ writableWorking: true });
      c.config = JSON.parse(fs.readFileSync(file));
      c.closed = Promise.resolve();
      c.state = "ready";
      c.calls = [];
      c.request = async (command, args) => {
        c.calls.push({ command, args });
        return { code: 0, success: true, connection: clients.length };
      };
      c.stop = async () => {
        c.stopped = true;
        c.state = "closed";
        c.emit("close", 0);
      };
      clients.push(c);
      return c;
    },
  });
  return { root, working, clients, pool };
}
test("unchanged test requests reuse a native working session and remove ephemeral startup config", async () => {
  const s = setup();
  try {
    const a = await s.pool.run(s.working, {
      schema: "Example",
      controlFile: "one.xml",
      logFile: "one.log",
    });
    await s.pool.run(s.working, {
      schema: "Example",
      controlFile: "two.xml",
      logFile: "two.log",
    });
    assert.equal(s.clients.length, 1);
    assert.equal(s.clients[0].calls.length, 2);
    assert.equal(a.success, true);
    assert.deepEqual(fs.readdirSync(path.join(s.root, "test-sessions")), []);
    assert.equal(s.clients[0].config.databasePath, s.working.databasePath);
  } finally {
    await s.pool.release();
  }
});
test("explicit handoff waits for native shutdown, while schemas share the RootSchema working connection", async () => {
  const s = setup();
  try {
    await s.pool.run(s.working, { schema: "One" });
    let released = false;
    s.clients[0].stop = async () => {
      await new Promise((r) => setTimeout(r, 10));
      released = true;
      s.clients[0].state = "closed";
    };
    await s.pool.release();
    assert.equal(released, true);
    await s.pool.run(s.working, { schema: "One" });
    assert.equal(s.clients.length, 2);
    await s.pool.run(s.working, { schema: "Two" });
    assert.equal(s.clients[1].stopped, undefined);
    assert.equal(s.clients.length, 2);
    assert.equal(s.clients[1].config.schema, "RootSchema");
  } finally {
    await s.pool.release();
  }
});
test("native failure discards the connection, forwards output only to the current request, and never reruns tests automatically", async () => {
  const s = setup(),
    seen = [];
  try {
    await s.pool.run(s.working, { schema: "One" }, (text) => seen.push(text));
    s.clients[0].emit("output", "old output");
    assert.deepEqual(seen, []);
    s.clients[0].request = async () => {
      s.clients[0].emit("output", "assertion output");
      throw Error("native request failed");
    };
    await assert.rejects(
      s.pool.run(s.working, { schema: "One" }, (text) => seen.push(text)),
      /native request failed/,
    );
    assert.equal(s.clients[0].stopped, true);
    assert.deepEqual(seen, ["assertion output"]);
    assert.equal(s.clients.length, 1);
    await s.pool.run(s.working, { schema: "One" });
    assert.equal(s.clients.length, 2);
  } finally {
    await s.pool.release();
  }
});
test("cancellation stops the owned native worker and waits for database release", async () => {
  const s = setup(),
    abort = new AbortController();
  try {
    await s.pool.run(s.working, { schema: "One" });
    const client = s.clients[0];
    client.request = () =>
      new Promise((resolve, reject) => {
        client.stop = async () => {
          await new Promise((r) => setTimeout(r, 10));
          client.stopped = true;
          client.state = "closed";
          reject(Error("closed"));
        };
      });
    const pending = s.pool.run(
      { ...s.working, signal: abort.signal },
      { schema: "One" },
    );
    await new Promise((r) => setImmediate(r));
    abort.abort();
    await assert.rejects(pending, /cancel/i);
    assert.equal(client.stopped, true);
  } finally {
    await s.pool.release();
  }
});
