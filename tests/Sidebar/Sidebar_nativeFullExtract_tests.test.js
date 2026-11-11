"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { EventEmitter } = require("node:events");
const { registerSidebar } = require("../../extension/src/sidebar"),
  {
    SourcePullController,
  } = require("../../extension/src/SourcePullController");
function fixture(t, { full = true, dirty = false } = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "jade-full-extract-command-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  const uri = (file) => ({
      scheme: "file",
      fsPath: file,
      toString: () => "file:///" + file,
    }),
    folder = { name: "Empty project", uri: uri(workspace) },
    commands = new Map(),
    events = new EventEmitter(),
    logs = [],
    reports = [],
    refresh = [],
    scheduled = new Set();
  let busy = false,
    invocations = 0,
    gotInput;
  const documents = dirty
    ? [{ uri: uri(path.join(workspace, "schemas/Pets.scm")), isDirty: true }]
    : [];
  const ws = {
    workspaceFolders: [folder],
    textDocuments: documents,
    getWorkspaceFolder: (value) =>
      path.resolve(value.fsPath).startsWith(workspace) ? folder : undefined,
  };
  for (const [method, event] of [
    ["onDidOpenTextDocument", "open"],
    ["onDidChangeTextDocument", "change"],
    ["onDidCloseTextDocument", "close"],
    ["onDidChangeWorkspaceFolders", "folders"],
  ])
    ws[method] = (cb) => {
      events.on(event, cb);
      return { dispose: () => events.off(event, cb) };
    };
  const vscode = {
    workspace: ws,
    Uri: { file: uri },
    ProgressLocation: { Notification: 15 },
    commands: {
      registerCommand: (name, cb) => {
        commands.set(name, cb);
        return { dispose() {} };
      },
    },
    window: {
      createOutputChannel: () => ({
        appendLine: (line) => logs.push(line),
        append: (line) => logs.push(line),
        clear() {},
        show() {},
        dispose() {},
      }),
      showErrorMessage: async (text) => logs.push(text),
      showWarningMessage: async (text) => logs.push(text),
      showInformationMessage: async (text) => logs.push(text),
      withProgress: async (_opts, cb) =>
        cb(
          { report: (value) => reports.push(value) },
          {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose() {} }),
          },
        ),
    },
  };
  const service = {
    sourceCapabilities: async () => ({
      sourceExtraction: {
        protocol: 1,
        fullSchema: full,
        scopes: full ? ["classes", "schemas", "all"] : ["classes"],
        versions: ["current"],
        requiresPromotionPermit: true,
        available: true,
      },
    }),
    startSourceExtraction: (config, input, cb) => {
      invocations++;
      gotInput = { config, input };
      return {
        stop() {},
        completion: Promise.resolve().then(() => {
          cb.onStarted({ scope: "all", authoritative: false });
          cb.onStage({ stage: "inventory", completedFiles: 0, totalFiles: 2 });
          const counts = {};
          for (const [file, artifact] of [
            [
              "schemas/Pets.scm",
              { schema: "Pets", kind: "schema", component: "section" },
            ],
            [
              "schemas/Pets/types/Fish.cls",
              {
                schema: "Pets",
                kind: "class",
                name: "Fish",
                component: "source",
              },
            ],
          ]) {
            const allow = cb.onPermit({ path: file, artifact });
            counts[allow ? "added" : "rejected"] =
              (counts[allow ? "added" : "rejected"] || 0) + 1;
            if (allow) {
              const target = path.join(workspace, file);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, "native-owned test fixture");
            }
            cb.onFile({
              path: file,
              artifact,
              sha256: "a".repeat(64),
              bytes: 25,
              outcome: allow ? "added" : "rejected",
            });
          }
          return {
            passed: !counts.rejected,
            code: counts.rejected ? 4 : 0,
            status: "completed",
            scope: "all",
            version: "current",
            authoritative: !counts.rejected,
            partial: !!counts.rejected,
            counts,
            completedFiles: 2,
          };
        }),
      };
    },
  };
  const context = {
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => {} },
      globalStorageUri: { fsPath: path.join(root, "storage") },
    },
    services = {
      service,
      index: {
        pauseDiskUpdates: async () => async () => {},
        schedule: (value) => scheduled.add(value),
      },
      testing: { discover: async () => refresh.push("tests") },
      classView: { refresh: async () => refresh.push("classes") },
      beforeOperation: async () => {},
      isBusy: () => busy,
      setBusy: async (value) => {
        busy = value;
      },
      settings: () => ({
        installPath: path.join(root, "runtime"),
        databasePath: path.join(root, "source"),
        program: "must-not-read.cls",
        extractionDirectory: ".",
      }),
    };
  const controller = new SourcePullController(vscode, context, services);
  t.after(() => controller.dispose());
  registerSidebar(vscode, context, {
    ...services,
    streamAllSources: (selected) => controller.runAll(selected),
  });
  return {
    workspace,
    folder,
    commands,
    logs,
    reports,
    refresh,
    scheduled,
    input: () => gotInput,
    invocations: () => invocations,
  };
}
test("actual Extract All command fills an empty folder through native all scope without a CLS", async (t) => {
  const f = fixture(t);
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(f.invocations(), 1);
  assert.equal(f.input().input.scope, "all");
  assert.equal(f.input().input.selection, undefined);
  assert.equal(f.input().input.schemas, undefined);
  assert.equal(f.input().config.program, undefined);
  assert.ok(fs.existsSync(path.join(f.workspace, "schemas/Pets.scm")));
  assert.ok(
    fs.existsSync(path.join(f.workspace, "schemas/Pets/types/Fish.cls")),
  );
  assert.equal(f.refresh.length, 2);
  assert.equal(f.scheduled.size, 2);
  assert.ok(f.reports.every((x) => !x.message.includes("0/0")));
});
test("selected-only CLI is refused before full extraction changes an empty folder", async (t) => {
  const f = fixture(t, { full: false });
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, false);
  assert.equal(f.invocations(), 0);
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  assert.match(f.logs.join("\n"), /full|schema|update/i);
});
test("dirty schema header gets a per-file veto while other native files can proceed", async (t) => {
  const f = fixture(t, { dirty: true });
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, false);
  assert.equal(result.counts.rejected, 1);
  assert.equal(result.counts.added, 1);
  assert.equal(
    fs.existsSync(path.join(f.workspace, "schemas/Pets.scm")),
    false,
  );
  assert.ok(
    fs.existsSync(path.join(f.workspace, "schemas/Pets/types/Fish.cls")),
  );
  assert.equal(f.refresh.length, 2);
});
