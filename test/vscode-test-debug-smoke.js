"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    report = path.resolve(root, "../host-report.json");
  let tracker;
  try {
    const file = path.join(root, "VsCodeLifecycleTest.cls");
    const source = `jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
VsCodeLifecycleTest subclassOf JadeTestCase transient;
typeDefinitions
VsCodeLifecycleTest completeDefinition
(
attributeDefinitions
 phase: Integer;
jadeMethodDefinitions
 beforeTest() unitTestBefore, updating;
 afterTest() unitTestAfter, updating;
 check() unitTest;
)
typeSources
VsCodeLifecycleTest (
jadeMethodSources
beforeTest
{
beforeTest() unitTestBefore, updating;
begin
 phase := 42;
end;
}
afterTest
{
afterTest() unitTestAfter, updating;
begin
 assertEquals(42,phase);
end;
}
check
{
check() unitTest;
begin
 assertEquals(42,phase);
end;
}
)`;
    fs.writeFileSync(file, source);
    const settings = vscode.workspace.getConfiguration(
      "jadeNative",
      vscode.workspace.workspaceFolders[0].uri,
    );
    for (const [name, value] of Object.entries({
      installPath: "C:/Jade2025",
      databasePath: process.env.JADE_TEST_SEED,
      iniPath: process.env.JADE_TEST_INI,
    }))
      if (value)
        await settings.update(
          name,
          value,
          vscode.ConfigurationTarget.WorkspaceFolder,
        );
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    const extension = vscode.extensions.getExtension(
        "jade-local-tools.jade-native-runner-cpp-preview",
      ),
      api = await extension.activate();
    await api.testing.discover(true);
    const events = [];
    let resumed = 0;
    tracker = vscode.debug.registerDebugAdapterTrackerFactory(
      "jade-native-experimental",
      {
        createDebugAdapterTracker: (session) => ({
          onDidSendMessage: (message) => {
            events.push(message);
            if (message.type === "event" && message.event === "stopped") {
              resumed++;
              void session.customRequest("continue", { threadId: 1 });
            }
          },
        }),
      },
    );
    const result = await api.testing.debugFile(doc.uri, "check");
    assert.equal(
      result.passed,
      true,
      JSON.stringify({ result, events: events.slice(-8) }),
    );
    assert.equal(result.report.cleanup_complete, true);
    assert.ok(resumed > 0);
    assert.equal(events.find((e) => e.event === "exited").body.exitCode, 0);
    // Prove teardown failure affects the actual Test Explorer debugging result.
    const offset = doc.getText().indexOf("assertEquals(42,phase);"),
      edit = new vscode.WorkspaceEdit();
    edit.replace(
      doc.uri,
      new vscode.Range(
        doc.positionAt(offset),
        doc.positionAt(offset + "assertEquals(42,phase);".length),
      ),
      "assertEquals(99,phase);",
    );
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    await doc.save();
    const failed = await api.testing.debugFile(doc.uri, "check");
    assert.equal(failed.passed, false);
    assert.equal(failed.report.results[0].status, "failed");
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          passed: true,
          version: extension.packageJSON.version,
          testingDebugProfile: true,
          nativeLifecycle: true,
          nativeResults: true,
          teardownFailure: true,
          noIDE: true,
          noPython: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    fs.writeFileSync(
      report,
      JSON.stringify({ passed: false, error: error.stack }, null, 2),
    );
    throw error;
  } finally {
    tracker?.dispose();
  }
}
module.exports = { run };
