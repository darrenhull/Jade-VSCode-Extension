"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const {
  SourcePullController,
  registerSourcePull,
} = require("../../extension/src/SourcePullController");
function fixture(t, produce) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "jade-source-controller-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const events = new EventEmitter(),
    commands = new Map(),
    reports = [],
    logs = [],
    errors = [],
    warnings = [],
    scheduled = new Set(),
    refreshes = [];
  let busy = false,
    bulk = false;
  const uri = (file) => ({
    scheme: "file",
    fsPath: file,
    toString: () => "file:///" + file,
  });
  const folder = { uri: uri(root) },
    doc = { uri: uri(path.join(root, "Fish.cls")), isDirty: false };
  const workspace = {
    textDocuments: [doc],
    workspaceFolders: [folder],
    getWorkspaceFolder: () => folder,
  };
  for (const [method, event] of [
    ["onDidOpenTextDocument", "open"],
    ["onDidChangeTextDocument", "change"],
    ["onDidCloseTextDocument", "close"],
    ["onDidChangeWorkspaceFolders", "folders"],
  ])
    workspace[method] = (handler) => {
      events.on(event, handler);
      return { dispose: () => events.off(event, handler) };
    };
  const vscode = {
    workspace,
    Uri: { file: uri },
    ProgressLocation: { Notification: 15 },
    commands: {
      registerCommand: (name, callback) => {
        commands.set(name, callback);
        return { dispose() {} };
      },
    },
    window: {
      createOutputChannel: () => ({
        append: (line) => logs.push(line),
        appendLine: (line) => logs.push(line),
        clear() {},
        show() {},
        dispose() {},
      }),
      withProgress: async (options, callback) =>
        callback(
          { report: (value) => reports.push(value) },
          {
            isCancellationRequested: false,
            onCancellationRequested: (handler) => {
              events.on("cancel", handler);
              return { dispose: () => events.off("cancel", handler) };
            },
          },
        ),
      showErrorMessage: async (value) => errors.push(value),
      showWarningMessage: async (value) => warnings.push(value),
      showInformationMessage: async () => undefined,
    },
  };
  const selection = [
      { schema: "Pets", name: "Fish", kind: "class", path: "Fish.cls" },
    ],
    resolved = {
      folder,
      destination: root,
      selection,
      config: {
        databasePath: path.join(root, "source"),
        workspaceRoots: [root],
      },
    };
  const index = {
    pauseDiskUpdates: async () => {
      bulk = true;
      return async () => {
        bulk = false;
      };
    },
    schedule: (value) => scheduled.add(value),
  };
  const service = {
    sourceCapabilities: async () => ({
      sourceExtraction: {
        protocol: 1,
        scopes: ["classes"],
        fullSchema: false,
        requiresPromotionPermit: true,
        versions: ["current"],
      },
    }),
    startSourceExtraction: (config, input, callbacks) => {
      let stop = false;
      const operation = {
        started: true,
        stop: () => {
          stop = true;
        },
        completion: Promise.resolve().then(() =>
          produce({
            callbacks,
            doc,
            events,
            input,
            bulk: () => bulk,
            refreshes,
            stopped: () => stop,
          }),
        ),
      };
      return operation;
    },
  };
  const options = {
    service,
    index,
    testing: { discover: async (rescan) => refreshes.push(["tests", rescan]) },
    classView: { refresh: async (value) => refreshes.push(["classes", value]) },
    beforeOperation: async () => {},
    isBusy: () => busy,
    setBusy: async (value) => {
      busy = value;
    },
    settings: () => ({}),
    resolve: async () => resolved,
    now: () => 1000,
  };
  const controller = registerSourcePull(
    vscode,
    {
      subscriptions: [],
      globalStorageUri: { fsPath: path.join(root, "global") },
    },
    options,
  );
  t.after(() => controller.dispose());
  return {
    controller,
    commands,
    reports,
    logs,
    errors,
    warnings,
    scheduled,
    refreshes,
    doc,
    events,
    root,
    bulk: () => bulk,
    busy: () => busy,
    resolved,
    service,
  };
}
const file = (path, outcome) => ({
  path,
  outcome,
  sha256: "a".repeat(64),
  bytes: 12,
});
const result = (values = {}) => ({
  passed: true,
  code: 0,
  status: "completed",
  scope: "classes",
  version: "current",
  authoritative: false,
  partial: false,
  counts: { updated: 1 },
  completedFiles: 1,
  ...values,
});
test("public command invokes native streaming with live permission and one boundary refresh", async (t) => {
  const f = fixture(t, async (state) => {
    state.callbacks.onStarted({ scope: "classes", authoritative: false });
    assert.equal(state.bulk(), true);
    assert.equal(state.callbacks.onPermit({ path: "Fish.cls" }), true);
    state.callbacks.onFile(file("Fish.cls", "updated"));
    assert.equal(state.refreshes.length, 0);
    return result();
  });
  const value = await f.commands.get(
    "jadeNative.pullSelectedClassFromSource",
  )();
  assert.equal(value.passed, true);
  assert.equal(f.bulk(), false);
  assert.equal(f.busy(), false);
  assert.equal(f.refreshes.length, 2);
  assert.equal(f.refreshes[0][0], "tests");
  assert.equal(f.refreshes[0][1], false);
  assert.equal(f.refreshes[1][1].rescan, false);
  assert.equal(f.scheduled.size, 1);
  assert.deepEqual(f.errors, []);
});
test("late dirty edit cancels and partial failure still refreshes scope before unlocking", async (t) => {
  const f = fixture(t, async (state) => {
    state.callbacks.onStarted({ scope: "classes", authoritative: false });
    assert.equal(state.callbacks.onPermit({ path: "Fish.cls" }), true);
    state.doc.isDirty = true;
    state.events.emit("change", { document: state.doc });
    assert.equal(state.stopped(), true);
    return result({
      passed: false,
      code: 130,
      status: "cancelled",
      partial: false,
      counts: {},
      completedFiles: 0,
    });
  });
  const value = await f.controller.run();
  assert.equal(value.status, "cancelled");
  assert.equal(f.scheduled.size, 1);
  assert.equal(f.refreshes.length, 2);
  assert.equal(f.bulk(), false);
  assert.equal(f.busy(), false);
});
test("unsupported native capability fails without invoking batch export or touching source", async (t) => {
  let invoked = false;
  const f = fixture(t, async () => {
    invoked = true;
    return result();
  });
  f.service.sourceCapabilities = async () => ({});
  const value = await f.controller.run();
  assert.equal(value.passed, false);
  assert.equal(invoked, false);
  assert.match(f.errors[0], /stream|CLI|update/i);
  assert.equal(f.refreshes.length, 0);
  assert.equal(f.busy(), false);
});
test("local conflicts are retained with useful guidance rather than advertised as an update", async (t) => {
  const f = fixture(t, async (state) => {
    state.callbacks.onStarted({ scope: "classes", authoritative: false });
    state.callbacks.onFile(file("Fish.cls", "conflict"));
    return result({
      passed: false,
      code: 4,
      partial: true,
      counts: { conflict: 1 },
    });
  });
  const value = await f.controller.run();
  assert.equal(value.code, 4);
  assert.match(f.warnings.join("\n"), /conflict|retained|local/i);
  assert.equal(f.scheduled.size, 0);
  assert.equal(f.refreshes.length, 2);
});

test("30k per-file outcomes coalesce UI and editor refresh without logging every update", async (t) => {
  const f = fixture(t, async (state) => {
    state.callbacks.onStarted({ scope: "classes", authoritative: false });
    for (const item of state.input.selection) {
      assert.equal(state.callbacks.onPermit({ path: item.path }), true);
      state.callbacks.onFile(file(item.path, "updated"));
    }
    assert.equal(state.refreshes.length, 0);
    return result({ counts: { updated: 30000 }, completedFiles: 30000 });
  });
  f.resolved.selection = Array.from({ length: 30000 }, (_, i) => ({
    schema: "Pets",
    name: "Class" + i,
    kind: "class",
    path: "types/Class" + i + ".cls",
  }));
  const value = await f.controller.run();
  assert.equal(value.passed, true);
  assert.equal(f.refreshes.length, 2);
  assert.equal(f.scheduled.size, 30000);
  assert.ok(f.reports.length <= 4);
  assert.ok(f.logs.length < 30);
});

test("unacknowledged native completion refreshes scope and reports uncertainty instead of zero writes", async (t) => {
  const f = fixture(t, async () =>
    result({
      passed: false,
      code: 2,
      status: "failed",
      partial: true,
      counts: {},
      completedFiles: 0,
      report: {
        outcomesUncertain: true,
        error: "Native child closed before completion",
      },
    }),
  );
  const value = await f.controller.run();
  assert.equal(value.passed, false);
  assert.equal(f.scheduled.size, 1);
  assert.equal(f.refreshes.length, 2);
  assert.match(
    f.warnings.join("\n"),
    /before confirmation|may already have changed/,
  );
  assert.match(f.logs.join("\n"), /acknowledged|uncertain/);
});
