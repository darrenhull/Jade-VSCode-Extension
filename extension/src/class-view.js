"use strict";
const path = require("node:path");
const { schemaFromSource } = require("./config");
const { isNestedSnapshot } = require("./source-snapshots");
const { classSections } = require("./class-view-model");
const {createClassWorkspaceModel,memberId}=require('./class-workspace-model');
const {createClassWorkspaces}=require('./class-workspace');
const {registerClassWorkspaces}=require('./class-workspace-controller');
const {createClassDiscoveryRows}=require('./class-discovery-rows');
const { ClassBrowserModel } = require("./class-browser-model"),
  { pickClass } = require("./class-browser-ui");
const { registerClassCatalogue } = require("./class-catalogue");
function registerClassView(vscode, context, language, options={}) {
  const events = new vscode.EventEmitter(),
    pendingFiles = new Set(),
    parents = new WeakMap();
  let timer, resources, browserProject, browserGeneration;
  const browser = new ClassBrowserModel({ scope: "workspace", pageSize: 100 }),
    classPages = new Map(),
    classFilters = new Map(),
    memberGroups = new Map(),
    memberGroupData = new WeakMap();
  function registeredGroup(id) {
    const row = memberGroups.get(id)?.deref();
    if (!row) { memberGroups.delete(id); return; }
    return memberGroupData.get(row);
  }
  const memberPageSize = 98;
  function memberGroup(row, items) {
    const prior = registeredGroup(row.id), offset = Math.min(prior?.offset || 0, items.length ? Math.floor((items.length - 1) / memberPageSize) * memberPageSize : 0);
    const end = Math.min(items.length, offset + memberPageSize);
    const group = { ...row, description: items.length ? (offset + 1) + "–" + end + " of " + items.length : "No members", items: items.slice(offset, end) };
    memberGroupData.set(group, { row: group, items, offset });
    memberGroups.set(row.id, new WeakRef(group));
    return group;
  }
  function memberPage(row) {
    const group = registeredGroup(row.id);
    if (!group) return [];
    const { items, offset } = group, end = Math.min(items.length, offset + memberPageSize);
    row.description = items.length ? (offset + 1) + "–" + end + " of " + items.length : "No members";
    const control = (direction, target) => ({ kind: "memberPage", groupId: row.id, offset: target, direction, schema: row.schema, owner: row.owner,
      label: (direction === "previous" ? "Previous " : "Next ") + memberPageSize + " members", description: row.description, id: row.id + "::page::" + direction + "::" + target });
    return [...(offset ? [control("previous", offset - memberPageSize)] : []), ...items.slice(offset, end), ...(end < items.length ? [control("next", end)] : [])];
  }
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
  const systemReadyProjects=new Set();
  const source = async (uri) => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const project=vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.toString()||'';
    if(language.ready&&!systemReadyProjects.has(project)){
      await language.ready(doc);systemReadyProjects.add(project);
    }
    return { doc, text: doc.getText() };
  };
  if(vscode.workspace.onDidChangeConfiguration)context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('jadeNative'))systemReadyProjects.clear();}));
  const model=createClassWorkspaceModel({vscode,language,readSource:source});
  async function openOriginal(row,id){
    const member=id&&await model.preview(row,id);
    if(member?.file)return vscode.commands.executeCommand('jadeNative.showClassMember',member);
    const identity=await model.resolveClass(row);return vscode.window.showTextDocument(vscode.Uri.parse(identity.file),{preview:false});
  }
  const shell=createClassWorkspaces(vscode,context,{
    load:model.load,preview:model.preview,
    onOriginal:openOriginal,
    onInstances:row=>options.onInstances?.({schema:row.schema,className:row.name,projectRoot:row.projectRoot,sourceUri:row.file}),
    onBack:restoreDiscovery,
    onDeclaringClass:(_row,member)=>previewController.open({name:member.owner,schema:member.schema,file:member.file}),
    onSuperclass:(_row,identity)=>previewController.open(identity),
    onEditOwningSource:(row,member)=>previewController.openOwningSource(row,member.id),
  });
  const previewController=registerClassWorkspaces(vscode,context,{model,shell,onOriginal:openOriginal});
  const classRows=createClassDiscoveryRows(uri=>vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri)));
  const allClasses=()=>classRows(language.index.project.groups);
  async function syncBrowser() {
    await language.index.ready();
    await language.index.flush();
    const project = language.index.project;
    if (
      project !== browserProject ||
      project.generation !== browserGeneration
    ) {
      const rows=allClasses();
      const identity=row=>JSON.stringify([row.projectId,row.schema,row.name]);
      const previous=new Map(browser.rows.map(row=>[identity(row),row]));
      if(rows.length!==previous.size||rows.some(row=>!previous.has(identity(row))))browser.setClasses(rows);
      else for(const row of rows)Object.assign(previous.get(identity(row)),row);
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
          : row.description || row.detail || (row.kind==='class'?row.projectName:undefined);
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
      if (row.kind === "memberPage") {
        item.iconPath = new vscode.ThemeIcon(row.direction === "previous" ? "arrow-up" : "arrow-down");
        item.command = { command: "jadeNative.pageSourceMembers", title: row.label, arguments: [row.groupId, row.offset] };
      } else if (row.kind === "classPage") {
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
      if (row.kind === "class") { const { entries, ...identity } = row; item.command={command:'jadeNative.openClassWorkspace',title:'Open class workspace',arguments:[identity]}; }
      item.tooltip = row.schema
        ? row.schema +
          "::" +
          (row.owner || row.name) +
          (row.owner ? "::" + (row.name || row.label) : "")
        : row.label;
      if(row.kind==='class'&&row.projectName)item.tooltip+=' · '+row.projectName;
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
                memberGroup({
                  kind: "group",
                  label: "Schema & resources",
                  schema: row.name,
                  id: row.name + "::resources",
                }, files),
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
      if (row.kind === "group") return memberPage(row);
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
        return [...groups].map(([label, items]) => memberGroup({
          kind: "group",
          label,
          schema: row.schema,
          owner: row.name,
          id: (row.browserId||JSON.stringify([row.projectId,row.schema,row.name])) + "::" + label,
          description: String(items.length),
        }, items));
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
  async function revealClass(selected,{focus=false,preserveFilter=false}={}) {
    await syncBrowser();
    selected = browser.find({ schema: selected.schema, name: selected.name,projectId:selected.projectId });
    if (!selected)
      throw Error(
        "This class is no longer in the workspace. Refresh the catalogue.",
      );
    const schema = selected.schema;
    if(!preserveFilter)classFilters.delete(schema);
    const position = browser.positionOf(
      { schema, name: selected.name,projectId:selected.projectId },
      { schema,query:preserveFilter?classFilters.get(schema)||'':'' },
    );
    if (position) classPages.set(schema, position.offset);
    parents.set(selected, { kind: "schema", name: schema, schema });
    events.fire();
    await view.reveal(selected, { expand: true, focus }).catch(() => {});
    return { schema, name: selected.name };
  }
  const catalogue = registerClassCatalogue(vscode, context, {
    label: "Object Explorer — Classes",
    scope: "workspace",
    getRows: async () => {
      await syncBrowser();
      return browser.rows;
    },
    openClass: async(row,origin)=>{await revealClass(row);return previewController.open(row,{origin});},
  });
  function treeOrigin(row){return {scope:'workspace',kind:'tree',filter:{schema:row.schema,query:classFilters.get(row.schema)||'',offset:classPages.get(row.schema)||0},selectedId:row.browserId||''};}
  async function restoreDiscovery(row,origin){
    if(origin?.kind==='quickpick'){
      await syncBrowser();let query=origin.filter?.query||'';
      const selected=await pickClass(vscode,browser,{schema:origin.filter?.schema,query,onAccept:(_row,state)=>{query=state.query;}});
      if(selected){await revealClass(selected);return previewController.open(selected,{origin:{...origin,filter:{...origin.filter,query},selectedId:selected.browserId}});}
      return;
    }
    if(origin?.kind==='tree'){
      classFilters.set(row.schema,origin.filter?.query||'');classPages.set(row.schema,origin.filter?.offset||0);
      return revealClass(row,{focus:true,preserveFilter:true});
    }
    return catalogue.show(origin?.scope==='workspace'?{restore:origin}:{});
  }
  context.subscriptions.push(
    events,
    view,
    vscode.commands.registerCommand("jadeNative.browseSourceClasses", (row) =>
      catalogue.show({ schema: row?.schema }),
    ),
    vscode.commands.registerCommand("jadeNative.pageSourceMembers", (groupId, offset) => {
      if (typeof groupId !== "string" || !Number.isSafeInteger(offset) || offset < 0 || offset % memberPageSize) return;
      const group = registeredGroup(groupId);
      if (!group || offset >= group.items.length) return;
      group.offset = offset;
      group.row.items = group.items.slice(offset, offset + memberPageSize);
      group.row.description = (offset + 1) + "–" + Math.min(group.items.length, offset + memberPageSize) + " of " + group.items.length;
      events.fire(group.row);
    }),
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
    vscode.commands.registerCommand('jadeNative.openClassWorkspace',row=>previewController.open(row,{origin:treeOrigin(row)})),
    vscode.commands.registerCommand(
      "jadeNative.showClassMember",
      async (row) => {
        const { doc, text } = await source(row.file),
          member = classSections(text, row.file)
            .find((c) => c.name === row.owner)
            ?.groups.flatMap((g) => g.items)
            .find((m) => m.name === row.name && (m.kind === row.kind || row.kind==='typeMethod'&&m.kind==='method'&&m.typeMethod));
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
      previewController.open(row,{origin:treeOrigin(row),selectedId:memberId({...row,kind:row.typeMethod?'typeMethod':row.kind})}),
    ),
    vscode.commands.registerCommand("jadeNative.openOriginalSource", (row) =>
      row?vscode.commands.executeCommand('jadeNative.showClassMember',row):previewController.openOriginal(),
    ),
    vscode.commands.registerCommand(
      "jadeNative.findSourceClass",
      async (name, schema, projectRoot) => {
        await syncBrowser();
        let origin;
        const projectId=projectRoot&&vscode.workspace.workspaceFolders?.find(folder=>folder.uri.fsPath===projectRoot||folder.uri.toString()===projectRoot)?.uri.toString();
        if(projectRoot&&!projectId)return {opened:false,reason:'The originating project is not open in this workspace.'};
        let selected = name && schema ? browser.find({ name, schema,projectId }) : undefined;
        if (name && !selected && schema) {
          const seen = new Set();
          while (schema && !seen.has(schema)) {
            seen.add(schema);
            schema = language.index.project.parent(schema);
            if (schema) selected = browser.find({ name, schema,projectId });
            if (selected) break;
          }
        }
        if (!selected) {
          if(name&&projectId)return {opened:false,reason:'No matching source class exists in the originating project.'};
          const matches = name ? browser.search(name, { schema }) : undefined;
          if (name && matches.total === 1 && matches.items[0].name === name)
            selected = matches.items[0];
          else
            selected = await pickClass(vscode, browser, {
              schema,
              title: "Find Jade class in workspace",
              query: name || "",
              onAccept:(row,state)=>{origin={scope:'workspace',kind:'quickpick',filter:{schema:state.schema,query:state.query,offset:0},selectedId:row.browserId};},
            });
        }
        if (selected) {
          await revealClass(selected);
        }
        if (selected) {
          return previewController.open(selected,{origin:origin||treeOrigin(selected)});
        }
        return { opened: false };
      },
    ),
    vscode.commands.registerCommand("jadeNative.refreshClassView", async () => {
      resources = undefined;
      systemReadyProjects.clear();
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
      classRows.invalidate();
      systemReadyProjects.clear();
      resources = undefined;
      events.fire();
    }),
    {
      dispose() {
        clearTimeout(timer);

        pendingFiles.clear();
        memberGroups.clear();
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
