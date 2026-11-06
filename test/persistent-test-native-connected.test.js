"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { InspectorTransport } = require("../extension/src/object-transport"),
  {
    nativeProcess,
    decodeNativeText,
  } = require("../extension/src/working-database"),
  { nativeTestReport } = require("../extension/src/native-reports");
test(
  "persistent native XML tests retain detailed failures, repeat warm and release for changed source",
  { skip: process.env.JADE_WARM_TEST_CONNECTED !== "1", timeout: 90000 },
  async () => {
    const root = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          path.resolve(
            root,
            "../debugger-experiment/feature-working-database/working.json",
          ),
        ),
      ),
      directory = path.join(working.root, "runs", "persistent-session-proof"),
      source = fs.readFileSync(
        path.join(
          root,
          "evidence/debug-test-lifecycle/DebugLifecycleProbe.cls",
        ),
        "utf8",
      );
    fs.mkdirSync(directory, { recursive: true });
    const config = {
        ...working,
        schema: "SJetSchema",
        sourceDatabasePath: "C:/Jade2025/system",
      },
      session = path.join(directory, "session.json"),
      fixture = path.join(directory, "DebugLifecycleProbe.cls"),
      evidence = [];
    let transport;
    async function load(text) {
      assert.ok(!transport || transport.state === "closed");
      fs.writeFileSync(fixture, text);
      const result = await nativeProcess(
        path.join(working.installPath, "bin/jadloadb.exe"),
        [
          "path=" + working.databasePath,
          "ini=" + working.iniPath,
          "server=singleUser",
          "schemaFile=" + fixture,
          "targetSchema=SJetSchema",
          "loadStyle=currentSchemaVersion",
          "dontSaveSources=false",
        ],
        working,
        () => {},
      );
      assert.equal(result.success, true);
    }
    async function open() {
      fs.writeFileSync(session, JSON.stringify(config));
      transport = new InspectorTransport(
        path.join(root, "extension/native/jade-test-helper.exe"),
        session,
        {
          protocol: "jade-test/1",
          validateReady: (packet) => packet.workingDatabase === true,
        },
      );
      transport.on("failure", () => {});
      await transport.ready;
      fs.unlinkSync(session);
    }
    async function run(failed, index) {
      const controlFile = path.join(directory, `control-${index}.xml`),
        logFile = path.join(directory, `result-${index}.log`);
      fs.rmSync(logFile, { force: true });
      fs.writeFileSync(
        controlFile,
        `<?xml version="1.0" encoding="utf-8"?><unitTest><reporter logFile="${logFile}"/><options logCallStack="true"/><tests><test name="WorkspaceTests"><schema name="SJetSchema"/><class name="DebugLifecycleProbe"><method name="proof"/></class></test></tests></unitTest>`,
      );
      const result = await transport.request("run", {
          controlFile,
          logFile,
          testName: "WorkspaceTests",
        }),
        log = decodeNativeText(fs.readFileSync(logFile)),
        report = nativeTestReport(log, {
          schema: "SJetSchema",
          owner: "DebugLifecycleProbe",
          methods: ["proof"],
        });
      assert.equal(report.tests_completed, true);
      assert.equal(report.failures, failed ? 1 : 0);
      if (failed) {
        assert.match(log, /DebugLifecycleProbe::finalise: assertTrue/);
        assert.match(log, /Call Stack:/);
      }
      evidence.push({ result, report });
      return result;
    }
    try {
      await load(source);
      await open();
      const cold = await run(true, 0),
        warm = await run(true, 1);
      assert.ok(cold.openMilliseconds > 0);
      assert.equal(warm.openMilliseconds, 0);
      assert.equal(warm.connection, cold.connection);
      await transport.stop();
      await load(source.replace("assertTrue(false);", "assertTrue(true);"));
      await open();
      await run(false, 2);
      await transport.stop();
      await load(source);
      fs.writeFileSync(
        path.join(root, "evidence/persistent-test-native-connected.json"),
        JSON.stringify(evidence, null, 2),
      );
    } finally {
      if (transport) await transport.stop();
    }
  },
);

test(
  "persistent test helper refuses the source base and control files outside the private root",
  { skip: process.env.JADE_WARM_TEST_CONNECTED !== "1", timeout: 15000 },
  async () => {
    const root = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          path.resolve(
            root,
            "../debugger-experiment/feature-working-database/working.json",
          ),
        ),
      ),
      directory = path.join(working.root, "runs", "persistent-guard-proof");
    fs.mkdirSync(directory, { recursive: true });
    const session = path.join(directory, "session.json"),
      executable = path.join(root, "extension/native/jade-test-helper.exe"),
      options = {
        protocol: "jade-test/1",
        validateReady: (packet) => packet.workingDatabase === true,
      };
    fs.writeFileSync(
      session,
      JSON.stringify({
        ...working,
        sourceDatabasePath: working.databasePath,
        schema: "SJetSchema",
      }),
    );
    let client = new InspectorTransport(executable, session, options);
    client.on("failure", () => {});
    await assert.rejects(client.ready, /source database/);
    await client.closed;
    fs.writeFileSync(
      session,
      JSON.stringify({
        ...working,
        sourceDatabasePath: "C:/Jade2025/system",
        schema: "SJetSchema",
      }),
    );
    client = new InspectorTransport(executable, session, options);
    client.on("failure", () => {});
    await client.ready;
    await assert.rejects(
      client.request("run", {
        controlFile: path.join(root, "package.json"),
        logFile: path.join(directory, "results.log"),
      }),
      /private working root/,
    );
    await client.stop();
  },
);

test(
  "connected loader creates a class, returns native structural/method diagnostics, then runs tests without disconnecting",
  { skip: process.env.JADE_WARM_TEST_CONNECTED !== "1", timeout: 60000 },
  async () => {
    const os = require("node:os"),
      root = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          path.resolve(
            root,
            "../debugger-experiment/feature-working-database/working.json",
          ),
        ),
      ),
      directory = path.join(working.root, "runs", "persistent-load-proof"),
      assemblyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jd-native-load-"));
    fs.mkdirSync(directory, { recursive: true });
    const session = path.join(directory, "session.json"),
      file = path.join(assemblyRoot, "WarmLoadCreatedProbe.cls");
    const source = `jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
 WarmLoadCreatedProbe subclassOf Object transient;
typeDefinitions
 WarmLoadCreatedProbe completeDefinition
 (
jadeMethodDefinitions
 answer() : Integer;
 )
typeSources
WarmLoadCreatedProbe (
jadeMethodSources
answer
{
answer() : Integer;
begin
 return 42;
end;
}
)`;
    fs.writeFileSync(
      session,
      JSON.stringify({
        ...working,
        schema: "DeliberatelyNotAnExistingAnchor",
        assemblyRoot,
        sourceDatabasePath: "C:/Jade2025/system",
      }),
    );
    const client = new InspectorTransport(
      path.join(root, "extension/native/jade-test-helper.exe"),
      session,
      {
        protocol: "jade-test/1",
        validateReady: (packet) => packet.workingDatabase === true,
      },
    );
    client.on("failure", () => {});
    const evidence = [];
    async function load(text) {
      fs.writeFileSync(file, text);
      const result = await client.request("load", {
        args: [
          "schemaFile=" + file,
          "targetSchema=SJetSchema",
          "loadStyle=currentSchemaVersion",
          "dontSaveSources=false",
          "deleteMethodsIfAbsent=true",
          "deletePropertiesIfAbsent=true",
          "replayableReorg=true",
        ],
      });
      evidence.push(result);
      return result;
    }
    try {
      await client.ready;
      fs.unlinkSync(session);
      let result = await load(
        source.replace("subclassOf Object", "subclassOf MissingNativeParent"),
      );
      assert.equal(result.success, false);
      assert.notEqual(result.code, 0);
      assert.equal(result.code, 6022);
      assert.match(result.output, /Unknown class/i);
      result = await load(source);
      assert.equal(result.code, 0);
      assert.match(result.output, /Compile complete/);
      const connection = result.connection;
      result = await load(
        source.replace("return 42;", "return missingNativeVariable;"),
      );
      assert.equal(result.success, false);
      assert.equal(result.code, 8510);
      assert.match(
        result.output,
        /Compile error 6027.*WarmLoadCreatedProbe::answer.*line/i,
      );
      result = await load(source);
      assert.equal(result.code, 0);
      assert.equal(result.connection, connection);
      assert.equal(result.openMilliseconds, 0);
      const controlFile = path.join(directory, "tests.xml"),
        logFile = path.join(directory, "tests.log");
      fs.writeFileSync(
        controlFile,
        `<unitTest><reporter logFile="${logFile}"/><options logCallStack="true"/><tests><test name="WorkspaceTests"><schema name="SJetSchema"/><class name="DebugLifecycleProbe"><method name="proof"/></class></test></tests></unitTest>`,
      );
      fs.rmSync(logFile, { force: true });
      const run = await client.request("run", {
        controlFile,
        logFile,
        testName: "WorkspaceTests",
      });
      assert.equal(run.connection, connection);
      assert.equal(run.openMilliseconds, 0);
      assert.match(
        decodeNativeText(fs.readFileSync(logFile)),
        /total tests=1 failed=1/,
      );
      evidence.push(run);
      const originalFixture = fs.readFileSync(
        path.join(
          root,
          "evidence/debug-test-lifecycle/DebugLifecycleProbe.cls",
        ),
        "utf8",
      );
      assert.equal(
        (
          await load(
            originalFixture.replace("assertTrue(false);", "assertTrue(true);"),
          )
        ).code,
        0,
      );
      fs.rmSync(logFile, { force: true });
      const passing = await client.request("run", {
        controlFile,
        logFile,
        testName: "WorkspaceTests",
      });
      assert.equal(passing.connection, connection);
      assert.equal(passing.openMilliseconds, 0);
      assert.match(
        decodeNativeText(fs.readFileSync(logFile)),
        /total tests=1 failed=0 skipped=0 succeeded=1/,
      );
      evidence.push(passing);
      assert.equal((await load(originalFixture)).code, 0);
      fs.rmSync(logFile, { force: true });
      const restored = await client.request("run", {
        controlFile,
        logFile,
        testName: "WorkspaceTests",
      });
      assert.equal(restored.connection, connection);
      assert.match(
        decodeNativeText(fs.readFileSync(logFile)),
        /total tests=1 failed=1/,
      );
      evidence.push(restored);
      fs.writeFileSync(
        path.join(root, "evidence/persistent-load-native-connected.json"),
        JSON.stringify(evidence, null, 2),
      );
    } finally {
      await client.stop();
      fs.rmSync(assemblyRoot, { recursive: true, force: true });
    }
  },
);
