"use strict";
// Opt-in actual Extract All command, owned empty Code workspace + qualified CLI.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const base = require("./SourcePullIntegration_host_fixture.cjs"),
  { sourceTargetPath } = require("../../extension/src/source-pull-path");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  digest = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function inventory(root) {
  const files = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".github" && entry.name !== ".vscode") visit(file);
      } else if (/\.(scm|sec|cls|ddx)$/i.test(entry.name))
        files.push(path.relative(root, file).split(path.sep).join("/"));
    }
  }
  visit(root);
  return files.sort();
}
async function run() {
  const vscode = require("vscode"),
    stage = process.env.JADE_SOURCE_HOST_STAGE,
    workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
  fs.writeFileSync(
    path.join(stage, "host-process.json"),
    JSON.stringify({ pid: process.pid, nonce: process.env.JADE_HOST_OWNER }),
  );
  try {
    const expectedFile = process.env.JADE_SOURCE_PULL_FULL_EXPECTED;
    if (!expectedFile)
      throw Error("Explicit compact native golden inventory required");
    const expected = JSON.parse(fs.readFileSync(expectedFile, "utf8"));
    assert.ok(
      Array.isArray(expected.files) && expected.files.length > 0,
      "Native golden inventory must contain complete output hashes",
    );
    const paths = new Set();
    for (const item of expected.files) {
      sourceTargetPath(workspace, item.path);
      assert.match(item.sha256, /^[a-f0-9]{64}$/i);
      assert.equal(paths.has(item.path.toLowerCase()), false);
      paths.add(item.path.toLowerCase());
    }
    assert.deepEqual(
      inventory(workspace),
      [],
      "No current CLS or prior source may seed this initial pull",
    );
    const extension = vscode.extensions.getExtension(
      "jade-local-tools.jade-native-runner-cpp-preview",
    );
    assert.ok(extension);
    const api = await extension.activate();
    const first = await vscode.commands.executeCommand(
      "jadeNative.extractAllSources",
      vscode.Uri.file(workspace),
    );
    assert.equal(first.passed, true, JSON.stringify(first));
    assert.equal(first.scope, "all");
    assert.equal(first.authoritative, true);
    assert.equal(first.completedFiles, expected.files.length);
    assert.equal(first.counts.added, expected.files.length);
    assert.deepEqual(
      inventory(workspace),
      expected.files.map((item) => item.path).sort(),
    );
    const mtimes = new Map();
    for (const item of expected.files) {
      const target = sourceTargetPath(workspace, item.path);
      assert.equal(
        digest(target),
        item.sha256.toLowerCase(),
        "Native golden mismatch: " + item.path,
      );
      mtimes.set(item.path, fs.statSync(target).mtimeMs);
    }
    const repeat = await vscode.commands.executeCommand(
      "jadeNative.extractAllSources",
      vscode.Uri.file(workspace),
    );
    assert.equal(repeat.passed, true, JSON.stringify(repeat));
    assert.equal(repeat.authoritative, true);
    assert.equal(repeat.counts.unchanged, expected.files.length);
    for (const item of expected.files)
      assert.equal(
        fs.statSync(sourceTargetPath(workspace, item.path)).mtimeMs,
        mtimes.get(item.path),
      );
    const header = expected.files.find((item) => item.path.endsWith(".scm"));
    assert.ok(header, "Golden full extraction must include schema headers");
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(
        vscode.Uri.file(sourceTargetPath(workspace, header.path)),
      ),
      { preview: false },
    );
    api.sourcePull.output.show(true);
    await vscode.commands.executeCommand("notifications.showList");
    await delay(1000);
    await base.screenshot(
      Number(process.env.JADE_SOURCE_HOST_PORT),
      process.env.JADE_SOURCE_HOST_SCREENSHOT,
    );
    // A second genuinely empty project supplies an actual dirty, associated
    // untitled target before native extraction creates that schema header.
    const vetoRoot = path.join(stage, "dirty-target-project");
    fs.mkdirSync(path.join(vetoRoot, ".vscode"), { recursive: true });
    fs.copyFileSync(
      path.join(workspace, ".vscode/settings.json"),
      path.join(vetoRoot, ".vscode/settings.json"),
    );
    const added = vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders.length,
      0,
      { uri: vscode.Uri.file(vetoRoot), name: "Unsaved target proof" },
    );
    assert.equal(added, true);
    for (
      let i = 0;
      i < 100 &&
      !vscode.workspace.getWorkspaceFolder(vscode.Uri.file(vetoRoot));
      i++
    )
      await delay(30);
    assert.ok(vscode.workspace.getWorkspaceFolder(vscode.Uri.file(vetoRoot)));
    const vetoTarget = sourceTargetPath(vetoRoot, header.path),
      associated = vscode.Uri.from({
        scheme: "untitled",
        path: vscode.Uri.file(vetoTarget).path,
      }),
      document = await vscode.workspace.openTextDocument(associated),
      edit = new vscode.WorkspaceEdit();
    edit.insert(
      document.uri,
      new vscode.Position(0, 0),
      "// retained unsaved schema header\n",
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.equal(document.isDirty, true);
    assert.equal(
      path.resolve(document.uri.fsPath).toLowerCase(),
      path.resolve(vetoTarget).toLowerCase(),
    );
    const veto = await vscode.commands.executeCommand(
      "jadeNative.extractAllSources",
      vscode.Uri.file(vetoRoot),
    );
    assert.equal(veto.passed, false, JSON.stringify(veto));
    assert.equal(veto.code, 4);
    assert.equal(veto.scope, "all");
    assert.equal(veto.authoritative, false);
    assert.equal(veto.counts.rejected, 1);
    assert.equal(veto.counts.added, expected.files.length - 1);
    assert.equal(fs.existsSync(vetoTarget), false);
    assert.match(document.getText(), /retained unsaved/);
    fs.writeFileSync(
      path.join(stage, "host-report.json"),
      JSON.stringify({
        passed: true,
        nativeJadeExecuted: true,
        registeredCommand: "jadeNative.extractAllSources",
        initialSourceFiles: 0,
        scope: "all",
        version: "current",
        privateCandidate: process.env.JADE_SOURCE_HOST_OFFICIAL !== "1",
        packagedVsix: process.env.JADE_SOURCE_HOST_OFFICIAL === "1",
        distributionSha256: process.env.JADE_SOURCE_HOST_MANIFEST_SHA,
        cliSha256: process.env.JADE_SOURCE_HOST_SHA,
        expectedFiles: expected.files.length,
        goldenInventoryMatched: true,
        unchangedFiles: repeat.counts.unchanged,
        unchangedMtimes: true,
        associatedUntitledVeto: {
          rejected: veto.counts.rejected,
          added: veto.counts.added,
          retained: true,
        },
      }),
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(stage, "host-report.json"),
      JSON.stringify({ passed: false, error: error.stack }),
    );
    throw error;
  }
}
module.exports = { run };
if (require.main === module)
  base
    .main({
      runModule: __filename,
      evidenceName: "source-pull-full-native-host.json",
      screenshotDirectory: "full-source-extraction",
      screenshotFile: "extract-all-sources.png",
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
