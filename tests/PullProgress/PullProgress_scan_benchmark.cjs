"use strict";
// Opt-in directory-observation measurement, not Jade serialization throughput.
const fs = require("node:fs"),
  path = require("node:path"),
  { performance } = require("node:perf_hooks");
const { createPullProgress } = require("../../extension/src/pull-progress");
async function main() {
  if (process.env.JADE_PULL_SCAN_BENCHMARK !== "1") {
    console.log(
      "SKIP: set JADE_PULL_SCAN_BENCHMARK=1 for the owned 30k scan fixture",
    );
    return;
  }
  const base = path.resolve(__dirname, "../../build");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "pull-scan-"));
  let progress;
  const samples = [],
    messages = [];
  const created = performance.now();
  try {
    for (let schema = 0; schema < 50; schema++)
      for (let group = 0; group < 5; group++) {
        const folder = path.join(root, "Schema" + schema, "Group" + group);
        fs.mkdirSync(folder, { recursive: true });
        for (let index = 0; index < 120; index++)
          fs.writeFileSync(path.join(folder, "Class" + index + ".cls"), "");
      }
    const creationMilliseconds = performance.now() - created;
    progress = createPullProgress(
      { report: (value) => messages.push(value) },
      {
        directory: root,
        intervalMs: 1000000,
        watch: () => {
          throw Error("force existing fallback scan path");
        },
      },
    );
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      await progress.refresh();
      samples.push(performance.now() - start);
      if (!messages.at(-1).message.includes("30,000 class files observed"))
        throw Error("Expected complete observed fixture count");
    }
    const report = {
      format: "pull-progress-directory-scan-v1",
      platform: process.platform,
      files: 30000,
      directories: 300,
      creationMilliseconds,
      scanMilliseconds: samples,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      nativeJadeExecuted: false,
      limitations:
        "Three sequential scans of 30,000 empty files on this Windows host. Data bytes are irrelevant to this directory-entry counter. No controlled cache/AV load or real database timing. Native phase still may scan a dirty tree every three seconds.",
      ownedFixtureCleanupCompleted: false,
    };
    progress.dispose();
    progress = undefined;
    if (
      path.dirname(fs.realpathSync(root)) !== fs.realpathSync(base) ||
      fs.lstatSync(root).isSymbolicLink()
    )
      throw Error("Owned fixture containment check failed");
    fs.rmSync(root, { recursive: true });
    report.ownedFixtureCleanupCompleted = !fs.existsSync(root);
    fs.writeFileSync(
      path.join(base, "pull-progress-scan.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  } finally {
    progress?.dispose();
    if (fs.existsSync(root)) {
      if (
        path.dirname(fs.realpathSync(root)) !== fs.realpathSync(base) ||
        fs.lstatSync(root).isSymbolicLink()
      )
        throw Error("Owned fixture containment check failed");
      fs.rmSync(root, { recursive: true });
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
