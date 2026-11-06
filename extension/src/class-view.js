"use strict";
const path = require("node:path");
const { schemaFromSource } = require("./config");
const { isNestedSnapshot } = require("./source-snapshots");
const { classSections } = require("./class-view-model");
const { createSourceMemberPreviews } = require("./source-member-preview");
const { ClassBrowserModel } = require("./class-browser-model"),
  { pickClass } = require("./class-browser-ui");
const { registerClassCatalogue } = require("./class-catalogue");
function registerClassView(vscode, context, language) {
  const events = new vscode.EventEmitter(),
    pendingFiles = new Set(),
    parents = new WeakMap();
  let timer, resources, browserProject, browserGeneration;
  const browser = new ClassBrowserModel({ scope: "workspace", pageSize: 100 }),
    classPages = new Map(),
    classFilters = new Map();
  function changed(uri) {
    if (/\.(scm|sec|ddx)$/i.test(uri.fsPath)) resources = undefined;
    pendingFiles.add(uri.toString());
    clearTimeout(timer);
    timer = setTimeout(() => {
      events.fire();
      if (catalogue.panel) void catalogue.refresh().catch(() => {});
      void previewController.refresh([...pendingFiles]).catch(() => {});
      pendingFiles.clear();
    }, 60);
  }
  const source = async (uri) => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    return { doc, text: doc.getText() };
  };
  const previewController = createSourceMemberPreviews(vscode, context, {
    readSource: source,
    onOriginal: (row) =>
      vscode.commands.executeCommand("jadeNative.showClassMember", row),
  });
  const allClasses = () =>
    [...language.index.project.groups.values()]
      .map((entries) => ({
        kind: "class",
        name: entries[0].cls.name,
        schema: entries[0].model.schema,
        parent: entries[0].cls.parent,
        entries,
      }))
      .filter((c) => c.schema);
  async function syncBrowser() {
    await language.index.ready();
    await language.index.flush();
    const project = language.index.project;
    if (
      project !== browserProject ||
      project.generation !== browserGeneration
    ) {
      browser.setClasses(allClasses());
      browserProject = project;
      browserGeneration = project.generation;
    }
    return browser;
  }
  function classPage(schema) {
    return browser.page({
      schema,
      query: classFilters.get(schema) || "",
      offset: classPages.get(schema) || 0,
    });
  }
  async function schemaResources() {
    if (resources) return resources;
    resources = (async () => {
      const files = (
        await vscode.workspace.findFiles(
          "**/*.{scm,sec,ddx}",
          "**/{node_modules,.git}/**",
        )
      ).filter((uri) => !isNestedSnapshot(uri, vscode.workspace));
      const result = new Map(),
        headers = [];
      for (const uri of files.filter(
        (u) =>
          /\.scm$/i.test(u.fsPath) ||
          /[/\\]schemaDefinitions\.sec$/i.test(u.fsPath),
      )) {
        const { text } = await source(uri.toString()),
          name = schemaFromSource(text);
        if (!name) continue;
        const folder = /\.scm$/i.test(uri.fsPath)
          ? path.join(path.dirname(uri.fsPath), name)
          : path.dirname(uri.fsPath);
        headers.push({ name, folder, uri });
        result.set(name, [
          {
            kind: "resource",
            name: "Schema definition",
            schema: name,
            file: uri.toString(),
            detail: path.basename(uri.fsPath),
          },
        ]);
      }
      for (const uri of files) {
        if (headers.some((h) => h.uri.toString() === uri.toString())) continue;
        const match = headers
          .filter((h) => {
            const rel = path.relative(h.folder, uri.fsPath);
            return (
              rel !== ".." &&
              !rel.startsWith(".." + path.sep) &&
              !path.isAbsolute(rel)
            );
          })
          .sort((a, b) => b.folder.length - a.folder.length)[0];
        if (match)
          result.get(match.name).push({
            kind: "resource",
            name: path.basename(uri.fsPath),
            schema: match.name,
            file: uri.toString(),
            detail: path.relative(match.folder, uri.fsPath),
          });
      }
      return result;
    })().catch((error) => {
      resources = undefined;
      throw error;
    });
    return resources;
  }
  const provider = {
    onDidChangeTreeData: events.event,
    getTreeItem(row) {
      const expandable = ["schema", "class", "group"].includes(row.kind),
        item = new vscode.TreeItem(
          row.label || row.name,
          expandable
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        );
      item.id =
        row.id ||
        row.browserId ||
        [
          row.schema,
          row.owner || row.name,
          row.kind,
          row.name || "",
          row.label || "",
          row.file || "",
        ].join("::");
      item.description =
        row.kind === "schema"
          ? classPage(row.schema).label
          : row.description || row.detail;
      item.iconPath = new vscode.ThemeIcon(
        {
          schema: "database",
          class: "symbol-class",
          group: "symbol-namespace",
          property: "symbol-property",
          method: "symbol-method",
          key: "key",
          base: "type-hierarchy",
        }[row.kind] || "symbol-constant",
      );
      if (row.kind === "classPage") {
        item.iconPath = new vscode.ThemeIcon(
          row.direction === "previous" ? "arrow-up" : "arrow-down",
        );
        item.command = {
          command: "jadeNative.pageSourceClasses",
          title: row.label,
          arguments: [row],
        };
      } else if (row.kind === "resource") {
        item.contextValue = "jadeSourceResource";
        item.iconPath = new vscode.ThemeIcon("file-code");
        item.command = {
          command: "vscode.open",
          title: "Open Schema Source",
          arguments: [vscode.Uri.parse(row.file)],
        };
      } else if (!expandable) {
        item.contextValue =
          row.kind === "base"
            ? "jadeSourceBase"
            : row.kind === "method"
              ? "jadeSourceMethod"
              : "jadeSourceMember";
        item.command = {
          command:
            row.kind === "base"
              ? "jadeNative.findSourceClass"
              : "jadeNative.previewClassMember",
          title: row.kind === "base" ? "Open Source Class" : "Preview Member",
          arguments: row.kind === "base" ? [row.name, row.schema] : [row],
        };
      }
      if (row.kind === "class") item.contextValue = "jadeSourceClass";
      item.tooltip = row.schema
        ? row.schema +
          "::" +
          (row.owner || row.name) +
          (row.owner ? "::" + (row.name || row.label) : "")
        : row.label;
      return item;
    },
    async getChildren(row) {
      await syncBrowser();
      const classes = browser.rows;
      if (!row)
        return [
          ...new Set([
            ...classes.map((c) => c.schema),
            ...(await schemaResources()).keys(),
          ]),
        ]
          .sort()
          .map((name) => ({ kind: "schema", name, schema: name }));
      if (row.kind === "schema") {
        const files = (await schemaResources()).get(row.name) || [];
        const page = classPage(row.name);
        classPages.set(row.name, page.offset);
        return [
          ...(files.length
            ? [
                {
                  kind: "group",
                  label: "Schema & resources",
                  schema: row.name,
                  id: row.name + "::resources",
                  description: String(files.length),
                  items: files,
                },
              ]
            : []),
          ...page.items,
          ...(page.hasPrevious
            ? [
                {
                  kind: "classPage",
                  schema: row.name,
                  offset: page.previousOffset,
                  direction: "previous",
                  label: "Previous 100 classes",
                  description: page.label,
                  id: row.name + "::class-page::previous",
                },
              ]
            : []),
          ...(page.hasMore
            ? [
                {
                  kind: "classPage",
                  schema: row.name,
                  offset: page.nextOffset,
                  direction: "next",
                  label: "Next 100 classes",
                  description: page.label,
                  id: row.name + "::class-page::next",
                },
              ]
            : []),
        ];
      }
      if (row.kind === "group") return row.items;
      if (row.kind === "class") {
        const groups = new Map();
        for (const entry of row.entries) {
          const { text } = await source(entry.model.uri);
          const cls = classSections(text, entry.model.uri).find(
            (c) => c.name === row.name,
          );
          for (const group of cls?.groups || []) {
            const list = groups.get(group.label) || [];
            list.push(...group.items);
            groups.set(group.label, list);
          }
        }
        return [...groups].map(([label, items]) => ({
          kind: "group",
          label,
          schema: row.schema,
          owner: row.name,
          id: row.schema + "::" + row.name + "::" + label,
          description: String(items.length),
          items,
        }));
      }
      return [];
    },
  };
  const children = provider.getChildren.bind(provider);
  provider.getChildren = async (row) => {
    const result = await children(row);
    for (const item of result) parents.set(item, row);
    return result;
  };
  provider.getParent = (row) => parents.get(row);
  const view = vscode.window.createTreeView("jadeNative.classes", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  async function revealClass(selected) {
    await syncBrowser();
    selected = browser.find({ schema: selected.schema, name: selected.name });
    if (!selected)
      throw Error(
        "This class is no longer in the workspace. Refresh the catalogue.",
      );
    const schema = selected.schema;
    classFilters.delete(schema);
    const position = browser.positionOf(
      { schema, name: selected.name },
      { schema },
    );
    if (position) classPages.set(schema, position.offset);
    parents.set(selected, { kind: "schema", name: schema, schema });
    events.fire();
    await view.reveal(selected, { expand: true, focus: false }).catch(() => {});
    return { schema, name: selected.name };
  }
  const catalogue = registerClassCatalogue(vscode, context, {
    label: "Object Explorer — Classes",
    scope: "workspace",
    getRows: async () => {
      await syncBrowser();
      return browser.rows;
    },
    openClass: revealClass,
  });
  context.subscriptions.push(
    events,
    view,
    vscode.commands.registerCommand("jadeNative.browseSourceClasses", (row) =>
      catalogue.show({ schema: row?.schema }),
    ),
    vscode.commands.registerCommand(
      "jadeNative.pageSourceClasses",
      async (row) => {
        await syncBrowser();
        classPages.set(row.schema, Math.max(0, row.offset || 0));
        events.fire();
      },
    ),
    vscode.commands.registerCommand(
      "jadeNative.filterSourceClasses",
      async (row) => {
        if (!row?.schema) return;
        const query = await vscode.window.showInputBox({
          title: "Filter " + row.schema + " classes",
          value: classFilters.get(row.schema) || "",
          prompt: "Search every class in this schema",
        });
        if (query === undefined) return;
        classFilters.set(row.schema, query);
        classPages.set(row.schema, 0);
        events.fire();
      },
    ),
    previewController,
    vscode.commands.registerCommand(
      "jadeNative.showClassMember",
      async (row) => {
        const { doc, text } = await source(row.file),
          member = classSections(text, row.file)
            .find((c) => c.name === row.owner)
            ?.groups.flatMap((g) => g.items)
            .find((m) => m.name === row.name && m.kind === row.kind);
        if (!member) return;
        const editor = await vscode.window.showTextDocument(doc, {
            preview: true,
          }),
          start = doc.positionAt(member.selection),
          end = doc.positionAt(member.selection + member.name.length);
        editor.selection = new vscode.Selection(start, end);
        editor.revealRange(
          new vscode.Range(start, end),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
      },
    ),
    vscode.commands.registerCommand("jadeNative.previewClassMember", (row) =>
      previewController.open(row),
    ),
    vscode.commands.registerCommand("jadeNative.openOriginalSource", (row) =>
      previewController.openOriginal(row),
    ),
    vscode.commands.registerCommand(
      "jadeNative.findSourceClass",
      async (name, schema) => {
        await syncBrowser();
        let selected =
          name && schema ? browser.find({ name, schema }) : undefined;
        if (name && !selected && schema) {
          const seen = new Set();
          while (schema && !seen.has(schema)) {
            seen.add(schema);
            schema = language.index.project.parent(schema);
            if (schema) selected = browser.find({ name, schema });
            if (selected) break;
          }
        }
        if (!selected) {
          const matches = name ? browser.search(name, { schema }) : undefined;
          if (name && matches.total === 1 && matches.items[0].name === name)
            selected = matches.items[0];
          else
            selected = await pickClass(vscode, browser, {
              schema,
              title: "Find Jade class in workspace",
              query: name || "",
            });
        }
        if (selected) {
          await revealClass(selected);
        }
        if (selected) {
          const entry = selected.entries[0],
            { doc, text } = await source(entry.model.uri),
            current = classSections(text, entry.model.uri).find(
              (cls) => cls.name === selected.name,
            ),
            offset = current?.selection ?? entry.cls.selection;
          await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(
              doc.positionAt(offset),
              doc.positionAt(offset),
            ),
          });
          return { opened: true, uri: doc.uri.toString() };
        }
        return { opened: false };
      },
    ),
    vscode.commands.registerCommand("jadeNative.refreshClassView", async () => {
      resources = undefined;
      await language.index.rescan();
      if (catalogue.panel) await catalogue.refresh();
      events.fire();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.scheme !== "file") return;
      changed(event.document.uri);
    }),
    vscode.workspace.onDidCloseTextDocument(
      (doc) => doc.uri.scheme === "file" && changed(doc.uri),
    ),
    vscode.workspace.onDidCreateFiles(() => {
      resources = undefined;
      events.fire();
    }),
    vscode.workspace.onDidDeleteFiles(() => {
      resources = undefined;
      events.fire();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      resources = undefined;
      events.fire();
    }),
    {
      dispose() {
        clearTimeout(timer);

        pendingFiles.clear();
      },
    },
  );
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{cls,scm,sec,ddx}",
  );
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(changed),
    watcher.onDidChange(changed),
    watcher.onDidDelete(changed),
  );
  return {
    provider,
    view,
    previewController,
    browser,
    syncBrowser,
    revealClass,
    catalogue,
  };
}
module.exports = { registerClassView };
