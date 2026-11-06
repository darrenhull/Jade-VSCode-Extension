"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const {
  nativeProcess,
  runNativeTests,
} = require("../extension/src/working-database");
test("native utility waits for the retained test connection to close before starting", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-native-handoff-")),
    marker = path.join(root, "closed");
  const result = await nativeProcess(
    process.execPath,
    [
      "-e",
      'process.exit(require("fs").existsSync(process.argv[1])?0:7)',
      marker,
    ],
    {
      beforeNativeProcess: async () => {
        await new Promise((r) => setTimeout(r, 10));
        fs.writeFileSync(marker, "closed");
      },
    },
  );
  assert.equal(result.success, true);
});
test("failed connection handoff does not start a competing native process", async () => {
  await assert.rejects(
    nativeProcess(process.execPath, ["-e", "process.exit(0)"], {
      beforeNativeProcess: async () => {
        throw Error("not released");
      },
    }),
    /not released/,
  );
});
test("retained native test run uses the exact existing XML/report format and assertion failures cannot pass on exit0", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-native-reports-")),
    working = {
      root,
      installPath: "C:/Jade",
      databasePath: path.join(root, "system"),
      testSession: {
        run: async (w, selection) => {
          const control = fs.readFileSync(selection.controlFile, "utf8");
          assert.match(control, /<class name="Checks"><method name="check"\/>/);
          fs.writeFileSync(
            selection.logFile,
            " : Example::Checks::check: assertEquals - expected 19 but actual=18\ntotal tests=1 failed=1 skipped=0 succeeded=0",
          );
          return {
            code: 0,
            success: true,
            runMilliseconds: 1000,
            connection: 1,
          };
        },
      },
    };
  const result = await runNativeTests(working, {
    schema: "Example",
    owner: "Checks",
    methods: ["check"],
  });
  assert.equal(result.tests_completed, true);
  assert.equal(result.success, false);
  assert.equal(result.code, 1);
  assert.equal(result.results[0].method, "check");
  assert.match(result.results[0].message, /expected 19/);
});
