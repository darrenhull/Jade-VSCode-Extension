"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  vm = require("node:vm");
test("pull rechecks unsaved editors after overwrite review before applying a prepared plan", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-pull-review-"));
  try {
    const destination = path.join(root, "workspace");
    fs.mkdirSync(destination);
    const target = path.join(destination, "Fish.cls");
    fs.writeFileSync(target, "local saved source");
    let applied = 0,
      busy = false,
      watchDisposed = false;
    const commands = new Map(),
      errors = [],
      documents = [];
    const folder = { uri: { fsPath: destination } },
      plan = {
        files: [{ path: "Fish.cls", target, action: "conflict" }],
        conflicts: [{ path: "Fish.cls" }],
        manifest: { files: [] },
      };
    const loaded = { exports: {} };
    vm.runInNewContext(
      "(function(require,module){" +
        fs.readFileSync(
          path.join(__dirname, "../extension/src/sidebar.js"),
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
              startExtract: () => ({
                completion: Promise.resolve({ success: true, code: 0 }),
                stop() {},
              }),
              applySourceUpdate: () => {
                applied++;
              },
            }
          : name === "./pull-progress"
            ? {
                createPullProgress: () => ({
                  phase() {},
                  dispose() {
                    watchDisposed = true;
                  },
                }),
                preparePullSources: async () => ({
                  organized: { schemas: ["Pets"] },
                  plan,
                }),
              }
            : require(name),
      loaded,
    );
    const vscode = {
      window: {
        activeTextEditor: { document: { uri: { fsPath: target } } },
        createOutputChannel: () => ({
          append() {},
          appendLine() {},
          clear() {},
          show() {},
        }),
        withProgress: async (options, callback) =>
          callback(
            { report() {} },
            {
              isCancellationRequested: false,
              onCancellationRequested: () => ({ dispose() {} }),
            },
          ),
        showWarningMessage: async () => {
          documents.push({
            isDirty: true,
            uri: { scheme: "file", fsPath: target },
          });
          return "Replace Listed Files";
        },
        showErrorMessage: async (message) => errors.push(message),
      },
      workspace: {
        workspaceFolders: [folder],
        getWorkspaceFolder: () => folder,
        textDocuments: documents,
      },
      commands: {
        registerCommand: (name, fn) => {
          commands.set(name, fn);
          return { dispose() {} };
        },
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
        setBusy: async (value) => (busy = value),
      },
    );
    const result = await commands.get("jadeNative.extractAllSources")();
    assert.equal(result.success, false);
    assert.match(errors[0], /Save your editor changes/);
    assert.equal(applied, 0);
    assert.equal(busy, false);
    assert.equal(watchDisposed, true);
    assert.equal(fs.readFileSync(target, "utf8"), "local saved source");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
