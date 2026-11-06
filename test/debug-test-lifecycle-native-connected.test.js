const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { nativeProcess } = require("../extension/src/working-database"),
  { NativeDebugger } = require("../extension/src/debug-transport");
const source = `jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
DebugLifecycleProbe subclassOf JadeTestCase transient;
typeDefinitions
DebugLifecycleProbe completeDefinition
(
attributeDefinitions
 phase: Integer;
jadeMethodDefinitions
 initialise() unitTestBeforeClass, updating, protected;
 initialiseTest() unitTestBefore, updating, protected;
 finaliseTest() unitTestAfter, updating, protected;
 finalise() unitTestAfterClass, updating, protected;
 proof() unitTest;
)
typeSources
DebugLifecycleProbe (
jadeMethodSources
initialise
{
initialise() unitTestBeforeClass, updating, protected;
begin
 phase := 40;
end;
}
initialiseTest
{
initialiseTest() unitTestBefore, updating, protected;
begin
 phase := phase + 2;
end;
}
proof
{
proof() unitTest;
begin
 assertEquals(42,phase);
end;
}
finaliseTest
{
finaliseTest() unitTestAfter, updating, protected;
begin
 assertEquals(42,phase);
 phase := 43;
end;
}
finalise
{
finalise() unitTestAfterClass, updating, protected;
begin
 assertEquals(43,phase);
 assertTrue(false);
end;
}
)`;
test(
  "debugging a unitTest runs Jade native lifecycle",
  { skip: process.env.JADE_DEBUG_CONNECTED !== "1", timeout: 60000 },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_DATABASE_CONFIG ||
            process.env.JADE_TEST_CONFIG,
        ),
      ),
      directory = path.join(base, "evidence/debug-test-lifecycle");
    fs.mkdirSync(directory, { recursive: true });
    let output = "";
    const file = path.join(directory, "DebugLifecycleProbe.cls");
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
        owner: "DebugLifecycleProbe",
        method: "proof",
        unitTest: true,
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
          closed = () => failure(Error("Closed before " + name)),
          listener = (m) => {
            if (m.event === "error") failure(Error(m.message));
            else if (m.event === name) {
              cleanup();
              resolve(m);
            }
          },
          timer = setTimeout(() => failure(Error("No " + name)), 15000);
        client.on("message", listener);
        client.once("failure", failure);
        client.once("close", closed);
      });
    try {
      let stopped = await next("stopped");
      for (let i = 0; i < 60 && stopped.method.method !== "proof"; i++) {
        const stop = next("stopped");
        await client.request("resume", { mode: 0 });
        stopped = await stop;
      }
      assert.equal(stopped.method.method, "proof");
      const locals = await client.request("variables", { names: ["self"] });
      const self = locals.variables.find((v) => v.name === "self");
      const fields = await client.request("expand", {
        reference: self.variablesReference,
      });
      assert.equal(
        fields.variables.find((v) => v.name === "phase").value,
        "42",
        "Native initialise and initialiseTest must run before test body.",
      );
      const done = next("exited");
      await client.request("resume", { mode: 2 });
      const result = await done;
      assert.equal(
        result.result.value,
        "1",
        "Native finaliseTest and finalise must execute and finalise assertion must be reported.",
      );
      assert.equal(result.exitCode, 1);
    } finally {
      const closed = new Promise((r) => client.once("close", r));
      client.stop();
      if (client.state !== "closed") await closed;
      fs.writeFileSync(path.join(directory, "output.txt"), output);
    }
  },
);
