const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { nativeProcess } = require("../extension/src/working-database"),
  { NativeDebugger } = require("../extension/src/debug-transport");
test(
  "running native Jade loop can pause, inspect, and cancel without an IDE",
  { skip: process.env.JADE_DEBUG_CONNECTED !== "1", timeout: 45000 },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_DATABASE_CONFIG ||
            process.env.JADE_TEST_CONFIG,
        ),
      ),
      directory = path.join(base, "evidence/debug-pause-feature");
    fs.mkdirSync(directory, { recursive: true });
    let output = "";
    const source =
      'jadeVersionNumber "25.0.02";\nschemaDefinition\nSJetSchema subschemaOf RootSchema partialDefinition;\ntypeHeaders\nDebugPauseProbe subclassOf Object transient;\ntypeDefinitions\nDebugPauseProbe completeDefinition\n(\njadeMethodDefinitions\n busy() : Integer;\n)\ntypeSources\nDebugPauseProbe (\njadeMethodSources\nbusy\n{\nbusy() : Integer;\nvars\n i : Integer;\nbegin\n while i < 100000000 do\n  i := i + 1;\n endwhile;\n return i;\nend;\n}\n)';
    const file = path.join(directory, "DebugPauseProbe.cls");
    fs.writeFileSync(file, source);
    const loaded = await nativeProcess(
      path.join(working.installPath, "bin/jadloadb.exe"),
      [
        "path=" + working.databasePath,
        "ini=" + working.iniPath,
        "server=singleUser",
        "schemaFile=" + file,
        "targetSchema=SJetSchema",
        "loadStyle=currentSchemaVersion",
        "dontSaveSources=false",
      ],
      working,
      (text) => (output += text),
    );
    assert.equal(loaded.success, true, output);
    const session = path.join(directory, "session.json");
    fs.writeFileSync(
      session,
      JSON.stringify({
        ...working,
        schema: "SJetSchema",
        owner: "DebugPauseProbe",
        method: "busy",
        abi: path.join(base, "extension/native/debugger-abi.json"),
      }),
    );
    const client = new NativeDebugger(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        session,
      ),
      events = [];
    client.on("message", (m) => {
      events.push(m);
      fs.writeFileSync(
        path.join(directory, "events.json"),
        JSON.stringify(events, null, 2),
      );
    });
    client.on("output", (s) => (output += s));
    const next = (name) =>
      new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            client.off("message", listener);
            client.off("failure", failure);
            client.off("close", closed);
          },
          failure = (e) => {
            cleanup();
            reject(e);
          },
          closed = () => failure(Error("Helper closed before " + name)),
          listener = (m) => {
            if (m.event === "error") failure(Error(m.message));
            else if (m.event === name) {
              cleanup();
              resolve(m);
            }
          },
          timer = setTimeout(
            () => failure(Error("No " + name + ": " + JSON.stringify(events))),
            12000,
          );
        client.on("message", listener);
        client.once("failure", failure);
        client.once("close", closed);
      });
    try {
      await next("stopped");
      await client.request("resume", { mode: 2 });
      await new Promise((r) => setTimeout(r, 80));
      const paused = next("stopped");
      paused.catch(() => {});
      await client.request("pause");
      const stopped = await paused;
      assert.equal(stopped.reason, "pause");
      const stack = await client.request("stack");
      assert.equal(stack.frames[0].method, "busy");
      const locals = await client.request("variables", { names: ["i"] });
      assert.ok(Number(locals.variables.find((v) => v.name === "i").value) > 0);
    } finally {
      const closed = new Promise((r) => client.once("close", r));
      client.stop();
      if (client.state !== "closed") await closed;
      fs.writeFileSync(
        path.join(directory, "events.json"),
        JSON.stringify(events, null, 2),
      );
      fs.writeFileSync(path.join(directory, "output.txt"), output);
    }
  },
);
