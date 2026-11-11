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
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: (cb) => {
      events.on("cancel", cb);
      return { dispose: () => events.off("cancel", cb) };
    },
    cancel() {
      this.isCancellationRequested = true;
      events.emit("cancel");
    },
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
        cb({ report: (value) => reports.push(value) }, token),
    },
  };
  const service = {
    sourceCapabilities: async () => ({
      sourceExtraction: {
        protocol: 1,
        fullSchema: full,
        layout: full ? "schema-ddx" : undefined,
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
          cb.onStarted({ scope: input.scope, authoritative: false });
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
            scope: input.scope,
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
    controller,
    token,
    services,
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
  assert.equal(f.scheduled.size, 1);
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

test("30k native all-scope outcomes coalesce presentation and final refresh", async (t) => {
  const f = fixture(t);
  f.services.service.startSourceExtraction = (_config, input, cb) => ({
    stop() {},
    completion: Promise.resolve().then(() => {
      assert.equal(input.scope, "all");
      cb.onStarted({ scope: "all", authoritative: false });
      cb.onStage({ stage: "inventory", completedFiles: 0, totalFiles: 30000 });
      for (let i = 0; i < 30000; i++) {
        const event = {
          path: "schemas/Pets/types/C" + i + ".cls",
          artifact: {
            schema: "Pets",
            kind: "class",
            name: "C" + i,
            component: "source",
          },
        };
        assert.equal(cb.onPermit(event), true);
        cb.onFile({
          ...event,
          sha256: "a".repeat(64),
          bytes: 10,
          outcome: "added",
        });
      }
      assert.equal(f.refresh.length, 0);
      return {
        passed: true,
        code: 0,
        status: "completed",
        scope: "all",
        version: "current",
        authoritative: true,
        partial: false,
        counts: { added: 30000 },
        completedFiles: 30000,
      };
    }),
  });
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, true);
  assert.equal(f.scheduled.size, 30000);
  assert.equal(f.refresh.length, 2);
  assert.ok(f.reports.length < 12);
  assert.ok(f.logs.length < 30);
  assert.deepEqual(fs.readdirSync(f.workspace), []);
});
test("unknown full native outcomes request one final rescan even with no acknowledged file", async (t) => {
  const f = fixture(t);
  let rescans = 0;
  f.services.index.rescan = async () => {
    rescans++;
  };
  f.services.service.startSourceExtraction = (_config, _input, cb) => ({
    stop() {},
    completion: Promise.resolve().then(() => {
      cb.onStarted({ scope: "all", authoritative: false });
      return {
        passed: false,
        code: 2,
        status: "failed",
        scope: "all",
        version: "current",
        authoritative: false,
        partial: true,
        counts: {},
        completedFiles: 0,
        report: { error: "Native completion missing", outcomesUncertain: true },
      };
    }),
  });
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, false);
  assert.equal(rescans, 1);
  assert.equal(f.refresh.length, 2);
  assert.match(f.logs.join("\n"), /acknowledged|uncertain/);
});

test("Extract All shows preparation progress before waiting for native capabilities", async (t) => {
  const f = fixture(t);
  const capabilities = f.services.service.sourceCapabilities;
  f.services.service.sourceCapabilities = async (...args) => {
    assert.ok(
      f.reports.some((value) => /Checking native/i.test(value.message)),
      "Do not leave the first connection/pull invisible",
    );
    return capabilities(...args);
  };
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, true, JSON.stringify(result));
});

test("a repeated Extract All click during preparation does not start a second native pull", async (t) => {
  const f = fixture(t),
    capabilities = f.services.service.sourceCapabilities;
  let release,
    doctors = 0;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  f.services.service.sourceCapabilities = async (...args) => {
    doctors++;
    await blocked;
    return capabilities(...args);
  };
  const first = f.commands.get("jadeNative.extractAllSources")(f.folder.uri);
  await new Promise(setImmediate);
  const repeated = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(repeated.passed, false);
  assert.match(repeated.report.error, /already preparing|already running/);
  assert.equal(doctors, 1);
  release();
  assert.equal((await first).passed, true);
  assert.equal(f.invocations(), 1);
});
test("cancelling preparation never starts native extraction and releases the local operation guard", async (t) => {
  const f = fixture(t),
    capabilities = f.services.service.sourceCapabilities;
  f.services.service.sourceCapabilities = async (...args) => {
    f.token.cancel();
    return capabilities(...args);
  };
  const value = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(value.status, "cancelled");
  assert.equal(value.code, 130);
  assert.equal(f.invocations(), 0);
  assert.deepEqual(fs.readdirSync(f.workspace), []);
  f.token.isCancellationRequested = false;
  f.services.service.sourceCapabilities = capabilities;
  assert.equal(
    (await f.commands.get("jadeNative.extractAllSources")(f.folder.uri)).passed,
    true,
  );
});

test("post-native index refresh is labelled separately instead of keeping a native stage visible", async (t) => {
  const f = fixture(t);
  let refreshMessage;
  f.services.testing.discover = async () => {
    refreshMessage = f.reports.at(-1).message;
  };
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, true);
  assert.match(refreshMessage, /Refreshing source indexes and editor views/);
  assert.match(f.logs.join("\n"), /Editor refresh: .* ms/);
});

test("full schema capability without the qualified aggregate layout is refused before changes", async (t) => {
  const f = fixture(t),
    capabilities = f.services.service.sourceCapabilities;
  f.services.service.sourceCapabilities = async (...args) => {
    const result = await capabilities(...args);
    delete result.sourceExtraction.layout;
    return result;
  };
  const result = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(result.passed, false);
  assert.equal(f.invocations(), 0);
  assert.deepEqual(fs.readdirSync(f.workspace), []);
});

test("named schema refresh keeps the explicit schema list in the native DTO", async (t) => {
  const f = fixture(t);
  const result = await f.controller.runSchemas(f.folder, ["Pets"]);
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(f.input().input.scope, "schemas");
  assert.deepEqual(f.input().input.schemas, ["Pets"]);
  assert.equal(result.scope, "schemas");
});

test("legacy individual DDX refusal stays actionable and never starts migration or replacement", async (t) => {
  const f = fixture(t);
  f.services.service.startSourceExtraction = () => ({
    stop() {},
    completion: Promise.resolve({
      passed: false,
      code: 2,
      status: "failed",
      scope: "all",
      version: "current",
      authoritative: false,
      partial: false,
      counts: {},
      completedFiles: 0,
      report: {
        reason: "schema-ddx-individual-migration-required",
        schema: "Pets",
        path: "schemas/Pets/types/Fish.ddx",
        error: "Legacy individual Form resources require a reviewed migration",
      },
    }),
  });
  const value = await f.commands.get("jadeNative.extractAllSources")(
    f.folder.uri,
  );
  assert.equal(value.code, 2);
  assert.match(
    f.logs.join("\n"),
    /reviewed migration.*no source files were changed/i,
  );
  assert.deepEqual(fs.readdirSync(f.workspace), []);
});

test("Open Last Extraction points to the captured native destination after a streamed pull", async (t) => {
  const f = fixture(t),
    revealed = [];
  f.controller.vscode.commands.executeCommand = async (name, uri) =>
    revealed.push({ name, uri });
  await f.commands.get("jadeNative.extractAllSources")(f.folder.uri);
  await f.commands.get("jadeNative.openLastExtraction")();
  assert.equal(revealed.length, 1);
  assert.equal(revealed[0].name, "revealInExplorer");
  assert.equal(revealed[0].uri.fsPath, f.workspace);
});
