"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { registerObjectExplorer } = require("../extension/src/object-explorer");
const oid = (n) => n.toString(16).padStart(44, "0");
function setup({ delayedBusy = false, authentication = false, nativeTarget = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-object-ui-")),
    commands = new Map(),
    panels = [],
    clients = [],
    changes = [],
    configFiles = [],
    errors = [],
    copied = [],
    sessionData = [],
    prompts = [];
  let busy = false,
    allowBusy;
  const uri = (file) => ({
      scheme: "file",
      fsPath: file,
      toString: () => file,
    }),
    folder = { name: "source", uri: uri(path.join(root, "source")) };
  fs.mkdirSync(folder.uri.fsPath);
  class Emitter {
    constructor() {
      this.e = new EventEmitter();
      this.event = (fn) => {
        this.e.on("value", fn);
        return { dispose: () => this.e.off("value", fn) };
      };
    }
    fire(v) {
      this.e.emit("value", v);
    }
    dispose() {
      this.e.removeAllListeners();
    }
  }
  const disposable = { dispose() {} },
    view = { dispose() {}, reveal: async () => {} },
    vscode = {
      EventEmitter: Emitter,
      ThemeIcon: class {
        constructor(name) {
          this.name = name;
        }
      },
      TreeItem: class {
        constructor(label, state) {
          this.label = label;
          this.collapsibleState = state;
        }
      },
      TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
      StatusBarAlignment: { Left: 1 },
      ViewColumn: { Active: 1 },
      Uri: { file: uri },
      env: { clipboard: { writeText: async (text) => copied.push(text) } },
      window: {
        activeTextEditor: {
          document: { uri: uri(path.join(folder.uri.fsPath, "Fish.cls")) },
        },
        createOutputChannel: () => ({
          append() {},
          appendLine() {},
          dispose() {},
        }),
        createStatusBarItem: () => ({ show() {}, dispose() {} }),
        createTreeView: () => view,
        showQuickPick: async () => ({ target: "source" }),
        showInputBox: async (options) => {
          prompts.push(options);
          return options.password ? "private-password" : "developer";
        },
        showErrorMessage: async (message) => {
          errors.push(message);
        },
        createWebviewPanel: () => {
          let receive, dispose;
          const panel = {
            webview: {
              cspSource: "vscode-resource:",
              asWebviewUri: (u) => u.fsPath,
              postMessage: async (m) => {
                panel.messages.push(m);
                if (m.command === "object")
                  queueMicrotask(() => receive?.({ command: "rendered" }));
                return true;
              },
              onDidReceiveMessage: (fn) => {
                receive = fn;
                return disposable;
              },
            },
            messages: [],
            onDidDispose: (fn) => (dispose = fn),
            reveal() {},
            dispose() {
              dispose?.();
            },
            receive: async (m) => {
              receive(m);
              await new Promise((r) => setImmediate(r));
            },
          };
          panels.push(panel);
          return panel;
        },
      },
      workspace: {
        workspaceFolders: [folder],
        getWorkspaceFolder: () => folder,
      },
      commands: {
        registerCommand: (name, fn) => {
          commands.set(name, fn);
          return disposable;
        },
        executeCommand: async (name, ...args) => commands.get(name)?.(...args),
      },
    };
  const config = {
    installPath: "C:/Jade",
    databasePath: path.join(root, "database"),
    iniPath: path.join(root, "jade.ini"),
    server: "multiUser",
    schema: "Pets",
    storagePath: path.join(root, "storage"),
    workspaceRoots: [folder.uri.fsPath],
  };
  const context = {
    subscriptions: [],
    globalStorageUri: uri(path.join(root, "global")),
    extensionPath: root,
  };
  const controller = registerObjectExplorer(vscode, context, {
    config: () => config,
    inspectionTarget: async (config,selection) => ({...config,readOnly:true,selection,...(nativeTarget?{databasePath:path.join(root,'actual-native-working/system'),iniPath:path.join(root,'actual-native-working/working.ini'),server:'singleUser'}:{})}),
    workingLocation: async () => ({databasePath:path.join(root,'actual-native-working/system')}),
    isBusy: () => busy,
    setBusy: async (value) => {
      busy = value;
      changes.push(value);
      if (value && delayedBusy) await new Promise((r) => (allowBusy = r));
    },
    createTransport: (exe, file) => {
      configFiles.push(file);
      sessionData.push(JSON.parse(fs.readFileSync(file, "utf8")));
      const c = new EventEmitter();
      const denied = authentication && clients.length === 0;
      c.ready = denied
        ? Promise.reject(Object.assign(Error("Access denied"), { code: 1713 }))
        : Promise.resolve();
      c.closed = new Promise((r) => (c.closeResolve = r));
      c.stop = () => {
        c.stopCalled = true;
        if (denied) queueMicrotask(() => c.finishClose());
        return c.closed;
      };
      c.finishClose = () => {
        c.emit("close", 0);
        c.closeResolve(0);
      };
      c.requests = [];
      c.request = async (command, args) => {
        c.requests.push({ command, args });
        if (command === "catalog")
          return {
            schemas: [
              {
                name: "Pets",
                oid: oid(1),
                classes: [{ name: "Fish", schema: "Pets", oid: oid(2) }],
              },
              ...(args?.includeSystem
                ? [{ name: "RootSchema", oid: oid(900), classes: [] }]
                : []),
            ],
          };
        if (command === "instances") {
          const offset = args.cursor ? 100 : 0;
          return {
            items: Array.from({ length: 100 }, (_, i) => ({
              oid: oid(10 + i + offset),
              className: "Fish",
              schema: "Pets",
              label: "Fish " + (i + offset),
            })),
            cursor: args.cursor ? null : "next-100",
            hasMore: !args.cursor,
          };
        }
        if (command === "object")
          return {
            oid: args.oid,
            className: "Fish",
            schema: "Pets",
            collection: false,
            properties: [{ name: "name", type: "String", value: "Bubbles" }],
            readOnly: true,
          };
        return { readOnly: true };
      };
      clients.push(c);
      return c;
    },
  });
  return {
    vscode,
    controller,
    commands,
    panels,
    clients,
    changes,
    configFiles,
    errors,
    copied,
    sessionData,
    prompts,
    root,
    allowBusy: () => allowBusy?.(),
    busy: () => busy,
    setExternalBusy: (value) => (busy = value),
    async connect() {
      await commands.get("jadeNative.selectInspectionDatabase")();
      await commands.get("jadeNative.connectObjects")();
    },
    async cleanup() {
      for (const client of clients)
        if (
          client.stopCalled !== undefined ||
          controller.session.client === client
        )
          client.finishClose();
      await controller.releaseForOperation();
      for (const item of context.subscriptions) item.dispose?.();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('Working inspection uses the native resolved target even when no legacy JavaScript marker exists',async()=>{
 const s=setup({nativeTarget:true});
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(s.sessionData[0].databasePath,path.join(s.root,'actual-native-working/system'));assert.equal(s.sessionData[0].readOnly,true);}finally{await s.cleanup();}
});
test("build handoff waits for the native inspector process to close before releasing its database lock", async () => {
  const s = setup();
  try {
    await s.connect();
    assert.equal(s.controller.ownsLock(), true);
    let completed = false;
    const release = s.controller
      .releaseForOperation()
      .then(() => (completed = true));
    await Promise.resolve();
    assert.equal(s.clients[0].stopCalled, true);
    assert.equal(completed, false);
    assert.equal(s.busy(), true);
    s.clients[0].finishClose();
    await release;
    assert.equal(s.busy(), false);
    assert.equal(fs.existsSync(s.configFiles[0]), false);
  } finally {
    await s.cleanup();
  }
});
test("concurrent build handoffs both wait for the same closing native process", async () => {
  const s = setup();
  try {
    await s.connect();
    let first = false,
      second = false;
    const a = s.controller.releaseForOperation().then(() => (first = true)),
      b = s.controller.releaseForOperation().then(() => (second = true));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(first, false);
    assert.equal(second, false);
    assert.equal(s.busy(), true);
    s.clients[0].finishClose();
    await Promise.all([a, b]);
    assert.equal(s.busy(), false);
  } finally {
    await s.cleanup();
  }
});
test("configured empty workspaces can browse a database without searching for a CLS file", async () => {
  const s = setup();
  try {
    s.vscode.window.activeTextEditor = undefined;
    await s.connect();
    assert.equal(s.clients.length, 1);
    assert.equal(s.controller.ownsLock(), true);
    assert.equal(s.sessionData[0].readOnly, true);
  } finally {
    await s.cleanup();
  }
});
test("instance pages remain bounded and expose returning to the first native page", async () => {
  const s = setup();
  try {
    await s.connect();
    const schema = (await s.controller.provider.getChildren()).find(
        (r) => r.kind === "schema",
      ),
      cls = (await s.controller.provider.getChildren(schema))[0];
    let children = await s.controller.provider.getChildren(cls);
    assert.equal(children.filter((r) => r.kind === "object").length, 100);
    assert.equal(
      children.some((r) => r.name === "Fish 0"),
      true,
    );
    await s.commands.get("jadeNative.moreObjectInstances")(cls);
    children = await s.controller.provider.getChildren(cls);
    assert.equal(children.filter((r) => r.kind === "object").length, 100);
    assert.equal(
      children.some((r) => r.name === "Fish 0"),
      false,
    );
    assert.equal(
      children.some((r) => r.command === "jadeNative.firstObjectInstances"),
      true,
    );
  } finally {
    await s.cleanup();
  }
});
test("object panels identify the selected readonly database and invalidate data after a switch", async () => {
  const s = setup();
  try {
    await s.connect();
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const p = s.panels[0],
      data = p.messages.find((m) => m.command === "object");
    assert.equal(data.connection.name, "Source database");
    assert.equal(data.connection.readOnly, true);
    assert.match(p.webview.html, /Content-Security-Policy/);
    const switching = s.controller.session.select("working");
    s.clients[0].finishClose();
    await switching;
    assert.equal(p.messages.at(-1).command, "disconnected");
    assert.equal(s.controller.session.history.length, 0);
  } finally {
    await s.cleanup();
  }
});
test("cancel during connection setup cannot launch a helper or clear a subsequent compiler lock", async () => {
  const s = setup({ delayedBusy: true });
  try {
    await s.commands.get("jadeNative.selectInspectionDatabase")();
    const connecting = s.commands.get("jadeNative.connectObjects")();
    for (let i = 0; i < 10 && !s.controller.ownsLock(); i++)
      await Promise.resolve();
    assert.equal(s.controller.ownsLock(), true);
    await s.controller.releaseForOperation();
    s.setExternalBusy(true);
    s.allowBusy();
    await connecting;
    assert.equal(s.clients.length, 0);
    assert.equal(s.busy(), true);
  } finally {
    await s.cleanup();
  }
});
test("show system schemas requests a new native catalog with the selected scope", async () => {
  const s = setup();
  try {
    await s.connect();
    assert.equal(
      (await s.controller.provider.getChildren()).some(
        (r) => r.name === "RootSchema",
      ),
      false,
    );
    await s.commands.get("jadeNative.toggleSystemObjects")();
    assert.equal(
      (await s.controller.provider.getChildren()).some(
        (r) => r.name === "RootSchema",
      ),
      true,
    );
    assert.equal(
      s.clients[0].requests.filter((r) => r.command === "catalog").at(-1).args
        .includeSystem,
      true,
    );
  } finally {
    await s.cleanup();
  }
});
test("an older catalog response cannot overwrite a newer system-schema selection", async () => {
  const s = setup();
  try {
    await s.connect();
    let first, second;
    const client = s.clients[0],
      original = client.request;
    let count = 0;
    client.request = (command, args) =>
      command === "catalog"
        ? new Promise((resolve) => {
            if (++count === 1) first = resolve;
            else second = resolve;
          })
        : original(command, args);
    const on = s.commands.get("jadeNative.toggleSystemObjects")();
    for (let i = 0; i < 20 && !first; i++) await Promise.resolve();
    const off = s.commands.get("jadeNative.toggleSystemObjects")();
    for (let i = 0; i < 20 && !second; i++) await Promise.resolve();
    second({ schemas: [{ name: "Pets", oid: oid(1), classes: [] }] });
    await off;
    first({ schemas: [{ name: "JadeSystem", oid: oid(900), classes: [] }] });
    await on;
    assert.equal(
      (await s.controller.provider.getChildren()).some(
        (r) => r.name === "JadeSystem",
      ),
      false,
    );
  } finally {
    await s.cleanup();
  }
});
test("toggling subclasses invalidates an outstanding instance page and releases its stale cursor", async () => {
  const s = setup();
  try {
    await s.connect();
    const provider = s.controller.provider,
      schema = (await provider.getChildren()).find((r) => r.kind === "schema"),
      cls = (await provider.getChildren(schema))[0],
      client = s.clients[0],
      original = client.request;
    let resolve;
    client.request = (command, args) =>
      command === "instances" && !args.includeSubclasses
        ? new Promise((r) => (resolve = r))
        : original(command, args);
    const previous = provider.getChildren(cls);
    await s.commands.get("jadeNative.toggleObjectSubclasses")();
    resolve({
      items: [{ oid: oid(123), label: "Old page" }],
      cursor: "stale-cursor",
      hasMore: true,
    });
    await previous;
    const rows = await provider.getChildren(cls);
    assert.equal(
      rows.some((r) => r.name === "Old page"),
      false,
    );
    assert.ok(
      client.requests.some(
        (r) => r.command === "release" && r.args.cursor === "stale-cursor",
      ),
    );
  } finally {
    await s.cleanup();
  }
});
test("security policy denials are not misreported as database lock failures", async () => {
  const s = setup();
  try {
    await s.connect();
    s.clients[0].request = async () => {
      throw Error(
        "A DevelopmentSecurityLibrary is configured. Inspection is blocked until native authentication is supported.",
      );
    };
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    assert.match(s.errors[0], /DevelopmentSecurityLibrary/);
    assert.doesNotMatch(s.errors[0], /database may already be open/);
  } finally {
    await s.cleanup();
  }
});
test("copy controls copy known object values rather than arbitrary webview payloads", async () => {
  const s = setup();
  try {
    await s.connect();
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const panel = s.panels[0];
    await panel.receive({ command: "copyOid" });
    assert.equal(s.copied.at(-1), oid(10));
    await panel.receive({
      command: "copyValue",
      section: "properties",
      index: 0,
      text: "injected",
    });
    assert.equal(s.copied.at(-1), "Bubbles");
    const count = s.copied.length;
    await panel.receive({
      command: "copyValue",
      section: "properties",
      index: 999,
    });
    assert.equal(s.copied.length, count);
  } finally {
    await s.cleanup();
  }
});
test("a slow collection response cannot replace details after navigation to another object", async () => {
  const s = setup();
  try {
    await s.connect();
    const client = s.clients[0],
      original = client.request;
    let resolve;
    client.request = (command, args) =>
      command === "object" && args.oid === oid(10)
        ? Promise.resolve({
            oid: oid(10),
            schema: "Pets",
            className: "OldCollection",
            collection: true,
            properties: [],
          })
        : command === "collection"
          ? new Promise((r) => (resolve = r))
          : original(command, args);
    const first = s.commands.get("jadeNative.inspectObject")(oid(10));
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    assert.ok(resolve);
    await s.commands.get("jadeNative.inspectObject")(oid(20));
    resolve({
      items: [{ index: 1, value: "old collection data" }],
      hasMore: false,
      cursor: null,
    });
    await first;
    const latest = s.panels[0].messages
      .filter((m) => m.command === "object")
      .at(-1);
    assert.equal(latest.object.oid, oid(20));
    assert.equal(latest.page, undefined);
    assert.match(s.panels[0].title, /Fish/);
  } finally {
    await s.cleanup();
  }
});

test("collection paging is bounded, deduplicated and cannot overwrite newer navigation", async () => {
  const s = setup();
  try {
    await s.connect();
    const client = s.clients[0],
      original = client.request;
    let resolve,
      requests = 0;
    client.request = (command, args) =>
      command === "object" && args.oid === oid(10)
        ? Promise.resolve({
            oid: oid(10),
            schema: "Pets",
            className: "Items",
            collection: true,
            properties: [],
          })
        : command === "collection"
          ? ++requests === 1
            ? Promise.resolve({
                items: [{ index: 1, value: "first" }],
                cursor: "page1",
                hasMore: true,
              })
            : new Promise((r) => (resolve = r))
          : original(command, args);
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const panel = s.panels[0];
    const first = panel.receive({ command: "next" }),
      duplicate = panel.receive({ command: "next" });
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    assert.equal(requests, 2);
    await s.commands.get("jadeNative.inspectObject")(oid(20));
    resolve({
      items: [{ index: 2, value: "stale" }],
      cursor: "stale-page",
      hasMore: true,
    });
    await Promise.all([first, duplicate]);
    const latest = panel.messages.filter((m) => m.command === "object").at(-1);
    assert.equal(latest.object.oid, oid(20));
    assert.equal(latest.page, undefined);
    assert.ok(
      client.requests.some(
        (r) => r.command === "release" && r.args.cursor === "stale-page",
      ),
    );
  } finally {
    await s.cleanup();
  }
});
test("ephemeral native session files are removed after readiness", async () => {
  const s = setup();
  try {
    await s.connect();
    assert.equal(fs.existsSync(s.configFiles[0]), false);
  } finally {
    await s.cleanup();
  }
});
test("native security sign-on retries once with a masked password and removes temporary credentials", async () => {
  const s = setup({ authentication: true });
  try {
    await s.connect();
    assert.equal(s.clients.length, 2);
    assert.equal(s.prompts.length, 2);
    assert.equal(s.prompts[1].password, true);
    assert.equal(s.sessionData[1].user, "developer");
    assert.equal(s.sessionData[1].password, "private-password");
    assert.ok(s.configFiles.every((file) => !fs.existsSync(file)));
    assert.equal(s.errors.length, 0);
  } finally {
    await s.cleanup();
  }
});
test("a slower object read cannot overwrite a later navigation", async () => {
  const s = setup();
  try {
    await s.connect();
    const client = s.clients[0],
      original = client.request;
    let resolve;
    client.request = (command, args) =>
      command === "object" && args.oid === oid(10)
        ? new Promise((r) => (resolve = r))
        : original(command, args);
    const previous = s.commands.get("jadeNative.inspectObject")(oid(10));
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    await s.commands.get("jadeNative.inspectObject")(oid(20));
    resolve({
      oid: oid(10),
      schema: "Pets",
      className: "OldFish",
      properties: [],
    });
    await previous;
    assert.equal(
      s.panels[0].messages.filter((m) => m.command === "object").at(-1).object
        .oid,
      oid(20),
    );
  } finally {
    await s.cleanup();
  }
});
