"use strict";
const { EventEmitter } = require("node:events");
const { registerClassView } = require("../../extension/src/class-view"),
  { SourceIndex } = require("../../extension/src/workspace-index");
function fixture(schema, owner, value) {
  return `schemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf Object transient;\ntypeDefinitions\n${owner} completeDefinition\n(\nattributeDefinitions\n name: String;\njadeMethodDefinitions\n getName() : String;\n)\ntypeSources\n${owner} (\njadeMethodSources\ngetName\n{\ngetName() : String;\nbegin\n return "${value}";\nend;\n}\n)`;
}
function setup({ready}={}) {
  class Uri {
    constructor(scheme, pathname, query = "") {
      this.scheme = scheme;
      this.path = pathname;
      this.fsPath = pathname;
      this.query = query;
    }
    toString() {
      return (
        this.scheme +
        "://" +
        encodeURI(this.path) +
        (this.query ? "?" + encodeURIComponent(this.query) : "")
      );
    }
    static parse(text) {
      const u = new URL(text);
      return new Uri(
        u.protocol.slice(0, -1),
        decodeURI(u.pathname),
        decodeURIComponent(u.search.slice(1)),
      );
    }
    static file(value) {
      return new Uri("file", value);
    }
    static joinPath(uri,...parts){return new Uri(uri.scheme,uri.path+'/'+parts.join('/'));}
    static from(value) {
      return new Uri(value.scheme, value.path, value.query);
    }
  }
  class Emitter {
    constructor() {
      this.e = new EventEmitter();
      this.event = (fn) => {
        this.e.on("value", fn);
        return { dispose: () => this.e.off("value", fn) };
      };
    }
    fire(value) {
      this.e.emit("value", value);
    }
    dispose() {
      this.e.removeAllListeners();
    }
  }
  const docs = new Map(),
    commands = new Map(),
    changes = new Emitter(),
    closes = new Emitter(),
    disposable = { dispose() {} };
  let contentProvider,customProvider;
  const panels=[];
  function doc(uri, text) {
    const value = {
      uri,
      fileName: uri.fsPath, version:1,
      text,
      getText() {
        return this.text;
      },
      positionAt(offset) {
        const lines = this.text.slice(0, offset).split("\n");
        return { line: lines.length - 1, character: lines.at(-1).length };
      },
    };
    docs.set(uri.toString(), value);
    return value;
  }
  const first = doc(
      new Uri("file", "/workspace/arbitrary/First.cls"),
      fixture("Pets", "Fish", "one"),
    ),
    second = doc(
      new Uri("file", "/workspace/different/Second.cls"),
      fixture("Other", "Fish", "two"),
    );
  const index = new SourceIndex({
    list: async () => [first.uri.toString(), second.uri.toString()],
    read: async (uri) => docs.get(uri).getText(),
  });
  const vscode = {
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
    Range: class {
      constructor(start, end) {
        this.start = start;
        this.end = end;
      }
    },
    Selection: class {
      constructor(start, end) {
        this.start = start;
        this.end = end;
      }
    },
    TextEditorRevealType: { InCenterIfOutsideViewport: 1 },
    ViewColumn: { Active: 1, Beside: 2 },
    Uri,
    workspace: {
      fs:{isWritableFileSystem:()=>true},
      findFiles: async () => [],
      workspaceFolders: [{name:'Workspace',uri:Uri.file('/workspace')}],
      getWorkspaceFolder: uri => uri.fsPath==='/workspace'||uri.fsPath.startsWith('/workspace/')?{name:'Workspace',uri:Uri.file('/workspace')}:undefined,
      registerTextDocumentContentProvider: (scheme, provider) => {
        contentProvider = provider;
        provider.onDidChange(async (uri) => {
          const open = docs.get(uri.toString());
          if (open) open.text = await provider.provideTextDocumentContent(uri);
        });
        return disposable;
      },
      openTextDocument: async (uri) => {
        const key = uri.toString();
        if (docs.has(key)) return docs.get(key);
        return doc(uri, await contentProvider.provideTextDocumentContent(uri));
      },
      onDidChangeTextDocument: changes.event,
      onDidCloseTextDocument: closes.event,
      onDidCreateFiles: () => disposable,
      onDidDeleteFiles: () => disposable,
      onDidChangeWorkspaceFolders: () => disposable,
      createFileSystemWatcher: () => ({
        dispose() {},
        onDidCreate: () => disposable,
        onDidChange: () => disposable,
        onDidDelete: () => disposable,
      }),
    },
    window: {
      registerCustomEditorProvider:(_type,provider)=>{customProvider=provider;return disposable;},
      createWebviewPanel: (type, title, column) => {
        let receive, dispose;
        const panel = {
          title,
          type,
          column,
          viewColumn:column,messages:[],
          active: true,
          webview: {
            cspSource: "vscode:",
            asWebviewUri: (uri) => uri,
            onDidReceiveMessage: (fn) => {
              receive = fn;
              queueMicrotask(() => fn({ command: "ready" }));
              return disposable;
            },
            postMessage: async (message) => {
              panel.messages.push(message);
              if (message.command === "member")
                queueMicrotask(() =>
                  receive({ command: "rendered", revision: message.revision }),
                );
              return true;
            },
          },
          onDidDispose: (fn) => {
            dispose = fn;
            return disposable;
          },
          onDidChangeViewState: () => disposable,
          receive: message => receive(message),
          reveal() {},
          dispose() {
            dispose?.();
          },
        };
        panels.push(panel);
        return panel;
      },
      createTreeView: () => ({ reveal: async () => {}, dispose() {} }),
      showTextDocument: async (document) => {
        if(!document.uri)document=docs.get(document.toString());
        const editor = { document, revealRange() {} };
        vscode.window.activeTextEditor = editor;
        return editor;
      },
      showQuickPick: async (options) => options[0],
    },
    languages: { setTextDocumentLanguage: async (doc) => doc,getDiagnostics:()=>[],onDidChangeDiagnostics:()=>disposable },
    commands: {
      registerCommand: (name, fn) => {
        commands.set(name, fn);
        return disposable;
      },
      executeCommand: async (name, ...args) => {
        if(name==='vscode.openWith'){
          const document=docs.get(args[0].toString()),panel=vscode.window.createWebviewPanel('jade.classWorkspace','Class workspace',args[2].viewColumn);
          await customProvider.resolveCustomTextEditor(document,panel);return;
        }
        return commands.get(name)(...args);
      },
    },
  };
  const stored=new Map();
  const context = { subscriptions: [], extensionPath: "/extension",extensionUri:Uri.file('/extension'),workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)} },
    api = registerClassView(vscode, context, { index, ready });
  return {
    api,
    index,
    commands,
    docs,
    first,
    second,
    vscode,
    changes,
    doc,
    panels,
    dispose() {
      for (const value of context.subscriptions) value.dispose?.();
      index.dispose();
    },
  };
}

module.exports={setup,fixture};
