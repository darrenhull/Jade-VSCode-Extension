"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    report = path.resolve(root, "../host-report.json"),
    rows = [];
  let api;
  try {
    assert.ok(
      process.env.JADE_TEST_SEED && process.env.JADE_TEST_INI,
      "Private seed required",
    );
    assert.notEqual(
      path.resolve(process.env.JADE_TEST_SEED).toLowerCase(),
      path.resolve("C:/Jade2025/system").toLowerCase(),
    );
    assert.ok(
      !fs
        .realpathSync(process.env.JADE_TEST_SEED)
        .includes("6567ed9ed0934fc0255b2d4b"),
      "Normal user working database cannot seed this proof",
    );
    const settings = vscode.workspace.getConfiguration(
      "jadeNative",
      vscode.workspace.workspaceFolders[0].uri,
    );
    for (const [key, value] of Object.entries({
      installPath: "C:/Jade2025",
      databasePath: process.env.JADE_TEST_SEED,
      iniPath: process.env.JADE_TEST_INI,
      testDependencyScope: "static",
      testTimeoutSeconds: 60,
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
    const suffix = String(Date.now()),
      schemaA = "AlternateDomain" + suffix,
      schemaB = "AlternateTests" + suffix;
    const a = await vscode.commands.executeCommand("jadeNative.createSchema", {
      name: schemaA,
      parent: "RootSchema",
      version: "25.0.02",
    });
    assert.ok(a.folder, JSON.stringify(a));
    const b = await vscode.commands.executeCommand("jadeNative.createSchema", {
      name: schemaB,
      parent: schemaA,
      version: "25.0.02",
    });
    assert.ok(b.folder, JSON.stringify(b));
    const appTemplate = fs.readFileSync(
      path.join(__dirname, "application-probe.ddx"),
      "utf8",
    );
    for (const [schema, created] of [
      [schemaA, a],
      [schemaB, b],
    ])
      fs.writeFileSync(
        path.join(created.folder, "applications", schema + ".ddx"),
        appTemplate.replaceAll("SJetSchema", schema),
      );
    const cls = (schema, parent, owner, base, declarations, bodies) =>
      `jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf ${parent} partialDefinition;\ntypeHeaders\n${owner} subclassOf ${base} transient;\ntypeDefinitions\n${owner} completeDefinition\n(\njadeMethodDefinitions\n${declarations}\n)\ntypeSources\n${owner} (\njadeMethodSources\n${bodies}\n)`;
    const domainFile = path.join(a.folder, "types/AlternatingDomain.cls"),
      aFile = path.join(a.folder, "types/AlternatingTestsA.cls"),
      bFile = path.join(b.folder, "types/AlternatingTestsB.cls");
    const domain = cls(
      schemaA,
      "RootSchema",
      "AlternatingDomain",
      "Object",
      "value() : Integer;",
      "value\n{\nvalue() : Integer;\nbegin\n return 42;\nend;\n}",
    );
    const testClass = (schema, parent, owner, expected = 42) =>
      cls(
        schema,
        parent,
        owner,
        "JadeTestCase",
        "domainValue() unitTest;",
        `domainValue\n{\ndomainValue() unitTest;\nvars\n domain: AlternatingDomain;\nbegin\n create domain transient;\n assertEquals(${expected},domain.value());\nepilog\n delete domain;\nend;\n}`,
      );
    fs.writeFileSync(domainFile, domain);
    fs.writeFileSync(
      aFile,
      testClass(schemaA, "RootSchema", "AlternatingTestsA"),
    );
    fs.writeFileSync(bFile, testClass(schemaB, schemaA, "AlternatingTestsB"));
    const aDoc = await vscode.workspace.openTextDocument(aFile),
      bDoc = await vscode.workspace.openTextDocument(bFile),
      domainDoc = await vscode.workspace.openTextDocument(domainFile);
    await api.testing.discover(true);
    async function replace(document, text) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        ),
        text,
      );
      assert.equal(await vscode.workspace.applyEdit(edit), true);
      assert.equal(await document.save(), true);
    }
    const logs = new Set();
    let workerBaseline;
    async function measure(label, document, expected = true, loaded) {
      await vscode.window.showTextDocument(document);
      const start = performance.now(),
        result = await api.testing.runFile(document.uri, ["domainValue"]),
        item = {
          label,
          milliseconds: Math.round(performance.now() - start),
          passed: result.passed,
          loadedFiles: result.report?.loaded_files,
          incremental: !!result.report?.incremental,
          nativeMilliseconds: result.report?.runMilliseconds,
          connection: result.report?.connection,
          nativeWorkerPid: api.nativeTests.client?.child?.pid,
          logFile: result.report?.logFile,
          results: result.report?.results,
        };
      rows.push(item);
      fs.writeFileSync(
        path.resolve(root, "../alternating-progress.json"),
        JSON.stringify(rows, null, 2),
      );
      assert.equal(result.passed, expected, JSON.stringify(result));
      assert.equal(
        result.report?.tests_completed,
        true,
        JSON.stringify(result),
      );
      assert.equal(result.report?.tests_selected, 1);
      assert.ok(
        item.nativeWorkerPid,
        "Native worker PID must remain inspectable",
      );
      if (workerBaseline)
        assert.equal(
          item.nativeWorkerPid,
          workerBaseline,
          "Alternation must retain one native connection process",
        );
      assert.ok(item.logFile, "Native test run must emit its own report");
      assert.ok(
        !logs.has(item.logFile),
        "Each run must execute native tests, not reuse a report",
      );
      logs.add(item.logFile);
      assert.ok(fs.readFileSync(item.logFile).length > 0);
      if (loaded !== undefined)
        assert.equal(item.loadedFiles, loaded, JSON.stringify(item));
      return result;
    }
    await measure("cold-A", aDoc);
    await measure("cold-B", bDoc);
    workerBaseline = rows.at(-1).nativeWorkerPid;
    await measure("unchanged-A-after-B", aDoc, true, 0);
    await measure("unchanged-B-after-A", bDoc, true, 0);
    await replace(domainDoc, domain.replace("return 42;", "return 43;"));
    const changed = await measure("changed-domain-A-fails", aDoc, false);
    assert.equal(changed.report.incremental, true);
    assert.equal(changed.report.loaded_files, 1);
    await measure("changed-domain-B-fails", bDoc, false, 0);
    await replace(domainDoc, domain);
    await measure("restored-domain-A-passes", aDoc);
    await measure("restored-domain-B-passes", bDoc, true, 0);
    await replace(
      aDoc,
      testClass(schemaA, "RootSchema", "AlternatingTestsA", 41),
    );
    const edited = await measure("edited-A-assertion-fails", aDoc, false);
    assert.equal(edited.report.incremental, true);
    assert.equal(edited.report.loaded_files, 1);
    await measure("unchanged-B-still-passes", bDoc, true, 0);
    await replace(aDoc, testClass(schemaA, "RootSchema", "AlternatingTestsA"));
    await measure("restored-A-passes", aDoc);
    await measure("final-B-passes", bDoc, true, 0);
    if (process.env.JADE_TEST_COMPILE_FAILURE === "1") {
      workerBaseline = undefined;
      await replace(
        domainDoc,
        domain.replace("return 42;", "return self.noSuchNativeProperty;"),
      );
      await vscode.window.showTextDocument(aDoc);
      const invalidStart = performance.now(),
        invalid = await api.testing.runFile(aDoc.uri, ["domainValue"]);
      assert.equal(invalid.passed, false);
      assert.equal(invalid.report.compiled, false);
      assert.ok(
        (invalid.report.diagnostics || []).some(
          (row) => Number(row.compiler_error ?? row.code) === 6026,
        ),
        JSON.stringify(invalid),
      );
      rows.push({
        label: "native-compile-error-blocks-test",
        milliseconds: Math.round(performance.now() - invalidStart),
        passed: false,
        compiled: false,
        loadedFiles: invalid.report.loaded_files,
        diagnostics: invalid.report.diagnostics,
      });
      await replace(domainDoc, domain);
      await measure("compile-error-reverted-A-passes", aDoc);
      await measure("compile-error-reverted-B-passes", bDoc);
    }
    const originalWorker = api.nativeTests.client.child.pid;
    await vscode.commands.executeCommand("jadeNative.disconnectTestRunner");
    workerBaseline = undefined;
    await measure("reopened-unchanged-A-passes", aDoc, true, 0);
    assert.notEqual(
      api.nativeTests.client.child.pid,
      originalWorker,
      "Explicit disconnect must replace the worker",
    );
    workerBaseline = api.nativeTests.client.child.pid;
    await measure("reopened-unchanged-B-passes", bDoc, true, 0);
    await vscode.commands.executeCommand("jadeNative.disconnectTestRunner");
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          passed: true,
          version: extension.packageJSON.version,
          normalTestingAPI: true,
          twoSchemasWithDDX: true,
          alternatingClassesNoReload: true,
          sharedDependencyChangesExecuteNatively: true,
          eachRunFreshReport: true,
          nativeWorkerProcessRetained: true,
          nativeProcessRestartKeepsSourceInventory: true,
          compileFailureCannotReturnCachedPass:
            process.env.JADE_TEST_COMPILE_FAILURE === "1",
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
    if (api)
      await vscode.commands.executeCommand("jadeNative.disconnectTestRunner");
  }
}
module.exports = { run };
