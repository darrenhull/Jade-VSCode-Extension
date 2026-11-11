"use strict";
// Opt-in UI evidence: runs product progress code in a private Code host with
// explicitly synthetic counts. It never opens Jade or installs an extension.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { HostTestArtifacts } = require("../../scripts/HostTestArtifacts.cjs");
const {
  connectPrivateDebugger,
} = require("../../scripts/creation-ui-capture.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function capture(port, destination, expected) {
  const client = await connectPrivateDebugger(port);
  try {
    const { targetInfos } = await client.request("Target.getTargets");
    const page = targetInfos.find(
      (target) =>
        target.type === "page" && target.url.startsWith("vscode-file://"),
    );
    if (!page) throw Error("Owned workbench page missing");
    const { sessionId } = await client.request("Target.attachToTarget", {
      targetId: page.targetId,
      flatten: true,
    });
    let text = "";
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await client.request(
        "Runtime.evaluate",
        { expression: "document.body.innerText", returnByValue: true },
        sessionId,
      );
      text = result.result.value;
      if (text.includes(expected)) break;
      await delay(100);
    }
    if (!text.includes(expected))
      throw Error(
        "Expected private fixture progress did not render: " + expected,
      );
    await client.request(
      "Runtime.evaluate",
      {
        expression:
          'Array.from(document.querySelectorAll("[aria-label], [title]")).find(e => /Expand Notification/i.test(e.getAttribute("aria-label") || e.getAttribute("title") || ""))?.click()',
        returnByValue: true,
      },
      sessionId,
    );
    await delay(250);
    const bounds = await client.request(
      "Runtime.evaluate",
      {
        expression:
          'JSON.stringify((()=>{const e=document.querySelector(".notifications-center.visible")||document.querySelector(".notifications-toasts");const r=e.getBoundingClientRect();return{x:Math.max(0,r.x-12),y:Math.max(0,r.y-12),width:Math.min(window.innerWidth-r.x+12,r.width+24),height:Math.min(window.innerHeight-r.y+12,r.height+24),scale:1};})())',
        returnByValue: true,
      },
      sessionId,
    );
    const clip = JSON.parse(bounds.result.value);
    const shot = await client.request(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false, clip },
      sessionId,
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, Buffer.from(shot.data, "base64"));
    return text;
  } finally {
    client.close();
  }
}
async function runFixture() {
  const vscode = require("vscode"),
    { createPullProgress } = require(
      path.join(process.env.JADE_PROGRESS_STAGE, "extension/pull-progress.js"),
    );
  fs.writeFileSync(
    path.join(process.env.JADE_PROGRESS_STAGE, "host-process.json"),
    JSON.stringify({ pid: process.pid, nonce: process.env.JADE_HOST_OWNER }),
  );
  const output = vscode.window.createOutputChannel(
      "Jade Extract · synthetic UI fixture",
    ),
    screenshots = process.env.JADE_PROGRESS_SCREENSHOTS;
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Jade pull - synthetic UI fixture",
        cancellable: false,
      },
      async (progress) => {
        const observed = createPullProgress(progress, {
          initialPhase: "Hashing extracted files",
          log: (line) => output.appendLine(line),
        });
        try {
          observed.phase({
            phase: "Hashing extracted files",
            completed: 12000,
            total: 30000,
            bytes: 145000000,
          });
          await vscode.commands.executeCommand("notifications.showList");
          await delay(1200);
          const hashText = await capture(
            Number(process.env.JADE_PROGRESS_PORT),
            path.join(screenshots, "hash-progress.png"),
            "12,000/30,000 files hashed",
          );
          if (hashText.includes("class files observed"))
            throw Error("Stale native count displayed in hash stage");
          observed.phase("Refreshing tests and class views");
          await delay(1200);
          await capture(
            Number(process.env.JADE_PROGRESS_PORT),
            path.join(screenshots, "refresh-progress.png"),
            "Refreshing tests and class views",
          );
        } finally {
          observed.dispose();
        }
      },
    );
    fs.writeFileSync(
      path.join(process.env.JADE_PROGRESS_STAGE, "host-report.json"),
      JSON.stringify({
        passed: true,
        fixture: "synthetic stage counters in real VS Code notification",
        nativeJadeExecuted: false,
        screenshots: ["hash-progress.png", "refresh-progress.png"],
      }),
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(process.env.JADE_PROGRESS_STAGE, "host-report.json"),
      JSON.stringify({ passed: false, error: error.stack }),
    );
    throw error;
  } finally {
    output.dispose();
  }
}
async function main() {
  const code = process.env.JADE_TEST_CODE;
  if (!code || !fs.existsSync(code))
    throw Error("Set JADE_TEST_CODE to Code.exe");
  const root = path.resolve(__dirname, "../.."),
    artifacts = new HostTestArtifacts({
      evidencePath: path.join(root, "evidence/extraction-progress-host.json"),
    });
  await artifacts.run(async (stage) => {
    const extension = path.join(stage, "extension");
    fs.mkdirSync(extension);
    fs.mkdirSync(path.join(stage, "workspace"));
    fs.writeFileSync(
      path.join(extension, "package.json"),
      JSON.stringify({
        name: "jade-progress-ui-fixture",
        displayName: "Jade Tools - progress fixture",
        publisher: "jade-test",
        version: "0.0.1",
        engines: { vscode: "^1.95.0" },
        main: "./main.cjs",
        activationEvents: ["*"],
      }),
    );
    fs.writeFileSync(
      path.join(extension, "main.cjs"),
      'const fs=require("node:fs"),path=require("node:path"),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));const capture=require(' +
        JSON.stringify(__filename) +
        ").capture;exports.activate=()=>{};exports.runFixture=" +
        runFixture.toString() +
        ";",
    );
    fs.copyFileSync(
      path.join(root, "extension/src/pull-progress.js"),
      path.join(extension, "pull-progress.js"),
    );
    fs.writeFileSync(
      path.join(stage, "runner.cjs"),
      "exports.run=()=>require(" +
        JSON.stringify(path.join(extension, "main.cjs")) +
        ").runFixture();",
    );
    const server = require("node:net").createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    const env = {
      ...process.env,
      JADE_PROGRESS_STAGE: stage,
      JADE_PROGRESS_PORT: String(port),
      JADE_HOST_OWNER: artifacts.nonce,
      JADE_PROGRESS_SCREENSHOTS: path.join(
        root,
        "docs/screenshots/extraction-progress",
      ),
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
        path.join(stage, "workspace"),
      ],
      { env, windowsHide: true, stdio: "pipe" },
    );
    let tail = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (value) => {
        tail = (tail + value).slice(-8000);
      });
    try {
      await artifacts.wait(child, { timeoutMilliseconds: 120000 });
    } catch (error) {
      throw Error(error.message + "\n" + tail);
    }
    const report = JSON.parse(
      fs.readFileSync(path.join(stage, "host-report.json"), "utf8"),
    );
    if (!report.passed) throw Error(report.error);
    console.log("Private synthetic progress UI fixture passed and cleaned.");
  });
}
module.exports = { runFixture, capture };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
