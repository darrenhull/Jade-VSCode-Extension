"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    evidence = path.resolve(__dirname, "../../host-report.json");
  try {
    assert.ok(
      process.env.JADE_TEST_SEED && process.env.JADE_TEST_INI,
      "Use a private test database.",
    );
    assert.notEqual(
      path.resolve(process.env.JADE_TEST_SEED).toLowerCase(),
      path.resolve("C:/Jade2025/system").toLowerCase(),
      "Never test against the user source database.",
    );
    const schema = process.env.JADE_PULL_SCHEMA || "SJetTestSchema",
      owner = process.env.JADE_PULL_CLASS || "VsCodeDiscoveryProbeTest",
      method = process.env.JADE_PULL_METHOD || "pulledTest_IsDiscoveredAndRuns";
    const initially = fs.readdirSync(root);
    assert.equal(
      initially.length,
      0,
      "The source workspace must genuinely start empty.",
    );
    const extension = vscode.extensions.getExtension(
      "jade-local-tools.jade-native-runner-cpp-preview",
    );
    await extension.activate();
    const settings = vscode.workspace.getConfiguration(
      "jadeNative",
      vscode.workspace.workspaceFolders[0].uri,
    );
    await settings.update(
      "installPath",
      "C:/Jade2025",
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await settings.update(
      "databasePath",
      process.env.JADE_TEST_SEED,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    await settings.update(
      "iniPath",
      process.env.JADE_TEST_INI,
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    const pulled = await vscode.commands.executeCommand(
      "jadeNative.extractAllSources",
    );
    assert.equal(pulled.success, true, JSON.stringify(pulled));
    assert.equal(
      fs.existsSync(path.join(root, "extract-manifest.json")),
      false,
      "plugin bookkeeping belongs in system storage",
    );
    const file = path.join(
      root,
      "schemas/" + schema + "/types/" + owner + ".cls",
    );
    assert.ok(fs.existsSync(file));
    assert.ok(fs.existsSync(path.join(root, "schemas/" + schema + ".scm")));
    assert.equal(
      fs.existsSync(
        path.join(root, "schemas/" + schema + "/schemaDefinitions.sec"),
      ),
      false,
      "one small schema header, not duplicate copies",
    );
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, "schemas/" + schema + ".scm"), "utf8"),
      /typeDefinitions/,
    );
    const summary = await vscode.commands.executeCommand(
        "jadeNative.refreshTests",
      ),
      key = schema + "::" + owner + "::" + method;
    assert.ok(
      summary.entries.some((e) => e.key === key),
      JSON.stringify(summary),
    );
    const verified = await vscode.commands.executeCommand(
      "jadeNative.verifyPulledTests",
    );
    assert.equal(verified.verified, true, JSON.stringify(verified));
    assert.ok(verified.expected >= 1);
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    const tested = await vscode.commands.executeCommand(
      "jadeNative.runLocalTests",
      doc.uri,
    );
    assert.equal(tested.passed, true, JSON.stringify(tested));
    fs.writeFileSync(
      evidence,
      JSON.stringify(
        {
          passed: true,
          version: extension.packageJSON.version,
          workspace: root,
          startedEmpty: true,
          database: process.env.JADE_TEST_SEED,
          pulledFiles: pulled.fileCount,
          discoveredTests: summary.tests,
          probe: key,
          pulledTestsMatched: verified.expected,
          missing: verified.missing,
          probeTestPassed: true,
          schemaHeaderBesideFolder: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    fs.writeFileSync(
      evidence,
      JSON.stringify(
        { passed: false, workspace: root, error: error.stack },
        null,
        2,
      ),
    );
    throw error;
  }
}
module.exports = { run };
