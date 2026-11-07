"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { InspectionSession } = require("./object-session"),
  { InspectorTransport } = require("./object-transport");
const { validateObjectIdentity } = require("./NativeObjectIdentity");
const { InspectionHistory } = require("./inspection-history");
const { fieldText } = require("../media/object-page");
const { ClassBrowserModel } = require("./class-browser-model");
const { pickClass } = require("./class-browser-ui");
const { registerClassCatalogue } = require("./class-catalogue");
function registerObjectExplorer(vscode, context, services) {
  const events = new vscode.EventEmitter(),
    output = vscode.window.createOutputChannel("Jade Objects"),
    panels = new Set(),
    pages = new Map(),
    pageLoads = new Map(),
    classVersions = new Map(),
    classOffsets = new Map(),
    schemaNodes = new Map();
  let catalog,
    classBrowser,
    classCatalogue,
    currentConfig,
    currentTarget,
    lock = false,
    lockOwner,
    showSystem = false,
    subclasses = false,
    disposed = false,
    catalogVersion = 0,
    catalogRequest,
    pageVersion = 0,
    credentials,
    pendingUnpinnedRead,
    inspectionScope,
    browseVersion = 0;
  const setLock = async (value) => {
    lock = value;
    await services.setBusy(value);
    await vscode.commands.executeCommand(
      "setContext",
      "jadeNative.inspecting",
      value,
    );
  };
  async function configuration() {
    if (inspectionScope) return services.config(undefined, { name: path.basename(inspectionScope), uri: vscode.Uri.file(inspectionScope) });
    let doc = vscode.window.activeTextEditor?.document;
    if (doc?.uri.scheme !== "file" || !/.cls$/i.test(doc.uri.fsPath)) {
      const active = doc?.uri && vscode.workspace.getWorkspaceFolder(doc.uri),
        folders = vscode.workspace.workspaceFolders || [];
      const folder =
        active ||
        (folders.length === 1
          ? folders[0]
          : (
              await vscode.window.showQuickPick(
                folders.map((folder) => ({ label: folder.name, folder })),
                { title: "Choose Jade database settings" },
              )
            )?.folder);
      if (!folder)
        throw Error(
          "Open a workspace and configure its Jade database settings first.",
        );
      return services.config(undefined, folder);
    }
    return services.config(doc);
  }
  const session = new InspectionSession({
    connect: async (selection) => {
      const generation = session.generation,
        owner = {};
      if (services.isBusy())
        throw Error(
          "Another Jade operation is running. Wait for it to finish before connecting Object Explorer.",
        );
      await services.beforeConnect?.();
      const config = await configuration();
      if (generation !== session.generation)
        throw Error("Inspection connection was cancelled.");
      if (services.isBusy())
        throw Error(
          "Another Jade operation started while selecting database settings.",
        );
      const target = await services.inspectionTarget(config, selection);
      if(generation !== session.generation)throw Error('Inspection connection was cancelled.');
      if(services.isBusy())throw Error('Another Jade operation started while resolving the database target.');
      lockOwner = owner;
      await setLock(true);
      let client, file;
      try {
        if (generation !== session.generation || lockOwner !== owner)
          throw Error("Inspection connection was cancelled.");
        currentConfig = config;
        currentTarget = target;
        refreshDescription();
        const directory = path.join(
          context.globalStorageUri.fsPath,
          "inspection-sessions",
        );
        fs.mkdirSync(directory, { recursive: true });
        file = path.join(directory, crypto.randomUUID() + ".json");
        // Consumed once by the native helper; removed on readiness or startup failure.
        const authentication = credentials;
        credentials = undefined;
        fs.writeFileSync(
          file,
          JSON.stringify({
            installPath: target.installPath,
            databasePath: target.databasePath,
            iniPath: target.iniPath,
            server: target.server,
            schema: target.schema,
            readOnly: true,
            ...(authentication || {}),
          }),
          { flag: "wx", mode: 0o600 },
        );
        client = services.createTransport
          ? services.createTransport(
              path.join(
                context.extensionPath,
                "vendor/jade-tools-cli/native/jade-inspect-helper.exe",
              ),
              file,
            )
          : new InspectorTransport(
              path.join(
                context.extensionPath,
                "vendor/jade-tools-cli/native/jade-inspect-helper.exe",
              ),
              file,
            );
        client.on("output", (text) => output.append(text));
        client.on("failure", (error) => output.appendLine(error.message));
        const removeSession = () => {
          try {
            fs.unlinkSync(file);
          } catch (error) {
            if (error.code !== "ENOENT")
              output.appendLine(
                "Could not remove temporary inspection session: " + error.code,
              );
          }
        };
        void client.ready.then(removeSession, removeSession);
        client.once("close", () => {
          try {
            fs.unlinkSync(file);
          } catch (error) {
            if (error.code !== "ENOENT") output.appendLine(error.message);
          }
          if (lockOwner === owner) {
            lockOwner = undefined;
            void setLock(false);
          }
        });
        return client;
      } catch (error) {
        if (file)
          try {
            fs.unlinkSync(file);
          } catch {}
        if (lockOwner === owner) {
          lockOwner = undefined;
          await setLock(false);
        }
        throw error;
      }
    },
  });
  function refreshDescription() {
    if (!view) return;
    const label =
      session.target === "working" ? "Working database" : "Source database";
    view.description = label + " · Read-only";
    view.message =
      (currentTarget?.selection === session.target
        ? currentTarget.databasePath
        : "Select database settings when connecting") +
      "\n" +
      (session.client
        ? "Connected. Compile and test automatically disconnect inspection."
        : "Disconnected");
  }
  function invalidate() {
    catalogVersion++;
    catalogRequest = undefined;
    pageVersion++;
    pageLoads.clear();
    classVersions.clear();
    catalog = undefined;
    classBrowser = undefined;
    classCatalogue?.invalidate();
    classOffsets.clear();
    schemaNodes.clear();
    pages.clear();
    events.fire();
    refreshDescription();
    for (const record of panels) {
      record.cursor = undefined;
      void record.panel.webview.postMessage({
        command: "disconnected",
        target: record.connection?.target,
        connection: record.connection,
        object: record.object,
        message:
          "Disconnected · Last retrieved values are retained. Reconnect explicitly and reopen this object to resume inspection.",
      });
    }
  }
  async function releaseNativeCursor(cursor, generation = session.generation) {
    if (!cursor || !session.client || generation !== session.generation) return;
    try {
      await session.request("release", { cursor });
    } catch {}
  }
  async function resetPages() {
    pageVersion++;
    const generation = session.generation,
      previous = [...pages.values()];
    pages.clear();
    pageLoads.clear();
    classVersions.clear();
    events.fire();
    await Promise.all(
      previous.map((page) => releaseNativeCursor(page.cursor, generation)),
    );
  }
  async function discardClassPage(oid) {
    classVersions.set(oid, (classVersions.get(oid) || 0) + 1);
    const previous = pages.get(oid);
    pages.delete(oid);
    pageLoads.delete(oid);
    await releaseNativeCursor(previous?.cursor);
  }
  function loadCatalog() {
    const generation = session.generation,
      version = ++catalogVersion;
    const request = session
      .request("catalog", { includeSystem: showSystem })
      .then(
        (data) => {
          if (generation !== session.generation)
            throw Error("Database changed or inspection was cancelled.");
          if (version !== catalogVersion) return catalogRequest;
          catalog = data;
          classOffsets.clear();
          schemaNodes.clear();
          classBrowser = new ClassBrowserModel({ scope: classScope() });
          classBrowser.setClasses(data.schemas.flatMap(schema => schema.classes.map(cls => ({
            ...cls, schema: cls.schema || schema.name,
          }))));
          for (const schema of data.schemas) schemaNodes.set(schema.name, {
            kind: "schema", name: schema.name, oid: schema.oid,
            id: JSON.stringify([classScope(), "schema", schema.name]),
            description: classBrowser.page({ schema: schema.name }).label,
          });
          if (classCatalogue?.panel) void classCatalogue.refresh().catch(error => output.appendLine(error.message));
          return data;
        },
        (error) => {
          if (version !== catalogVersion && generation === session.generation)
            return catalogRequest;
          throw error;
        },
      );
    catalogRequest = request;
    return request;
  }
  function classPage(row, next = false) {
    if (pageLoads.has(row.oid)) return pageLoads.get(row.oid);
    const generation = session.generation,
      version = pageVersion,
      classVersion = classVersions.get(row.oid) || 0,
      previous = pages.get(row.oid);
    if (next && !previous?.cursor) return Promise.resolve(previous);
    const request = session
      .request("instances", {
        classOid: row.oid,
        ...(next ? { cursor: previous.cursor } : {}),
        limit: 100,
        includeSubclasses: subclasses,
      })
      .then(async (page) => {
        if (
          generation !== session.generation ||
          version !== pageVersion ||
          classVersion !== (classVersions.get(row.oid) || 0)
        ) {
          await releaseNativeCursor(page.cursor, generation);
          return;
        }
        const current = {
          ...page,
          number: next ? (previous.number || 1) + 1 : 1,
        };
        pages.set(row.oid, current);
        return current;
      })
      .finally(() => {
        if (pageLoads.get(row.oid) === request) pageLoads.delete(row.oid);
      });
    pageLoads.set(row.oid, request);
    return request;
  }
  session.on("change", () => {
    if (!session.client) invalidate();
    else {
      events.fire();
      refreshDescription();
    }
  });
  async function connect() {
    try {
      await session.connect();
    } catch (error) {
      if (Number(error.code) !== 1713) throw error;
      const generation = session.generation,
        target = session.target;
      const user = await vscode.window.showInputBox({
        title: "Jade inspection sign-on",
        prompt:
          "Your development security library requires a user name. Credentials are used only for this connection.",
        ignoreFocusOut: true,
      });
      if (user === undefined) throw Error("Inspection sign-on cancelled.");
      const password = await vscode.window.showInputBox({
        title: "Jade inspection password",
        prompt: "Password for " + user,
        password: true,
        ignoreFocusOut: true,
      });
      if (
        password === undefined ||
        generation !== session.generation ||
        target !== session.target
      )
        throw Error("Inspection sign-on cancelled.");
      credentials = { user, password };
      try {
        await session.connect();
      } finally {
        credentials = undefined;
      }
    }
    const loaded = await loadCatalog();
    if (!loaded) throw Error("Inspection connection was cancelled.");
    events.fire();
    refreshDescription();
    return {
      readOnly: true,
      selection: session.target,
      databasePath: currentTarget.databasePath,
      schemaCount: loaded.schemas.length,
      classCount: loaded.schemas.reduce(
        (sum, schema) => sum + schema.classes.length,
        0,
      ),
    };
  }
  function entry(row, index) {
    return {
      kind: "object",
      name: row.label || row.className || row.oid,
      description: row.oid,
      oid: row.oid,
      className: row.className,
      schema: row.schema,
      id: session.generation + "::object::" + row.oid + "::" + index,
    };
  }
  function classScope() {
    return "database:" + session.target + ":" + (currentTarget?.databasePath || "").toLowerCase();
  }
  function classNode(row) {
    return { ...row, kind: "class", id: row.browserId,
      description: row.collection ? "Collection" : row.persistentAllowed === false ? "Transient class" : undefined };
  }
  function classChildren(schema) {
    if (!classBrowser) return [];
    const page = classBrowser.page({ schema: schema.name, offset: classOffsets.get(schema.name) || 0 });
    schema.description = page.label;
    return [
      ...page.items.map(classNode),
      { kind: "find", name: "Browse classes…", description: "Search all classes in " + schema.name,
        id: schema.id + "::find", command: "jadeNative.browseDatabaseClasses", args: [schema] },
      ...(page.hasPrevious ? [{ kind: "more", name: "Previous 100 classes…", id: schema.id + "::previous",
        command: "jadeNative.pageObjectClasses", args: [schema.name, page.previousOffset] }] : []),
      ...(page.hasMore ? [{ kind: "more", name: "Next 100 classes…", id: schema.id + "::next",
        command: "jadeNative.pageObjectClasses", args: [schema.name, page.nextOffset] }] : []),
    ];
  }
  async function revealClass(selected, generation = session.generation) {
    if (generation !== session.generation || !session.client || !classBrowser)
      throw Error("Database changed or inspection was cancelled.");
    const row = classBrowser.find(selected), schema = schemaNodes.get(selected.schema);
    if (!row || !schema) throw Error("Database class is no longer in this catalog.");
    const position = classBrowser.positionOf(row, { schema: row.schema });
    classOffsets.set(row.schema, position.offset);
    schema.description = classBrowser.page({ schema: row.schema, offset: position.offset }).label;
    events.fire(schema);
    await view.reveal(schema, { select: false, focus: false, expand: true });
    if (generation !== session.generation) throw Error("Database changed or inspection was cancelled.");
    const target = classChildren(schema).find(item => item.kind === "class" && item.name === row.name);
    await view.reveal(target, { select: true, focus: true, expand: false });
    return { schema: row.schema, name: row.name, offset: position.offset, readOnly: true };
  }
  async function browseInstances(value) {
    if (!value || typeof value.schema !== "string" || typeof value.className !== "string" || typeof value.projectRoot !== "string")
      throw Error("Choose a workspace class with an explicit project and schema.");
    const version = ++browseVersion;
    const requestedRoot = path.resolve(value.projectRoot);
    const config = await services.config(undefined, { name: path.basename(requestedRoot), uri: vscode.Uri.file(requestedRoot) });
    let workingPath;
    try { workingPath = (await services.workingLocation(config)).databasePath; } catch { workingPath = "Unavailable · compile first to create a working database"; }
    const choices = [
      { label: "Working database", target: "working", description: value.schema + "::" + value.className,
        detail: workingPath },
      { label: "Source database", target: "source", description: value.schema + "::" + value.className,
        detail: config.databasePath },
    ];
    const choice = await vscode.window.showQuickPick(choices, {
      title: "Browse instances · " + value.schema + "::" + value.className,
      placeHolder: "Choose the database for " + requestedRoot + " · read-only",
    });
    if (version !== browseVersion || disposed || !choice || !["working", "source"].includes(choice.target)) return { cancelled: true };
    const sameProject = currentConfig?.workspaceRoots?.some(root => path.resolve(root).toLowerCase() === requestedRoot.toLowerCase());
    if (session.client && (!sameProject || session.target !== choice.target)) await session.disconnect();
    inspectionScope = requestedRoot;
    if (session.target !== choice.target) await session.select(choice.target);
    if (!session.client) await connect();
    if (!classBrowser) await loadCatalog();
    if (version !== browseVersion || disposed) return { cancelled: true };
    const row = classBrowser.rows.find(item => item.schema === value.schema && item.name === value.className);
    if (!row) {
      const message = value.schema + "::" + value.className + " is not installed in the selected " + choice.label + ". Local source remains available. Publish explicitly to add it, or choose another inspection database.";
      const configure = await vscode.window.showInformationMessage?.(message, "Choose database");
      if (configure === "Choose database") await vscode.commands.executeCommand("jadeNative.selectInspectionDatabase");
      return { available: false, reason: message, target: session.target, databasePath: currentTarget?.databasePath, projectRoot: requestedRoot };
    }
    const revealed = await revealClass(row);
    const node = classNode(row);
    await classPage(node);
    await view.reveal(node, { select: true, focus: true, expand: true });
    return { ...revealed, available: true, target: session.target, databasePath: currentTarget.databasePath, projectRoot: requestedRoot };
  }
  async function findClass(value) {
    if (!session.client) await connect();
    if (!classBrowser) await loadCatalog();
    const generation = session.generation;
    const selected = await pickClass(vscode, classBrowser, {
      schema: value?.kind === "schema" ? value.name : undefined,
      query: typeof value === "string" ? value : "", title: "Find database class",
    });
    if (selected) return revealClass(selected, generation);
  }
  const provider = {
    onDidChangeTreeData: events.event,
    getParent(row) {
      if (row.kind === "class") return schemaNodes.get(row.schema);
    },
    getTreeItem(row) {
      const expandable = ["schema", "class"].includes(row.kind),
        item = new vscode.TreeItem(
          row.name,
          expandable
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        );
      item.id =
        row.id ||
        session.generation + "::" + row.kind + "::" + (row.oid || row.name);
      item.description = row.description;
      item.tooltip = row.tooltip || row.oid || row.description;
      item.iconPath = new vscode.ThemeIcon(
        {
          target: "database",
          connect: "plug",
          disconnect: "debug-disconnect",
          schema: "database",
          class: "symbol-class",
          find: "search",
          object: "symbol-object",
          more: "ellipsis",
          error: "warning",
        }[row.kind] || "circle-outline",
      );
      if (row.command)
        item.command = {
          command: row.command,
          title: row.name,
          arguments: row.args || [],
        };
      if (row.kind === "object") {
        item.contextValue = "jadeObjectInstance";
        item.command = {
          command: "jadeNative.inspectObject",
          title: "Inspect Object",
          arguments: [row.oid],
        };
      }
      if (row.kind === "class") item.contextValue = "jadeObjectClass";
      if (row.kind === "schema") item.contextValue = "jadeObjectSchema";
      return item;
    },
    async getChildren(row) {
      try {
        if (!row) {
          const title =
              session.target === "working"
                ? "Working database"
                : "Source database",
            controls = [
              {
                kind: "target",
                name: title,
                description: "Read-only",
                tooltip: currentTarget?.databasePath,
                command: "jadeNative.selectInspectionDatabase",
              },
              {
                kind: session.client ? "disconnect" : "connect",
                name: session.client ? "Disconnect" : "Connect to database",
                description: session.client
                  ? currentTarget?.databasePath
                  : undefined,
                command: session.client
                  ? "jadeNative.disconnectObjects"
                  : "jadeNative.connectObjects",
              },
            ];
          if (!session.client || !catalog) return controls;
          return [
            ...controls,
            ...catalog.schemas
              .filter(
                (s) =>
                  showSystem || !["RootSchema", "JadeSchema"].includes(s.name),
              )
              .map((s) => schemaNodes.get(s.name)),
          ];
        }
        if (row.kind === "schema") return classChildren(row);
        if (row.kind === "class") {
          let page = pages.get(row.oid);
          if (!page) {
            page = await classPage(row);
          }
          if (!page) return [];
          return [
            ...(page.number > 1
              ? [
                  {
                    kind: "more",
                    name: "Return to first page",
                    command: "jadeNative.firstObjectInstances",
                    args: [row],
                    id: session.generation + "::first::" + row.oid,
                  },
                ]
              : []),
            ...page.items.map(entry),
            ...(page.hasMore
              ? [
                  {
                    kind: "more",
                    name: "Load next 100 instances…",
                    command: "jadeNative.moreObjectInstances",
                    args: [row],
                    id: session.generation + "::more::" + row.oid,
                  },
                ]
              : []),
            ...(!page.items.length
              ? [
                  {
                    kind: "empty",
                    name: "No persistent instances",
                    description:
                      row.description === "Transient class"
                        ? "Process-owned transients require a debugger session"
                        : undefined,
                  },
                ]
              : []),
          ];
        }
        return [];
      } catch (error) {
        output.appendLine(error.message);
        return [
          {
            kind: "error",
            name: diagnostic(error),
            command: "jadeNative.refreshObjects",
          },
        ];
      }
    },
  };
  const view = vscode.window.createTreeView("jadeNative.objects", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  classCatalogue = registerClassCatalogue(vscode, context, {
    scope: "database", label: "Database classes",
    getRows: async () => {
      if (!session.client) await connect();
      if (!catalog) await loadCatalog();
      return { rows: classBrowser.rows, scope: classScope(), generation: session.generation,
        label: (session.target === "working" ? "Working database" : "Source database") +
          " · Read-only · " + currentTarget.databasePath };
    },
    openClass: (row, metadata) => {
      if (metadata.scope !== classScope()) throw Error("Database changed or inspection was cancelled.");
      return revealClass(row, metadata.generation);
    },
  });
  if (view.onDidCollapseElement)
    context.subscriptions.push(
      view.onDidCollapseElement(({ element }) => {
        if (element.kind !== "class") return;
        void discardClassPage(element.oid);
      }),
    );
  refreshDescription();
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    45,
  );
  status.command = "jadeNative.selectInspectionDatabase";
  status.text = "$(database) Jade Inspect: Working · Read-only";
  status.tooltip = "Choose database for read-only Object Explorer";
  status.show();
  function diagnostic(error) {
    const text = String(error.message || error);
    if (
      /\bin use\b|\balready\b.*\bopen\b|\bexclusive\b|(?:\bOpen database\b.*\block(?:ed|ing)?\b)/i.test(
        text,
      )
    )
      return (
        text +
        " — This database may already be open in single-user mode. Close that session yourself, or inspect the isolated working copy."
      );
    return text;
  }
  async function action(fn) {
    try {
      return await fn();
    } catch (error) {
      if (/Database changed|cancelled/i.test(error.message)) return;
      output.appendLine(error.message);
      void vscode.window.showErrorMessage(diagnostic(error));
      return { error: error.message };
    }
  }
  async function releaseCursor(record) {
    if (record.cursor && session.client && record.generation === session.generation) {
      const cursor = record.cursor;
      record.cursor = undefined;
      try {
        await session.request("release", { cursor });
      } catch {}
    }
  }
  async function copyOid(value) {
    const oid = typeof value === "string" ? value : value?.oid;
    if (validateObjectIdentity(oid))
      throw Error("Select an object with a native identifier first.");
    await vscode.env.clipboard.writeText(oid);
    return oid;
  }
  async function openClassSource(value) {
    const name = value?.className || value?.name,
      schema = value?.schema;
    if (!name || !schema) throw Error("Select an object or class first.");
    const result = await vscode.commands.executeCommand(
      "jadeNative.findSourceClass",
      name,
      schema,
      value?.projectRoot || value?.connection?.projectRoot,
    );
    if (result?.opened === false)
      void vscode.window.showInformationMessage?.(
        "No workspace source was found for " +
          schema +
          "::" +
          name +
          ". Pull the schema source to browse its definitions.",
      );
    return result;
  }
  async function inspect(oid, record, visit = true, origin) {
    if (validateObjectIdentity(oid))
      throw Error(validateObjectIdentity(oid));
    if (!session.client) await connect();
    const recipient =
        record ||
        [...panels].find(
          (p) => !p.pinned && p.generation === session.generation,
        ),
      ticket = {};
    if (recipient) recipient.readTicket = ticket;
    else pendingUnpinnedRead = ticket;
    const generation = session.generation;
    const object = await session.request("object", { oid });
    if (validateObjectIdentity(object.oid))
      throw Error("Native inspector returned an invalid object identity.");
    oid = object.oid;
    if (generation !== session.generation || recipient?.disposed) return;
    if (
      recipient
        ? recipient.readTicket !== ticket
        : pendingUnpinnedRead !== ticket
    )
      return;
    if (visit)
      session.visit({
        oid,
        className: object.className,
        schema: object.schema,
      });
    if (!record) {
      record = [...panels].find(
        (p) => !p.pinned && p.generation === generation,
      );
      if (!record) {
        const panel = vscode.window.createWebviewPanel(
          "jade.objectInspector",
          "Jade Object",
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            enableFindWidget: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, "media")),
            ],
          },
        );
        record = { panel, generation, pinned: false, history: new InspectionHistory() };
        record.rendered = new Promise((resolve, reject) => {
          record.renderResolve = resolve;
          record.renderReject = reject;
        });
        record.rendered.catch(() => {});
        record.renderTimer = setTimeout(
          () =>
            record.renderReject(
              Error(
                "Object inspector view did not initialize. Close and reopen the object.",
              ),
            ),
          15000,
        );
        panels.add(record);
        const web = panel.webview,
          nonce = crypto.randomBytes(24).toString("hex"),
          asset = (name) =>
            web
              .asWebviewUri(
                vscode.Uri.file(
                  path.join(context.extensionPath, "media", name),
                ),
              )
              .toString();
        web.html = objectHtml(web.cspSource, nonce, asset);
        const listener = web.onDidReceiveMessage(
          (message) =>
            void action(async () => {
              if (message?.command === "database")
                return vscode.commands.executeCommand(
                  "jadeNative.selectInspectionDatabase",
                );
              if (message?.command === "focusExplorer")
                return vscode.commands.executeCommand(
                  "jadeNative.objects.focus",
                );
              if (record.generation !== session.generation && !["copyOid", "copyValue", "copyKey", "source", "pin", "viewState", "ready", "rendered"].includes(message?.command)) return;
              if (message?.command === "rendered") {
                clearTimeout(record.renderTimer);
                record.renderResolve();
                return;
              }
              if (message?.command === "ready") return sendObject(record);
              if (message?.command === "viewState") {
                if (message.oid === record.object?.oid) record.history.saveView(message);
                return;
              }
              if (message?.command === "copyOid") {
                await copyOid(record.object);
                return record.panel.webview.postMessage({
                  command: "notice",
                  message: "Object ID copied.",
                });
              }
              if (
                message?.command === "copyValue" ||
                message?.command === "copyKey"
              ) {
                const items =
                  message.section === "properties"
                    ? record.object.properties
                    : message.section === "entries"
                      ? record.page?.items
                      : undefined;
                if (
                  !Array.isArray(items) ||
                  !Number.isInteger(message.index) ||
                  message.index < 0 ||
                  message.index >= items.length
                )
                  throw Error(
                    "Select a displayed property or collection entry.",
                  );
                const item = items[message.index],
                  text =
                    message.command === "copyKey"
                      ? String(item.key ?? item.index ?? "")
                      : item.value === "" ? "" : fieldText(item);
                await vscode.env.clipboard.writeText(text);
                return record.panel.webview.postMessage({
                  command: "notice",
                  message:
                    "Displayed " +
                    (message.command === "copyKey" ? "key" : "value") +
                    " copied.",
                });
              }
              if (message?.command === "source")
                return openClassSource({ ...record.object, connection: record.connection });
              if (message?.command === "open")
                return inspect(
                  message.oid,
                  record.pinned ? undefined : record,
                  true,
                  { oid: record.object.oid, schema: record.object.schema, className: record.object.className, property: message.section === "properties" && record.object.properties?.[message.index]?.name, connection: record.connection },
                );
              if (message?.command === "back") return restoreSnapshot(record, record.history.back());
              if (message?.command === "forward") return restoreSnapshot(record, record.history.forward());
              if (message?.command === "refresh")
                return inspect(record.object.oid, record, false);
              if (message?.command === "pin") {
                record.pinned = !record.pinned;
                return sendObject(record);
              }
              if (message?.command === "history") return restoreSnapshot(record, record.history.select(message.index));
              if (
                ["next", "first", "pageSize"].includes(message?.command) &&
                record.object.collection
              ) {
                if (record.pendingAction) return;
                if (message.command === "pageSize") {
                  if (![25, 50, 100].includes(message.limit))
                    throw Error("Choose a page size of 25, 50 or 100.");
                  record.limit = message.limit;
                }
                if (message.command === "next" && !record.cursor) return;
                const revision = record.revision,
                  generation = session.generation,
                  oid = record.object.oid,
                  token = {};
                record.pendingAction = token;
                record.error = undefined;
                await sendObject(record);
                try {
                  const cursor =
                    message.command === "next" ? record.cursor : undefined;
                  if (message.command !== "next") await releaseCursor(record);
                  const page = await session.request("collection", {
                    oid,
                    cursor,
                    limit: record.limit || 100,
                  });
                  if (
                    record.revision !== revision ||
                    generation !== session.generation
                  ) {
                    await releaseNativeCursor(page.cursor, generation);
                    return;
                  }
                  record.page = page;
                  Object.assign(record.history.current(), { page, limit: record.limit });
                  record.cursor = page.cursor;
                  record.readAt = new Date().toISOString();
                  Object.assign(record.history.current(), { readAt: record.readAt });
                } catch (error) {
                  if (record.revision === revision && generation === session.generation) record.error = diagnostic(error);
                } finally {
                  if (record.pendingAction === token) {
                    record.pendingAction = undefined;
                    await sendObject(record);
                  }
                }
              }
            }),
        );
        panel.onDidDispose(() => {
          record.disposed = true;
          record.revision = (record.revision || 0) + 1;
          record.readTicket = {};
          clearTimeout(record.renderTimer);
          record.renderReject(Error("Object inspection was cancelled."));
          listener.dispose();
          panels.delete(record);
          void releaseCursor(record);
        });
      }
    }
    const revision = (record.revision || 0) + 1;
    record.revision = revision;
    record.pendingAction = undefined;
    await releaseCursor(record);
    if (record.revision !== revision || generation !== session.generation)
      throw Error("Object inspection was cancelled by newer navigation.");
    record.generation = generation;
    record.connection = Object.freeze({
      name: session.target === "working" ? "Working database" : "Source database",
      path: currentTarget?.databasePath, target: session.target,
      projectRoot: inspectionScope || currentConfig?.workspaceRoots?.[0],
      connection: currentConfig?.connectionName || currentConfig?.name || "Configured connection",
      session: generation, readOnly: true,
    });
    record.origin = origin || (record.object?.oid === object.oid ? record.origin : undefined);
    record.object = object;
    record.readAt = new Date().toISOString();
    record.page = undefined;
    record.error = undefined;
    if (object.collection) {
      try {
      const page = await session.request("collection", {
        oid,
        limit: record.limit || 100,
      });
      if (record.revision !== revision || generation !== session.generation) {
        await releaseNativeCursor(page.cursor, generation);
        throw Error("Object inspection was cancelled by newer navigation.");
      }
      record.page = page;
      record.cursor = page.cursor;
      } catch (error) {
        if (generation !== session.generation || record.disposed || record.revision !== revision) return;
        record.error = diagnostic(error);
      }
    }
    record.history.visit({ object, page: record.page, connection: record.connection, readAt: record.readAt, limit: record.limit, origin: record.origin, error: record.error });
    record.panel.title = object.className + " · " + oid;
    record.panel.reveal();
    await sendObject(record);
    await record.rendered;
    return { oid, className: object.className, readOnly: true };
  }
  async function restoreSnapshot(record, snapshot) {
    if (!snapshot) return;
    record.revision = (record.revision || 0) + 1;
    record.readTicket = {};
    await releaseCursor(record);
    Object.assign(record, snapshot, { pendingAction: undefined });
    // Native cursors were released on navigation. Restart explicitly with First.
    if (record.page) record.page = { ...record.page, hasMore: false, restartRequired: true };
    return sendObject(record);
  }
  async function sendObject(record) {
    if (!record.object || record.disposed) return;
    return record.panel.webview.postMessage({
      command: "object",
      object: record.object,
      page: record.page,
      error: record.error,
      stale: record.generation !== session.generation || !session.client,
      pinned: record.pinned,
      readAt: record.readAt,
      busy: Boolean(record.pendingAction),
      limit: record.limit || 100,
      connection: record.connection,
      origin: record.origin,
      view: record.history.current()?.view,
      history: {
        entries: record.history.entries.map(item => item.object),
        position: record.history.position,
        back: record.history.position > 0,
        forward: record.history.position < record.history.entries.length - 1,
      },
    });
  }
  context.subscriptions.push(
    events,
    output,
    view,
    status,
    {
      dispose() {
        disposed = true;
        for (const record of panels) record.panel.dispose();
        void session.disconnect();
      },
    },
    vscode.commands.registerCommand("jadeNative.selectInspectionDatabase", () =>
      action(async () => {
        let config;
        try {
          config = await configuration();
        } catch {}
        const choice = await vscode.window.showQuickPick(
          [
            {
              label: "Working database",
              description: "Isolated local build/test copy",
              detail: config
                ? (await services.workingLocation(config)).databasePath
                : "",
              target: "working",
            },
            {
              label: "Source database",
              description: "Configured pull/publish database",
              detail: config?.databasePath,
              target: "source",
            },
          ],
          {
            title: "Choose database to inspect — read-only",
            placeHolder: "Switching disconnects and clears inspection history",
          },
        );
        if (!choice) return;
        await session.select(choice.target);
        currentTarget = undefined;
        status.text =
          "$(database) Jade Inspect: " +
          (choice.target === "working" ? "Working" : "Source") +
          " · Read-only";
        refreshDescription();
        events.fire();
        return { selection: choice.target, readOnly: true };
      }),
    ),
    vscode.commands.registerCommand("jadeNative.connectObjects", () =>
      action(connect),
    ),
    vscode.commands.registerCommand("jadeNative.disconnectObjects", () =>
      action(() => session.disconnect()),
    ),
    vscode.commands.registerCommand("jadeNative.cancelObjectInspection", () =>
      action(() => session.disconnect()),
    ),
    vscode.commands.registerCommand("jadeNative.refreshObjects", () =>
      action(async () => {
        await resetPages();
        if (session.client) await loadCatalog();
        events.fire();
      }),
    ),
    vscode.commands.registerCommand("jadeNative.findObjectClass", value => action(() => findClass(value))),
    vscode.commands.registerCommand("jadeNative.browseDatabaseClasses", value => action(() =>
      classCatalogue.show({ schema: value?.kind === "schema" ? value.name : typeof value === "string" ? value : undefined }))),
    vscode.commands.registerCommand("jadeNative.pageObjectClasses", (schemaName, offset) => action(async () => {
      const schema = schemaNodes.get(schemaName);
      if (!schema || !classBrowser) return;
      const page = classBrowser.page({ schema: schemaName, offset });
      const previous = classBrowser.page({ schema: schemaName, offset: classOffsets.get(schemaName) || 0 });
      if (previous.offset !== page.offset) await Promise.all(previous.items.map(row => discardClassPage(row.oid)));
      classOffsets.set(schemaName, page.offset);
      schema.description = page.label;
      events.fire(schema);
      return { schema: schemaName, offset: page.offset, total: page.total };
    })),
    vscode.commands.registerCommand("jadeNative.moreObjectInstances", (row) =>
      action(async () => {
        await classPage(row, true);
        events.fire();
      }),
    ),
    vscode.commands.registerCommand("jadeNative.firstObjectInstances", (row) =>
      action(async () => {
        await discardClassPage(row.oid);
        events.fire();
      }),
    ),
    vscode.commands.registerCommand("jadeNative.copyObjectOid", (value) =>
      action(() => copyOid(value)),
    ),
    vscode.commands.registerCommand(
      "jadeNative.openObjectClassSource",
      (value) => action(() => openClassSource(value)),
    ),
    vscode.commands.registerCommand("jadeNative.inspectObject", (oid) =>
      action(async () => {
        if (typeof oid !== "string")
          oid = await vscode.window.showInputBox({
            title: "Inspect native Jade object",
            prompt: "Jade object ID from this database",
            validateInput: validateObjectIdentity,
          });
        if (oid) return inspect(oid);
      }),
    ),
    vscode.commands.registerCommand("jadeNative.toggleSystemObjects", () =>
      action(async () => {
        showSystem = !showSystem;
        await resetPages();
        if (session.client) await loadCatalog();
        events.fire();
      }),
    ),
    vscode.commands.registerCommand("jadeNative.toggleObjectSubclasses", () =>
      action(async () => {
        subclasses = !subclasses;
        await resetPages();
        view.title =
          "Database Objects" + (subclasses ? " · Include subclasses" : "");
        events.fire();
      }),
    ),
  );
  return {
    session,
    provider,
    view,
    classCatalogue,
    browseInstances,
    ownsLock: () => lock,
    releaseForOperation: async () => {
      if (session.client || lock) {
        await session.disconnect();
        if (lock) {
          lockOwner = undefined;
          await setLock(false);
        }
      }
      return !disposed;
    },
  };
}
function objectHtml(csp, nonce, asset) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset("elements-lite.css")}"><link rel="stylesheet" href="${asset("objects.css")}"></head><body>
<header class="page-header"><div><div class="eyebrow">JADE / OBJECT EXPLORER</div><h1 id="title">Loading object…</h1><p id="schema"></p></div><span class="badge readonly-badge">Read-only</span></header>
<section class="connection-bar" aria-label="Database connection"><button class="environment" id="database" title="Select Working or Source database"><span id="environment">Working database</span><span aria-hidden="true">⌄</span></button><span class="connection-status" id="connection-status"><span class="status-dot"></span><span id="status-label">Connecting</span></span><p id="connection" class="connection-path"></p><button class="quiet-button" id="focusExplorer" title="Show schemas, classes and instances in the sidebar">Database Objects ↗</button></section>
<nav class="object-toolbar" aria-label="Object navigation"><div class="toolbar-group"><button class="vscode-button secondary" id="back" title="Previous inspected object (Alt+Left)">← Back</button><button class="vscode-button secondary" id="forward" title="Next inspected object (Alt+Right)">Forward →</button></div><div class="toolbar-group"><button class="vscode-button secondary" id="refresh" title="Retrieve the object's current database values">Refresh</button><details class="inspection-more" id="inspection-more" open><summary>More</summary><div class="more-actions"><label class="history-label"><span class="sr-only">Inspection history</span><select id="history" aria-label="Inspection history"><option>History</option></select></label><button class="vscode-button secondary" id="pin" aria-pressed="false" title="Keep this tab when opening other objects">Pin tab</button></div></details><button class="vscode-button secondary" id="source" title="Open this class in the workspace source browser">Open class source</button></div></nav>
<div class="identity-bar"><p class="identity" id="identity"></p><button class="quiet-button" id="copyOid" title="Copy the complete object identifier (Ctrl+Shift+C)">Copy ID</button></div><p id="state" class="state" role="status"></p><p id="pin-help" class="help"></p><p id="origin" class="help"></p>
<section class="card" id="object-properties"><div class="section-heading"><h2>Properties <span class="count" id="property-count"></span></h2><label class="filter-label"><span class="sr-only">Filter properties</span><input class="vscode-textfield" type="search" id="properties-filter" placeholder="Find a property or value…" aria-label="Filter property names, types and values"></label></div><div class="table-wrap"><table><caption class="sr-only">Object properties and values</caption><thead><tr><th scope="col">Property</th><th scope="col">Type</th><th scope="col">Value</th></tr></thead><tbody id="properties"></tbody></table></div></section>
<section class="card" id="collection" hidden><div class="collection-heading"><div><h2>Collection entries <span class="count" id="entry-count"></span></h2><p class="help">Native keys and indexes. Open a reference to inspect its object.</p></div><div class="pager"><label class="page-size-label">Page size<select id="page-size" aria-label="Entries per page"><option value="25">25</option><option value="50">50</option><option value="100" selected>100</option></select></label><button class="vscode-button secondary" id="first" title="Restart collection traversal at its first entry">First</button><button class="vscode-button secondary" id="next" title="Retrieve the next page in native collection order">Next →</button></div></div>
<div class="filters"><label class="filter-label"><span class="sr-only">Filter entries on this page</span><input class="vscode-textfield" type="search" id="entries-filter" placeholder="Filter this page…" aria-label="Filter entries on the current page"></label><label class="sort-label">Display order<select id="entries-sort"><option value="native">Native order</option><option value="key-asc">Key / index ↑</option><option value="key-desc">Key / index ↓</option><option value="value-asc">Value A → Z</option><option value="value-desc">Value Z → A</option><option value="type-asc">Type A → Z</option></select></label><details class="column-picker"><summary>Columns</summary><div><label><input id="show-key" type="checkbox" checked> Key / index</label><label><input id="show-type" type="checkbox" checked> Type</label></div></details></div><p class="help" id="display-note">Filtering and display order apply to this page only. Native collection order is unchanged.</p>
<div class="table-wrap"><table><caption class="sr-only">Collection entries on the current page</caption><thead><tr><th scope="col" class="key-column">Key / index</th><th scope="col" class="type-column">Type</th><th scope="col">Value</th></tr></thead><tbody id="entries"></tbody></table></div><footer class="page-footer"><p id="page-status" role="status"></p><button class="quiet-button" id="clear-filter" hidden>Clear page filter</button></footer></section>
<p class="keyboard-help">Tab between controls · Enter opens references · Alt+Left / Right navigates history · Ctrl+Shift+C copies the object ID</p>
<script nonce="${nonce}" src="${asset("object-page.js")}"></script><script nonce="${nonce}" src="${asset("objects.js")}"></script></body></html>`;
}
module.exports = { registerObjectExplorer, objectHtml };
