"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { registerClassView } = require("../extension/src/class-view"),
  { SourceIndex } = require("../extension/src/workspace-index");
function fixture(schema, owner, value) {
  return `schemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf Object transient;\ntypeDefinitions\n${owner} completeDefinition\n(\nattributeDefinitions\n name: String;\njadeMethodDefinitions\n getName() : String;\n)\ntypeSources\n${owner} (\njadeMethodSources\ngetName\n{\ngetName() : String;\nbegin\n return "${value}";\nend;\n}\n)`;
}
function setup() {
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
      workspaceFolders: [],
      getWorkspaceFolder: () => undefined,
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
    api = registerClassView(vscode, context, { index });
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
test("class member tree identities remain stable when preceding source text shifts", async () => {
  const s = setup();
  try {
    const schemas = await s.api.provider.getChildren(),
      pets = schemas.find((row) => row.name === "Pets"),
      cls = (await s.api.provider.getChildren(pets))[0],
      group = (await s.api.provider.getChildren(cls)).find(
        (g) => g.label === "Methods",
      ),
      before = group.items[0],
      id = s.api.provider.getTreeItem(before).id;
    s.first.text = "// inserted comment\n" + s.first.text;
    s.index.document(s.first);
    const nextClass = (await s.api.provider.getChildren(pets))[0],
      next = (await s.api.provider.getChildren(nextClass)).find(
        (g) => g.label === "Methods",
      ).items[0];
    assert.notEqual(next.selection, before.selection);
    assert.equal(s.api.provider.getTreeItem(next).id, id);
    const other = (
      await s.api.provider.getChildren(
        schemas.find((row) => row.name === "Other"),
      )
    )[0];
    assert.notEqual(
      s.api.provider.getTreeItem(other).id,
      s.api.provider.getTreeItem(nextClass).id,
    );
  } finally {
    s.dispose();
  }
});
test('source lookup cannot fall through to another project when runtime context names a project',async()=>{
 const s=setup();try{
   const first={uri:s.vscode.Uri.file('/workspace/arbitrary'),name:'One'},second={uri:s.vscode.Uri.file('/workspace/different'),name:'Two'};
   s.vscode.workspace.workspaceFolders=[first,second];
   s.vscode.workspace.getWorkspaceFolder=uri=>uri.fsPath.startsWith(first.uri.fsPath)?first:second;
   const result=await s.commands.get('jadeNative.findSourceClass')('Fish','Pets',second.uri.fsPath);
   assert.equal(result.opened,false);assert.equal(s.panels.length,0);
 }finally{s.dispose();}
});
test('method-only edits retain the warm class catalogue instead of rebuilding and sorting it',async()=>{
 const s=setup();try{
   await s.api.syncBrowser();const before=s.api.browser.rows;
   s.first.text=s.first.text.replace('"one"','"changed"');s.first.version=2;s.index.document(s.first);
   await s.api.syncBrowser();assert.equal(s.api.browser.rows,before);
   assert.equal(s.api.browser.rows.find(row=>row.schema==='Pets').entries[0].model.text,s.first.text);
 }finally{s.dispose();}
});
test('Open Original Source without a tree argument uses the active class workspace',async()=>{
 const s=setup();try{
   const schema=(await s.api.provider.getChildren()).find(row=>row.name==='Pets');
   const row=(await s.api.provider.getChildren(schema))[0];
   await s.commands.get('jadeNative.openClassWorkspace')(row);
   await s.commands.get('jadeNative.openOriginalSource')();
   assert.equal(s.vscode.window.activeTextEditor.document.uri.toString(),s.first.uri.toString());
 }finally{s.dispose();}
});
test("two schema-qualified member previews both update after interleaved unsaved edits", async () => {
  const s = setup();
  try {
    const roots = await s.api.provider.getChildren(),
      rows = [];
    for (const schema of roots) {
      const cls = (await s.api.provider.getChildren(schema))[0],
        group = (await s.api.provider.getChildren(cls)).find(
          (g) => g.label === "Methods",
        );
      rows.push(group.items[0]);
    }
    const previews = [];
    for (const row of rows) {
      await s.commands.get("jadeNative.previewClassMember")(row);
      previews.push(s.panels.at(-1));
    }
    assert.notEqual(previews[0].title, previews[1].title);
    s.first.text = s.first.text.replace('"one"', '"changed one"');
    s.index.document(s.first);
    s.changes.fire({ document: s.first,contentChanges:[] });
    s.second.text = s.second.text.replace('"two"', '"changed two"');
    s.index.document(s.second);
    s.changes.fire({ document: s.second,contentChanges:[] });
    for (
      let i = 0;
      i < 25 &&
      (!previews.some((p) => JSON.stringify(p.messages).includes("changed one")) ||
        !previews.some((p) => JSON.stringify(p.messages).includes("changed two")));
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(previews.some((p) => JSON.stringify(p.messages).includes("changed one")));
    assert.ok(previews.some((p) => JSON.stringify(p.messages).includes("changed two")));
  } finally {
    s.dispose();
  }
});
test("clicking a method or property opens its focused preview while explicit original navigation stays available", async () => {
  const s = setup();
  try {
    const schema = (await s.api.provider.getChildren()).find(
        (row) => row.name === "Pets",
      ),
      cls = (await s.api.provider.getChildren(schema))[0],
      groups = await s.api.provider.getChildren(cls);
    assert.equal(s.api.provider.getTreeItem(cls).command.command, 'jadeNative.openClassWorkspace');
    for (const label of ["Methods", "Properties"]) {
      const row = groups.find((group) => group.label === label).items[0],
        item = s.api.provider.getTreeItem(row);
      assert.equal(item.command.command, "jadeNative.previewClassMember");
      await s.vscode.commands.executeCommand(
        item.command.command,
        ...item.command.arguments,
      );
      const preview = s.panels.at(-1);
      assert.equal(preview.type, "jade.classWorkspace");
      assert.ok(!preview.webview.html.includes('typeHeaders'));
      await s.commands.get("jadeNative.openOriginalSource")(row);
      assert.equal(
        s.vscode.window.activeTextEditor.document.uri.toString(),
        s.first.uri.toString(),
      );
    }
  } finally {
    s.dispose();
  }
});
test("large source schemas render at most100 class rows, replace pages and reveal exact off-page classes without loading all rows", async () => {
  const s = setup();
  try {
    await s.index.ready();
    for (let i = 0; i < 250; i++) {
      const owner = "Type" + String(i).padStart(5, "0"),
        uri = s.vscode.Uri.from({
          scheme: "file",
          path: "/workspace/" + owner + ".cls",
        }),
        doc = s.doc(uri, fixture("Large", owner, "v"));
      s.index.document(doc);
    }
    const schema = (await s.api.provider.getChildren()).find(
      (row) => row.name === "Large",
    );
    let rows = await s.api.provider.getChildren(schema);
    assert.equal(rows.filter((row) => row.kind === "class").length, 100);
    const firstId = s.api.provider.getTreeItem(
        rows.find((row) => row.kind === "class"),
      ).id,
      next = rows.find((row) => row.kind === "classPage" && row.offset === 100);
    assert.ok(next);
    await s.commands.get("jadeNative.pageSourceClasses")(next);
    rows = await s.api.provider.getChildren(schema);
    assert.equal(rows.filter((row) => row.kind === "class").length, 100);
    assert.equal(rows.find((row) => row.kind === "class").name, "Type00100");
    assert.notEqual(
      s.api.provider.getTreeItem(rows.find((row) => row.kind === "class")).id,
      firstId,
    );
    await s.commands.get("jadeNative.findSourceClass")("Type00249", "Large");
    rows = await s.api.provider.getChildren(schema);
    assert.equal(rows.filter((row) => row.kind === "class").length, 50);
    assert.ok(rows.some((row) => row.name === "Type00249"));
    assert.ok(rows.length < 105);
  } finally {
    s.dispose();
  }
});
test("source catalogue searches every class with bounded rows and opens an exact off-page class in the lazy tree", async () => {
  const s = setup();
  try {
    await s.index.ready();
    for (let i = 0; i < 250; i++) {
      const owner = "GridType" + String(i).padStart(5, "0"),
        uri = s.vscode.Uri.from({
          scheme: "file",
          path: "/workspace/" + owner + ".cls",
        }),
        doc = s.doc(uri, fixture("Grid", owner, "v"));
      s.index.document(doc);
    }
    await s.commands.get("jadeNative.browseSourceClasses")();
    assert.equal(s.api.catalogue.snapshot().page.items.length, 100);
    assert.ok(
      s.api.catalogue
        .snapshot()
        .page.items.every((row) => row.entries === undefined),
    );
    await s.api.catalogue.setFilter({ query: "GridType00249", schema: "Grid" });
    const page = s.api.catalogue.snapshot().page;
    assert.equal(page.total, 1);
    await s.api.catalogue.open(page.items[0].browserId);
    const schema = (await s.api.provider.getChildren()).find(
        (row) => row.name === "Grid",
      ),
      rows = await s.api.provider.getChildren(schema);
    assert.ok(rows.some((row) => row.name === "GridType00249"));
    assert.ok(rows.filter((row) => row.kind === "class").length <= 100);
    assert.equal(
      s.vscode.window.activeTextEditor,
      undefined,
      "Opening a catalogue class reveals its tree rather than opening the full CLS.",
    );
  } finally {
    s.dispose();
  }
});
