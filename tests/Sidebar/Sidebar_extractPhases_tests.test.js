"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm");
const { createPullProgress } = require("../../extension/src/pull-progress");
test("unchanged pull still reports apply and refresh stages without changing source", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-sidebar-phases-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, "workspace");
  fs.mkdirSync(destination);
  const source = path.join(destination, "Fish.cls");
  fs.writeFileSync(source, "local source");
  const mtime = fs.statSync(source).mtimeMs;
  const commands = new Map(),
    reports = [],
    logs = [],
    notifications = [],
    refreshes = [],
    errors = [];
  let busy = false,
    applies = 0;
  const plan = { files: [], conflicts: [], manifest: { files: [] } },
    loaded = { exports: {} };
  vm.runInNewContext(
    "(function(require,module){" +
      fs.readFileSync(
        path.join(__dirname, "../../extension/src/sidebar.js"),
        "utf8",
      ) +
      "\n})",
    { Buffer, console },
  )(
    (name) =>
      name === "./extract"
        ? {
            resolveExtractConfig: () => ({
              databasePath: path.join(root, "database"),
            }),
            resolveExtractionDirectory: () => destination,
            startExtract: (config, staging, output, spawn, onProgress) => {
              onProgress({ phase: "Discovering extracted files" });
              onProgress({
                phase: "Hashing extracted files",
                completed: 1,
                total: 1,
                bytes: 3,
              });
              return {
                completion: Promise.resolve({ success: true, code: 0 }),
                stop() {},
              };
            },
            applySourceUpdate: () => {
              applies++;
              return { written: 0, kept: 0 };
            },
          }
        : name === "./pull-progress"
          ? {
              createPullProgress,
              preparePullSources: async (input, { report }) => {
                report("Organizing native source files");
                report("Comparing extracted source with workspace files");
                return { organized: { schemas: ["Pets"] }, plan };
              },
            }
          : require(name),
    loaded,
  );
  const folder = { uri: { fsPath: destination } },
    vscode = {
      window: {
        createOutputChannel: () => ({
          append() {},
          appendLine: (line) => logs.push(line),
          clear() {},
          show() {},
        }),
        withProgress: async (options, callback) => {
          notifications.push(options);
          return callback(
            { report: (value) => reports.push(value) },
            {
              isCancellationRequested: false,
              onCancellationRequested: () => ({ dispose() {} }),
            },
          );
        },
        showErrorMessage: async (error) => errors.push(error),
        showInformationMessage: async () => undefined,
      },
      workspace: { workspaceFolders: [folder], textDocuments: [] },
      commands: {
        registerCommand: (name, callback) => {
          commands.set(name, callback);
          return { dispose() {} };
        },
        executeCommand: async (name) => refreshes.push(name),
      },
      ProgressLocation: { Notification: 15 },
    };
  loaded.exports.registerSidebar(
    vscode,
    {
      subscriptions: [],
      globalStorageUri: { fsPath: path.join(root, "global") },
    },
    {
      settings: () => ({}),
      isBusy: () => busy,
      setBusy: async (value) => {
        busy = value;
      },
    },
  );
  const result = await commands.get("jadeNative.extractAllSources")();
  assert.deepEqual(errors, []);
  assert.equal(result.success, true);
  assert.equal(applies, 1);
  assert.equal(busy, false);
  assert.equal(fs.statSync(source).mtimeMs, mtime);
  assert.equal(fs.readFileSync(source, "utf8"), "local source");
  for (const phase of [
    "Discovering",
    "Hashing",
    "Organizing",
    "Comparing",
    "Applying",
    "Refreshing",
  ])
    assert.ok(
      reports.some((value) => value.message.startsWith(phase)),
      phase,
    );
  assert.ok(logs.some((line) => line.startsWith("Native extraction:")));
  assert.ok(
    logs.some((line) => line.startsWith("Refreshing tests and class views:")),
  );
  assert.equal(notifications[1].cancellable, false);
  assert.deepEqual(refreshes, [
    "jadeNative.refreshTests",
    "jadeNative.refreshClassView",
  ]);
});
