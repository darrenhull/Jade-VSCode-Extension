"use strict";
// Opt-in: actual registered product command + private portable CLI + owned seed.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict"),
  { spawn, execFileSync } = require("node:child_process");
const { HostTestArtifacts } = require("../../scripts/HostTestArtifacts.cjs");
const {
  connectPrivateDebugger,
} = require("../../scripts/creation-ui-capture.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function screenshot(port, destination) {
  const c = await connectPrivateDebugger(port);
  try {
    const { targetInfos } = await c.request("Target.getTargets"),
      target = targetInfos.find(
        (t) => t.type === "page" && t.url.startsWith("vscode-file://"),
      );
    if (!target) throw Error("Private workbench missing");
    const { sessionId } = await c.request("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const visible = await c.request(
      "Runtime.evaluate",
      { expression: "document.body.innerText", returnByValue: true },
      sessionId,
    );
    assert.match(
      visible.result.value,
      /Selected class sources pulled|Jade Source Pull|ExplorerDemoPet/,
    );
    const shot = await c.request(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, Buffer.from(shot.data, "base64"));
  } finally {
    c.close();
  }
}
async function run() {
  const vscode = require("vscode"),
    stage = process.env.JADE_SOURCE_HOST_STAGE;
  fs.writeFileSync(
    path.join(stage, "host-process.json"),
    JSON.stringify({ pid: process.pid, nonce: process.env.JADE_HOST_OWNER }),
  );
  try {
    const extension = vscode.extensions.getExtension(
      "jade-local-tools.jade-native-runner-cpp-preview",
    );
    assert.ok(extension);
    const api = await extension.activate();
    const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath,
      row = {
        kind: "class",
        schema: "SJetSchema",
        name: "ExplorerDemoPet",
        projectRoot: workspace,
      };
    const first = await vscode.commands.executeCommand(
      "jadeNative.pullSelectedClassFromSource",
      row,
    );
    assert.equal(first.passed, true, JSON.stringify(first));
    assert.equal(first.counts.added, 1);
    const target = path.join(
        workspace,
        "schemas/SJetSchema/types/ExplorerDemoPet.cls",
      ),
      bytes = fs.readFileSync(target),
      mtime = fs.statSync(target).mtimeMs;
    const second = await vscode.commands.executeCommand(
      "jadeNative.pullSelectedClassFromSource",
      row,
    );
    assert.equal(second.counts.unchanged, 1, JSON.stringify(second));
    assert.equal(fs.statSync(target).mtimeMs, mtime);
    assert.ok(fs.readFileSync(target).equals(bytes));
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(vscode.Uri.file(target)),
      { preview: false },
    );
    api.sourcePull.output.show(true);
    await vscode.commands.executeCommand("notifications.showList");
    await delay(1200);
    await screenshot(
      Number(process.env.JADE_SOURCE_HOST_PORT),
      process.env.JADE_SOURCE_HOST_SCREENSHOT,
    );
    // Real unsaved VS Code document, not a fake dirty guard.
    const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(target),
      ),
      edit = new vscode.WorkspaceEdit();
    edit.insert(
      doc.uri,
      new vscode.Position(doc.lineCount, 0),
      "\n// unsaved host-test edit\n",
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.equal(doc.isDirty, true);
    const dirty = await vscode.commands.executeCommand(
      "jadeNative.pullSelectedClassFromSource",
      row,
    );
    assert.equal(dirty.passed, false);
    assert.match(dirty.report.error, /unsaved/);
    assert.ok(fs.readFileSync(target).equals(bytes));
    const formRow = {
      kind: "class",
      schema: "ErewhonSelfDocumentorSchema",
      name: "DisplaySelfDocumentorDetails",
      projectRoot: workspace,
    };
    const form = await vscode.commands.executeCommand(
      "jadeNative.pullSelectedClassFromSource",
      formRow,
    );
    assert.equal(form.passed, true, JSON.stringify(form));
    assert.equal(form.counts.added, 2);
    assert.equal(form.completedFiles, 2);
    const formTarget = path.join(
        workspace,
        "schemas/ErewhonSelfDocumentorSchema/types/DisplaySelfDocumentorDetails.cls",
      ),
      ddx = formTarget.replace(/\.cls$/i, ".ddx");
    assert.ok(fs.existsSync(ddx));
    const formBytes = fs.readFileSync(formTarget),
      ddxBytes = fs.readFileSync(ddx);
    const repeatedForm = await vscode.commands.executeCommand(
      "jadeNative.pullSelectedClassFromSource",
      formRow,
    );
    assert.equal(
      repeatedForm.counts.unchanged,
      2,
      JSON.stringify(repeatedForm),
    );
    const ddxDoc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(ddx),
      ),
      ddxEdit = new vscode.WorkspaceEdit();
    ddxEdit.insert(
      ddxDoc.uri,
      new vscode.Position(0, 0),
      "<!-- unsaved DDX -->\n",
    );
    assert.ok(await vscode.workspace.applyEdit(ddxEdit));
    assert.equal(ddxDoc.isDirty, true);
    const dirtyDdx = await vscode.commands.executeCommand(
      "jadeNative.pullSelectedClassFromSource",
      formRow,
    );
    assert.equal(dirtyDdx.passed, false);
    assert.ok(fs.readFileSync(formTarget).equals(formBytes));
    assert.ok(fs.readFileSync(ddx).equals(ddxBytes));
    fs.writeFileSync(
      path.join(stage, "host-report.json"),
      JSON.stringify({
        passed: true,
        nativeJadeExecuted: true,
        registeredCommand: true,
        privateCandidate: process.env.JADE_SOURCE_HOST_OFFICIAL !== "1",
        packagedVsix: process.env.JADE_SOURCE_HOST_OFFICIAL === "1",
        distributionSha256: process.env.JADE_SOURCE_HOST_MANIFEST_SHA,
        cliSha256: process.env.JADE_SOURCE_HOST_SHA,
        scope: "classes",
        version: "current",
        authoritative: false,
        bytes: bytes.length,
        added: first.counts.added,
        unchanged: second.counts.unchanged,
        unchangedMtime: true,
        unsavedDocumentRetained: true,
        formCompanion: {
          added: form.counts.added,
          unchanged: repeatedForm.counts.unchanged,
          dirtyDdxRetained: true,
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
async function main() {
  if (process.env.JADE_SOURCE_PULL_NATIVE !== "1")
    throw Error("Explicit JADE_SOURCE_PULL_NATIVE=1 required");
  const code = process.env.JADE_TEST_CODE,
    exe = process.env.JADE_SOURCE_PULL_NATIVE_EXE,
    fixture = JSON.parse(
      fs.readFileSync(process.env.JADE_SOURCE_PULL_NATIVE_CONFIG, "utf8"),
    );
  assert.ok(code && exe);
  const temporary = fs.realpathSync(require("node:os").tmpdir()),
    database = fs.realpathSync(fixture.databasePath),
    seed = path.dirname(database);
  assert.equal(path.dirname(seed).toLowerCase(), temporary.toLowerCase());
  assert.match(path.basename(seed), /^jade-cli-stream-seed-[a-f0-9]+$/);
  const root = path.resolve(__dirname, "../.."),
    sha = crypto
      .createHash("sha256")
      .update(fs.readFileSync(exe))
      .digest("hex"),
    artifacts = new HostTestArtifacts({
      nativeSha256: sha,
      evidencePath: path.join(root, "evidence/source-pull-native-host.json"),
    });
  await artifacts.run(async (stage) => {
    const extension = path.join(stage, "extension"),
      workspace = path.join(stage, "workspace");
    const vsix = process.env.JADE_SOURCE_PULL_VSIX;
    if (vsix) {
      // Same bounded owned-VSIX staging policy as scripts/host-test.cjs.
      const script = `$ErrorActionPreference='Stop';$zip=[IO.Compression.ZipFile]::OpenRead($env:JADE_SOURCE_PULL_VSIX);try{$total=0;if($zip.Entries.Count -gt 4096){throw 'VSIX entry limit exceeded'};foreach($entry in $zip.Entries){$total+=$entry.Length;if($total -gt 268435456){throw 'VSIX size limit exceeded'};if($entry.FullName -notmatch '^(extension/|extension.vsixmanifest$|\\[Content_Types\\]\\.xml$)' -or $entry.FullName.Contains('..') -or $entry.FullName.Contains('\\') -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Unsafe VSIX entry'}}}finally{$zip.Dispose()};[IO.Compression.ZipFile]::ExtractToDirectory($env:JADE_SOURCE_PULL_VSIX,$env:JADE_SOURCE_EXTRACT_STAGE)`;
      execFileSync(
        "pwsh",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        {
          env: {
            ...process.env,
            JADE_SOURCE_PULL_VSIX: path.resolve(vsix),
            JADE_SOURCE_EXTRACT_STAGE: stage,
          },
          windowsHide: true,
          stdio: "pipe",
        },
      );
      require("../../scripts/bundle-cli.cjs").bundleCli({
        source: path.join(extension, "vendor/jade-tools-cli"),
        pinFile: path.join(root, "packages/jade-cli-pin.json"),
        verifyOnly: true,
      });
      assert.equal(
        crypto
          .createHash("sha256")
          .update(
            fs.readFileSync(
              path.join(extension, "vendor/jade-tools-cli/jade-cli.exe"),
            ),
          )
          .digest("hex"),
        sha,
      );
    } else {
      fs.cpSync(path.join(root, "extension"), extension, {
        recursive: true,
        filter: (source) =>
          !source.includes(path.sep + "vendor" + path.sep + "jade-tools-cli"),
      });
      fs.mkdirSync(path.join(extension, "vendor"), { recursive: true });
      fs.cpSync(
        path.dirname(exe),
        path.join(extension, "vendor/jade-tools-cli"),
        { recursive: true },
      );
    }
    const manifestSha = crypto
      .createHash("sha256")
      .update(
        fs.readFileSync(
          path.join(extension, "vendor/jade-tools-cli/distribution.json"),
        ),
      )
      .digest("hex");
    fs.mkdirSync(path.join(workspace, ".vscode"), { recursive: true });
    const settings = Object.fromEntries(
      ["installPath", "databasePath", "iniPath", "server", "characterSet"].map(
        (k) => ["jadeNative." + k, fixture[k]],
      ),
    );
    settings["jadeNative.schema"] = "SJetSchema";
    settings["jadeNative.cacheDirectory"] = path.join(stage, "cache");
    fs.writeFileSync(
      path.join(workspace, ".vscode/settings.json"),
      JSON.stringify(settings),
    );
    fs.writeFileSync(
      path.join(stage, "runner.cjs"),
      "exports.run=()=>require(" + JSON.stringify(__filename) + ").run();",
    );
    const server = require("node:net").createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    const env = {
      ...process.env,
      JADE_SOURCE_HOST_STAGE: stage,
      JADE_SOURCE_HOST_PORT: String(port),
      JADE_SOURCE_HOST_SHA: sha,
      JADE_SOURCE_HOST_MANIFEST_SHA: manifestSha,
      JADE_SOURCE_HOST_OFFICIAL: vsix ? "1" : "0",
      JADE_SOURCE_HOST_SCREENSHOT: path.join(
        root,
        "docs/screenshots/native-source-pull/selected-class-pull.png",
      ),
      JADE_HOST_OWNER: artifacts.nonce,
      JADE_TOOLS_STATE_DIRECTORY: path.join(stage, "broker"),
      JADE_TOOLS_CONNECTIONS_FILE: path.join(stage, "connections.json"),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(
      code,
      [
        "--new-window",
        "--remote-debugging-port=" + port,
        "--user-data-dir",
        path.join(stage, "data"),
        "--extensions-dir",
        path.join(stage, "extensions"),
        "--extensionDevelopmentPath=" + extension,
        "--extensionTestsPath=" + path.join(stage, "runner.cjs"),
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
        workspace,
      ],
      { env, windowsHide: true, stdio: "pipe" },
    );
    let tail = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (v) => {
        tail = (tail + v).slice(-6000);
      });
    try {
      await artifacts.wait(child, { timeoutMilliseconds: 120000 });
    } catch (error) {
      throw Error(error.message + "\n" + tail);
    }
    const report = JSON.parse(
      fs.readFileSync(path.join(stage, "host-report.json"), "utf8"),
    );
    assert.equal(report.passed, true, report.error);
    console.log(
      "Actual registered source-pull command in isolated native Code host passed.",
    );
  });
}
module.exports = { run, screenshot };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
