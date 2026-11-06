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
DebugPersistentItem subclassOf Object;
DebugPersistentProbe subclassOf Object transient;
typeDefinitions
DebugPersistentItem completeDefinition
(
attributeDefinitions
 marker: String[50];
)
DebugPersistentProbe completeDefinition
(
jadeMethodDefinitions
 writeProbe() : String;
 checkProbe() : Integer;
)
databaseDefinitions
SJetSchemaDb
(
classMapDefinitions
 DebugPersistentItem in "sjetschema";
)
typeSources
DebugPersistentProbe (
jadeMethodSources
writeProbe
{
writeProbe() : String;
vars
 item : DebugPersistentItem;
begin
 beginTransaction;
 foreach item in DebugPersistentItem.instances do
  delete item;
 endforeach;
 create item persistent;
 item.marker := "native-private-working-write";
 commitTransaction;
 return item.marker;
end;
}
checkProbe
{
checkProbe() : Integer;
vars
 item : DebugPersistentItem;
begin
 foreach item in DebugPersistentItem.instances do
  if item.marker = "native-private-working-write" then
   return 1;
  endif;
 endforeach;
 return 0;
end;
}
)`;
test(
  "debugged native transactions persist into the private working database across sessions",
  { skip: process.env.JADE_DEBUG_CONNECTED !== "1", timeout: 60000 },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_DATABASE_CONFIG ||
            process.env.JADE_TEST_CONFIG,
        ),
      ),
      directory = path.join(base, "evidence/debug-persistent-write");
    assert.notEqual(
      path.resolve(working.databasePath).toLowerCase(),
      path.resolve("C:/Jade2025/system").toLowerCase(),
    );
    fs.mkdirSync(directory, { recursive: true });
    let output = "";
    const file = path.join(directory, "DebugPersistentProbe.cls");
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
      (s) => (output += s),
    );
    assert.equal(loaded.success, true, output);
    const denied = path.join(directory, "refuse-source.json");
    fs.writeFileSync(
      denied,
      JSON.stringify({
        ...working,
        workingWrites: true,
        sourceDatabasePath: working.databasePath,
        abi: path.join(base, "extension/native/debugger-abi.json"),
      }),
    );
    let refused = "";
    const deniedResult = await nativeProcess(
      path.join(base, "extension/native/jade-debug-helper.exe"),
      [denied],
      working,
      (s) => (refused += s),
    );
    assert.equal(deniedResult.success, false);
    assert.match(refused, /never the source database/);
    assert.doesNotMatch(refused, /\"event\":\"ready\"/);
    const events = [];
    async function run(method) {
      const session = path.join(directory, method + ".json");
      fs.writeFileSync(
        session,
        JSON.stringify({
          ...working,
          workingWrites: true,
          sourceDatabasePath: "C:/Jade2025/system",
          schema: "SJetSchema",
          owner: "DebugPersistentProbe",
          method,
          abi: path.join(base, "extension/native/debugger-abi.json"),
        }),
      );
      const client = new NativeDebugger(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        session,
      );
      let returned;
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            client.stop();
            reject(Error("Native persistent proof timed out."));
          }, 18000);
          client.once("close", () => clearTimeout(timer));
          client.on("failure", reject);
          client.on("message", (m) => {
            events.push(m);
            fs.writeFileSync(
              path.join(directory, "events.json"),
              JSON.stringify(events, null, 2),
            );
            if (m.event === "error") reject(Error(m.message));
            if (m.event === "stopped")
              client.request("resume", { mode: 2 }).catch(reject);
            if (m.event === "exited") returned = m;
          });
          client.on("output", (s) => (output += s));
          client.once("close", (code) =>
            code === 0 ? resolve() : reject(Error("Native exit " + code)),
          );
        });
        return returned;
      } finally {
        const closed = new Promise((resolve) => client.once("close", resolve));
        client.stop();
        if (client.state !== "closed") await closed;
      }
    }
    try {
      const written = await run("writeProbe");
      assert.equal(written.result.value, "native-private-working-write");
      const checked = await run("checkProbe");
      assert.equal(
        checked.result.value,
        "1",
        "Native transaction must remain committed after first worker signs off.",
      );
    } finally {
      fs.writeFileSync(
        path.join(directory, "events.json"),
        JSON.stringify(events, null, 2),
      );
      fs.writeFileSync(path.join(directory, "output.txt"), output);
    }
  },
);
