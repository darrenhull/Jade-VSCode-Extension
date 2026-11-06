"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    report = path.resolve(root, "../host-report.json"),
    rows = [];
  let api;
  try {
    assert.ok(
      process.env.JADE_TEST_SEED && process.env.JADE_TEST_INI,
      "Require a private test seed.",
    );
    assert.notEqual(
      path.resolve(process.env.JADE_TEST_SEED).toLowerCase(),
      path.resolve("C:/Jade2025/system").toLowerCase(),
    );
    const settings = vscode.workspace.getConfiguration(
      "jadeNative",
      vscode.workspace.workspaceFolders[0].uri,
    );
    for (const [key, value] of Object.entries({
      installPath: "C:/Jade2025",
      databasePath: process.env.JADE_TEST_SEED,
      iniPath: process.env.JADE_TEST_INI,
    }))
      await settings.update(
        key,
        value,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    const extension = vscode.extensions.getExtension(
      "jade-local-tools.jade-native-runner-cpp-preview",
    );
    api = await extension.activate();
    const schema = "GuiPerformance" + Date.now(),
      created = await vscode.commands.executeCommand(
        "jadeNative.createSchema",
        { name: schema, parent: "RootSchema", version: "25.0.02" },
      );
    const file = path.join(created.folder, "types/GuiPerformanceTests.cls"),
      methods = ["first", "second", "third"];
    const source = `jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\nGuiPerformanceTests subclassOf JadeTestCase transient;\ntypeDefinitions\nGuiPerformanceTests completeDefinition\n(\njadeMethodDefinitions\n${[...methods, "longRunning"].map((m) => m + "() unitTest;").join("\n")}\n)\ntypeSources\nGuiPerformanceTests (\njadeMethodSources\n${methods.map((m) => m + "\n{\n" + m + "() unitTest;\nbegin\n assertEquals(42,40+2);\nend;\n}").join("\n")}\nlongRunning\n{\nlongRunning() unitTest;\nvars\n n:Integer;\nbegin\n n:=0;\n while n<1000000000 do\n n:=n+1;\n endwhile;\n assertTrue(true);\nend;\n}\n)`;
    fs.writeFileSync(file, source);
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document);
    await api.testing.discover(true);
    function record(label, start, result) {
      rows.push({
        label,
        milliseconds: Math.round(performance.now() - start),
        loadedFiles: result.report?.loaded_files,
        incremental: result.report?.incremental || false,
        passed: result.passed,
        cancelled: result.cancelled || false,
        nativeMilliseconds: result.report?.runMilliseconds,
        connection: result.report?.connection,
        nativeWorkerPid: api.nativeTests.client?.child?.pid,
        workingDatabase: result.report?.workingDatabase,
      });
      fs.writeFileSync(
        path.resolve(root, "../performance-progress.json"),
        JSON.stringify(rows, null, 2),
      );
    }
    async function measure(label, selection = methods, passed = true) {
      const start = performance.now(),
        result = await api.testing.runFile(document.uri, selection);
      record(label, start, result);
      assert.equal(result.passed, passed, JSON.stringify(result));
      return result;
    }
    async function compile(label, passed = true) {
      const start = performance.now(),
        result = await vscode.commands.executeCommand(
          "jadeNative.compileClass",
        );
      record(label, start, result);
      assert.equal(result.passed, passed, JSON.stringify(result));
      return result;
    }
    async function editFirst(statement) {
      const text = document.getText(),
        start = text.indexOf(" assertEquals("),
        end = text.indexOf("\n", start);
      assert.ok(start >= 0 && end > start);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(start), document.positionAt(end)),
        " " + statement,
      );
      assert.equal(await vscode.workspace.applyEdit(edit), true);
      assert.equal(await document.save(), true);
    }
    await measure("cold-all");
    await measure("warm-all");
    for (const m of methods) await measure("warm-single-" + m, [m]);
    await editFirst("assertEquals(43,40+3);");
    const changed = await measure("edited-single-first", ["first"]);
    assert.equal(changed.report.incremental, true);
    assert.equal(changed.report.loaded_files, 1);
    await editFirst("assertEquals(43,40+2);");
    const failed = await measure("edited-assertion-fails", ["first"], false);
    assert.equal(failed.report.tests_completed, true);
    assert.match(failed.report.results[0].message, /43/);
    await editFirst("assertEquals(42,40+2);");
    await measure("restored-single", ["first"]);
    await compile("establish-full-compile");
    await compile("unchanged-compile");
    const afterCompile = await measure("test-after-full-compile", ["first"]);
    assert.equal(afterCompile.report.loaded_files, 0);
    await editFirst("assertEquals(44,40+4);");
    const fastCompile = await compile("edited-body-compile");
    assert.equal(fastCompile.report.incremental, true);
    assert.equal(fastCompile.report.loaded_files, 1);
    await measure("test-after-edited-compile", ["first"]);
    const cts = new vscode.CancellationTokenSource(),
      started = performance.now(),
      pending = vscode.commands.executeCommand(
        "jadeNative.executeLocalTests",
        document.uri,
        ["longRunning"],
        cts.token,
      );
    for (let i = 0; i < 400 && !api.nativeTests.running; i++)
      await new Promise((r) => setTimeout(r, 25));
    assert.equal(api.nativeTests.running, true);
    await new Promise((r) => setTimeout(r, 200));
    cts.cancel();
    const cancelled = await pending;
    record("cancel-running-test", started, cancelled);
    assert.equal(cancelled.cancelled, true);
    cts.dispose();
    await measure("run-after-cancellation", ["first"]);
    const objectStart = performance.now(),
      objects = await vscode.commands.executeCommand(
        "jadeNative.connectObjects",
      );
    assert.equal(objects.readOnly, true);
    assert.equal(api.nativeTests.client, undefined);
    rows.push({
      label: "object-explorer-handoff",
      milliseconds: Math.round(performance.now() - objectStart),
      passed: true,
    });
    await measure("run-after-inspection", ["first"]);
    await vscode.commands.executeCommand("jadeNative.disconnectTestRunner");
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          passed: true,
          version: extension.packageJSON.version,
          path: "normal Testing Run and F5",
          rows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    fs.writeFileSync(
      report,
      JSON.stringify({ passed: false, error: error.stack, rows }, null, 2),
    );
    throw error;
  } finally {
    await api?.nativeTests?.release();
  }
}
module.exports = { run };
