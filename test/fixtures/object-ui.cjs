"use strict";
const { EventEmitter } = require("node:events"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { registerObjectExplorer } = require("../../extension/src/object-explorer");
const oid = (n) => n === 10 ? "51.1 (t)" : n === 20 ? "66.101.305.2.1" : `9002.${n}`;
function setup({ delayedBusy = false, authentication = false, nativeTarget = false, sourceContext, configError, pullSource, closeSubsequentAutomatically = false, projectScopedConfig = false, resolveInspectionTarget } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-object-ui-")),
    commands = new Map(),
    configCalls = [],
    statuses = [],
    panels = [],
    clients = [],
    changes = [],
    configFiles = [],
    errors = [],
    copied = [],
    sessionData = [],
    targetDisconnections = [],
    progressOperations = [],
    contexts = new Map(),
    prompts = [];
  let busy = false,
    allowBusy, configurationListener, saveListener;
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
      ProgressLocation: { Notification: 15 },
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
        withProgress: async (options, run) => {
          const reports = [], listeners = new Set();
          const operation = { options, reports, cancel: () => { for (const listener of listeners) listener(); } };
          progressOperations.push(operation);
          return run({ report: value => reports.push(value) }, { onCancellationRequested: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; } });
        },
        activeTextEditor: {
          document: { uri: uri(path.join(folder.uri.fsPath, "Fish.cls")) },
        },
        createOutputChannel: () => ({
          append() {},
          appendLine() {},
          dispose() {},
        }),
        createStatusBarItem: () => { const status={show(){},dispose(){}};statuses.push(status);return status; },
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
            onDidDispose: (fn) => { dispose=fn; return disposable; },
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
        onDidChangeConfiguration: fn => { configurationListener=fn; return disposable; },
        onDidSaveTextDocument: fn => { saveListener=fn; return disposable; },
        workspaceFolders: [folder],
        getWorkspaceFolder: () => folder,
      },
      commands: {
        registerCommand: (name, fn) => {
          commands.set(name, fn);
          return disposable;
        },
        executeCommand: async (name, ...args) => { if (name === 'setContext') contexts.set(args[0], args[1]); return commands.get(name)?.(...args); },
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
    sourceContext,
    pullSource,
    config: (doc, folder) => { configCalls.push({ doc, folder }); if (configError) throw Error(configError); return projectScopedConfig && folder ? {...config,workspaceRoots:[folder.uri.fsPath],databasePath:path.join(folder.uri.fsPath,"system")} : config; },
    inspectionTarget: async (config,selection,output) => { if(resolveInspectionTarget) return resolveInspectionTarget(config,selection,output); if(delayedBusy) await new Promise(r => allowBusy=r); return ({...config,readOnly:true,...(nativeTarget?{databasePath:path.join(root,'actual-native-working/system'),iniPath:path.join(root,'actual-native-working/working.ini'),server:'singleUser'}:{})}); },
    workingLocation: async () => ({databasePath:path.join(root,'actual-native-working/system')}),
    disconnectTarget: async (config,target) => { targetDisconnections.push({config,target}); },
    isBusy: () => busy,
    setBusy: async (value) => {
      busy = value;
      changes.push(value);
      if (value && delayedBusy) await new Promise((r) => (allowBusy = r));
    },
    createTransport: options => {
      sessionData.push({ ...options.config, target: options.target });
      const c = new EventEmitter();
      const denied = authentication && clients.length === 0;
      c.ready = denied
        ? Promise.reject(Object.assign(Error("Access denied"), { code: 1713 }))
        : Promise.resolve();
      c.closed = new Promise((r) => (c.closeResolve = r));
      c.stop = options => {
        c.stopOptions = options;
        c.stopCalled = true;
        if (denied || closeSubsequentAutomatically && clients.indexOf(c) > 0) queueMicrotask(() => c.finishClose());
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
    configCalls,
    statuses,
    panels,
    clients,
    changes,
    configFiles,
    errors,
    copied,
    sessionData,
    targetDisconnections,
    prompts,
    progressOperations,
    contexts,
    root,
    allowBusy: () => allowBusy?.(),
    changeConfiguration: event => configurationListener?.(event),
    saveConfiguration: file => saveListener?.({uri:uri(file)}),
    busy: () => busy,
    setExternalBusy: (value) => (busy = value),
    async connect() {
      await commands.get("jadeNative.selectInspectionDatabase")();
      await commands.get("jadeNative.connectObjects")();
    },
    disposeExtension() { for (const item of context.subscriptions) item.dispose?.(); },
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


module.exports={setup,oid};
