"use strict";
const path = require("node:path"),
  crypto = require("node:crypto");
const { InspectionSession } = require("./object-session"),
  { CliInspectionTransport } = require("./CliInspectionTransport");
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
    instanceCatalogues = new Map(),
    pageLoads = new Map(),
    pageConsumers = new WeakMap(),
    treeConsumer = {},
    classVersions = new Map(),
    classOffsets = new Map(),
    schemaNodes = new Map();
  let catalog,
    classBrowser,
    classCatalogue,
    currentConfig,
    currentTarget,
    status,
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
    connectionOperation,
    browseVersion = 0,
    inspectionTransitions = Promise.resolve();
  // Target, project and connection changes share one lane; callers retain request ownership across awaits.
  function serializeInspectionTransition(operation) {
    const pending = inspectionTransitions.then(operation);
    inspectionTransitions = pending.catch(() => {});
    return pending;
  }
  const setLock = async (value) => {
    lock = value;
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
      const generation = session.generation, owner = {};
      if (services.isBusy()) throw Error('Another Jade operation is running. Wait for it to finish before connecting Object Explorer.');
      const config = await configuration();
      if (generation !== session.generation) throw Error('Inspection connection was cancelled.');
      if (services.isBusy()) throw Error('Another Jade operation started while selecting database settings.');
      const operation = connectionOperation;
      const target = await services.inspectionTarget(
        { ...config, ...(operation ? { signal: operation.controller.signal } : {}) },
        selection,
        text => {
          if (!disposed) output.append(text);
          operation?.report(text);
        },
      );
      if (generation !== session.generation) throw Error('Inspection connection was cancelled.');
      if (services.isBusy()) throw Error('Another Jade operation started while resolving the database target.');
      operation?.report('Connecting the native read-only session and loading classes…');
      lockOwner = owner;
      await setLock(true);
      let client;
      try {
        if (generation !== session.generation || lockOwner !== owner) throw Error('Inspection connection was cancelled.');
        currentConfig = config;
        currentTarget = { ...target, selection };
        refreshDescription();
        const authentication = credentials;
        credentials = undefined;
        const options = {
          config: { ...config, ...(authentication || {}), readOnly: true },
          target: selection,
          catalogArgs: { includeSystem: showSystem },
        };
        client = services.createTransport
          ? services.createTransport(options)
          : new CliInspectionTransport(services.client, options);
        client.on('output', text => { if (!disposed) output.append(text); operation?.report(text); });
        client.on('failure', error => { if (!disposed) output.appendLine(error.message); });
        client.once('close', () => {
          if (lockOwner === owner) {
            lockOwner = undefined;
            void setLock(false);
          }
        });
        return client;
      } catch (error) {
        if (lockOwner === owner) {
          lockOwner = undefined;
          await setLock(false);
        }
        throw error;
      }
    },
  });
  function refreshDescription() {
    if (disposed) return;
    const state = connectionOperation ? (connectionOperation.cancelling ? 'Cancelling' : 'Connecting') : 'Read-only';
    if (status) status.text = (connectionOperation ? "$(loading~spin)" : "$(database)") + " Jade Inspect: " + (session.target === "working" ? "Working" : "Source") + " · " + state;
    if (!view) return;
    const label =
      session.target === "working" ? "Working database" : "Source database";
    view.description = label + " · " + state;
    if (connectionOperation) {
      view.message = connectionOperation.message || 'Connecting…';
      return;
    }
    view.message =
      (currentTarget?.selection === session.target
        ? currentTarget.databasePath
        : "Select database settings when connecting") +
      "\n" +
      (session.client
        ? "Connected. Compatible tools reuse the native connection."
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
    for (const record of instanceCatalogues.values()) void record.controller.update().catch(() => {});
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
    for(const record of instanceCatalogues.values()) void record.controller.update().catch(()=>{});
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
    for(const record of instanceCatalogues.values()) if(record.generation===session.generation && record.oid===oid) void record.controller.update().catch(()=>{});
  }
  function loadCatalog(reloadEpoch = true) {
    const client = session.client, target = session.target,
      generation = session.generation,
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
          if (error.code === 'JADE_INSPECTION_EPOCH_CHANGED' && client === session.client && target === session.target && !disposed) {
            if (catalogRequest && catalogRequest !== request) return catalogRequest;
            if (reloadEpoch) return loadCatalog(false);
          }
          if (version !== catalogVersion && generation === session.generation)
            return catalogRequest;
          throw error;
        },
      );
    catalogRequest = request;
    return request;
  }
  function cancelPageConsumer(oid, owner) {
    const pending=pageLoads.get(oid),consumers=pending && pageConsumers.get(pending);
    if(!consumers)return;
    consumers.delete(owner);
    if(!consumers.size){classVersions.set(oid,(classVersions.get(oid)||0)+1);pageLoads.delete(oid);}
  }
  function classPage(row, next = false, owner = treeConsumer) {
    if (pageLoads.has(row.oid)) { const pending=pageLoads.get(row.oid);pageConsumers.get(pending)?.add(owner);return pending; }
    const consumers=new Set([owner]);
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
          consumers.size === 0 ||
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
        const record=instanceCatalogues.get(instanceCatalogueKey(row));
        if(record) { record.page=current; void record.controller.update().catch(error=>output.appendLine(error.message)); }
        return current;
      })
      .finally(() => {
        if (pageLoads.get(row.oid) === request) pageLoads.delete(row.oid);
      });
    pageConsumers.set(request,consumers);
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
  session.on("invalidated", invalidate);
  function connect() {
    if (connectionOperation) return connectionOperation.promise;
    const operation = {
      controller: new AbortController(),
      report: () => {},
    };
    connectionOperation = operation;
    operation.promise = (async () => {
      await vscode.commands.executeCommand('setContext', 'jadeNative.connectingObjects', true);
      refreshDescription();
      events.fire();
      return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Connecting to ' + (session.target === 'working' ? 'Working' : 'Source') + ' database',
        cancellable: true,
      }, async (progress, cancellation) => {
        operation.report = text => {
          if (disposed || connectionOperation !== operation || operation.controller.signal.aborted) return;
          const message = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1);
          if (message) {
            operation.message = message.slice(0, 200);
            progress.report({ message: operation.message });
            refreshDescription();
            events.fire();
          }
        };
        const subscription = cancellation.onCancellationRequested(() => {
          void cancelConnection().catch(error => { if (!disposed) output.appendLine(error.message); });
        });
        try {
          if (operation.controller.signal.aborted) return { cancelled: true };
          operation.report(session.target === 'working'
            ? 'Preparing Working. First use may require a Source backup and Working restore…'
            : 'Opening the native read-only Source connection…');
          return await connectOnce();
        } catch (error) {
          if (!operation.controller.signal.aborted) throw error;
          if (!disposed) output.appendLine('Inspection cancelled after the native operation finished: ' + error.message);
          return { cancelled: true };
        } finally { subscription.dispose(); }
      });
    })().finally(async () => {
      if (connectionOperation !== operation) return;
      connectionOperation = undefined;
      await vscode.commands.executeCommand('setContext', 'jadeNative.connectingObjects', false);
      refreshDescription();
      events.fire();
    });
    return operation.promise;
  }
  async function cancelConnection() {
    const operation = connectionOperation;
    if (operation) operation.cancelling = true;
    operation?.report('Cancellation requested. Waiting for the current native step to finish safely…');
    operation?.controller.abort();
    await session.disconnect();
    if (operation) await operation.promise;
  }
  async function connectOnce() {
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
    return { ...row, kind: "class", id: row.browserId, inspectionGeneration: session.generation,
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
  async function revealClass(selected, generation = session.generation, isCurrent = () => true) {
    if (!isCurrent()) return;
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
    if (!isCurrent()) return;
    const target = classChildren(schema).find(item => item.kind === "class" && item.name === row.name);
    await view.reveal(target, { select: true, focus: true, expand: false });
    return { schema: row.schema, name: row.name, offset: position.offset, readOnly: true };
  }
  async function browseInstances(value) {
    if (!value || typeof value.schema !== "string" || typeof value.className !== "string" || typeof value.projectRoot !== "string")
      throw Error("Choose a workspace class with an explicit project and schema.");
    const version = ++browseVersion;
    const ownsTransition = () => version === browseVersion && !disposed;
    const requestedRoot = path.resolve(value.projectRoot);
    const unavailable = async error => {
      if (!ownsTransition()) return { cancelled: true };
      const reason = diagnostic(error);
      const selected = await vscode.window.showErrorMessage(reason, "Open Jade settings");
      if (!ownsTransition()) return { cancelled: true };
      if (selected === "Open Jade settings") await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:jade-local-tools.jade-native-runner-cpp-preview");
      return { available: false, reason, projectRoot: requestedRoot, target: session.target };
    };
    let config;
    try { config = await services.config(undefined, { name: path.basename(requestedRoot), uri: vscode.Uri.file(requestedRoot) }); }
    catch (error) { return unavailable(error); }
    let workingPath;
    try { workingPath = (await services.workingLocation(config)).databasePath; } catch { workingPath = "Unavailable · compile first to create a working database"; }
    if (!ownsTransition()) return { cancelled: true };
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
    try {
      const connected = await serializeInspectionTransition(async () => {
        if (!ownsTransition()) return false;
        const sameProject = currentConfig?.workspaceRoots?.some(root => path.resolve(root).toLowerCase() === requestedRoot.toLowerCase());
        if (session.disconnecting || (session.client && (!sameProject || session.target !== choice.target))) await session.disconnect();
        if (!ownsTransition()) return false;
        if (session.target !== choice.target) await session.select(choice.target);
        if (!ownsTransition()) return false;
        inspectionScope = requestedRoot;
        if (!session.client) await connect();
        if (!ownsTransition()) return false;
        if (!classBrowser) await loadCatalog();
        return ownsTransition();
      });
      if (!connected) return { cancelled: true };
    } catch (error) { return unavailable(error); }
    if (version !== browseVersion || disposed) return { cancelled: true };
    const row = classBrowser.rows.find(item => item.schema === value.schema && item.name === value.className);
    if (!row) {
      const message = value.schema + "::" + value.className + " is not installed in the selected " + choice.label + ". Local source remains available. Publish explicitly to add it, or choose another inspection database.";
      const configure = await vscode.window.showInformationMessage?.(message, "Choose database");
      if (!ownsTransition()) return { cancelled: true };
      if (configure === "Choose database") await vscode.commands.executeCommand("jadeNative.selectInspectionDatabase");
      return { available: false, reason: message, target: session.target, databasePath: currentTarget?.databasePath, projectRoot: requestedRoot };
    }
    const generation = session.generation;
    let revealed;
    try { revealed = await revealClass(row, generation, () => version === browseVersion && generation === session.generation && !disposed); }
    catch (error) { if (generation !== session.generation || version !== browseVersion || disposed) return { cancelled: true }; throw error; }
    if (!revealed || version !== browseVersion || generation !== session.generation || disposed) return { cancelled: true };
    const node = classNode(row);
    try {
      await classPage(node);
      if (!ownsTransition() || generation !== session.generation) return { cancelled: true };
      await view.reveal(node, { select: true, focus: true, expand: true });
    } catch (error) {
      if (!ownsTransition() || generation !== session.generation) return { cancelled: true };
      throw error;
    }
    if (!ownsTransition() || generation !== session.generation) return { cancelled: true };
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
          cancel: "close",
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
              ...(connectionOperation ? [{
                kind: 'cancel',
                name: connectionOperation.cancelling ? 'Cancelling connection…' : 'Cancel connection',
                command: connectionOperation.cancelling ? undefined : 'jadeNative.cancelObjectInspection',
              }] : [{
                kind: session.client ? "disconnect" : "connect",
                name: session.client ? "Disconnect" : "Connect to database",
                description: session.client
                  ? currentTarget?.databasePath
                  : undefined,
                command: session.client
                  ? "jadeNative.disconnectObjects"
                  : "jadeNative.connectObjects",
              }]),
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
  function instanceCatalogueKey(row) { return JSON.stringify([session.generation, row.schema, row.oid]); }
  async function filterInstances(row) {
    if (!row || row.kind !== 'class' || row.inspectionGeneration !== session.generation || !session.client) throw Error('Choose a class in the connected Database Objects view.');
    const generation=session.generation, key=instanceCatalogueKey(row);
    let record=instanceCatalogues.get(key);
    if (!record) {
      if(instanceCatalogues.size>=12) throw Error('Close an instance search tab before opening another (12 tabs maximum).');
      const page=pages.get(row.oid) || await classPage(row);
      if (!page || generation!==session.generation || disposed) return;
      const existing=instanceCatalogues.get(key);
      if(existing){await existing.controller.show();return existing.controller;}
      if(instanceCatalogues.size>=12){await discardClassPage(row.oid);throw Error('Close an instance search tab before opening another (12 tabs maximum).');}
      const connection={target:session.target,path:currentTarget?.databasePath};
      record={page,generation,oid:row.oid,closed:false};
      const connected=()=>!disposed && generation===session.generation && !!session.client;
      const active=()=>connected() && !record.closed;
      record.controller=registerClassCatalogue(vscode,context,{
        scope:'instances:'+key, label:row.schema+'::'+row.name+' · Instances',
        presentation:{instance:true,title:row.schema+'::'+row.name+' · Instances', intro:'Filter the current native page of up to 100 instances. Search Object ID, class or schema. First and Next load native pages; filtering does not scan the database or read object properties.', searchLabel:'Object ID, class or schema · current page',placeholder:'Filter current page'},
        getRows:()=>({scope:'instances:'+key,generation,
          label:row.schema+'::'+row.name+' · '+connection.target+' · '+connection.path+' · Read-only',
          rows:record.page.items.map(item=>({...item,schema:item.schema||row.schema,name:item.oid,className:item.className||row.name,searchText:item.className||row.name})),
          nativePaging:{number:record.page.number||1,hasMore:!!record.page.hasMore && pages.get(row.oid)===record.page,stale:!active(),cursorReleased:active() && pages.get(row.oid)!==record.page}}),
        nativePage:async next=>{ if(!active())return; if(!next)await discardClassPage(row.oid); if(!active())return; const page=await classPage(row,next,record); if(page&&active()){record.page=page;events.fire(row);} },
        refreshPage:async()=>{if(!active())return;await discardClassPage(row.oid);if(!active())return;const page=await classPage(row,false,record);if(page&&active()){record.page=page;events.fire(row);}},
        openClass:item=>{if(!active())throw Error('The instance snapshot is disconnected.');return inspect(item.oid);},
        onClose:()=>{
          record.closed=true;
          if(instanceCatalogues.get(key)===record)instanceCatalogues.delete(key);
          if(connected()){
            cancelPageConsumer(row.oid,record);
            const pending=pageLoads.get(row.oid);
            if(!pending && pages.get(row.oid)===record.page)void discardClassPage(row.oid).catch(()=>{});
          }
          record.page={items:[],number:1,hasMore:false};
        },
      });
      instanceCatalogues.set(key,record);
    }
    await record.controller.show();
    return record.controller;
  }
  if (view.onDidCollapseElement)
    context.subscriptions.push(
      view.onDidCollapseElement(({ element }) => {
        if (element.kind !== "class") return;
        void discardClassPage(element.oid);
      }),
    );
  refreshDescription();
  status = vscode.window.createStatusBarItem(
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
    const projectRoot = value?.connection?.projectRoot || value?.projectRoot || inspectionScope || currentConfig?.workspaceRoots?.[0];
    const result = await vscode.commands.executeCommand(
      "jadeNative.findSourceClass",
      name,
      schema,
      projectRoot,
    );
    if (result?.opened === false) {
      const choice = await vscode.window.showInformationMessage?.(
        "No workspace source was found for " +
          schema +
          "::" +
          name +
          ". Pull the schema source to browse its definitions.",
          ...(services.pullSource ? ["Pull source…"] : []),
      );
      if (choice === "Pull source…") await services.pullSource?.({ schema, className: name, projectRoot });
    }
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
    let source = { available: false, reason: "Local source metadata is unavailable." };
    try { source = await services.sourceContext?.({ schema: object.schema, className: object.className, projectRoot: inspectionScope || currentConfig?.workspaceRoots?.[0] }) || source; }
    catch (error) { source = { available: false, reason: diagnostic(error) }; }
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
                record.readTicket = {};
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
                  record.cursor = page.cursor;
                  record.readAt = new Date().toISOString();
                  Object.assign(record.history.current(), {
                    page,
                    limit: record.limit,
                    readAt: record.readAt,
                    error: undefined,
                  });
                } catch (error) {
                  if (record.revision === revision && generation === session.generation) {
                    record.error = diagnostic(error);
                    Object.assign(record.history.current(), { error: record.error });
                  }
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
    record.source = source;
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
    record.history.visit({ object, source, page: record.page, connection: record.connection, readAt: record.readAt, limit: record.limit, origin: record.origin, error: record.error });
    record.panel.title = object.className + " · " + oid;
    record.panel.reveal();
    await sendObject(record);
    await record.rendered;
    return { oid, className: object.className, readOnly: true };
  }
  async function restoreSnapshot(record, snapshot) {
    if (!snapshot) return;
    const revision = (record.revision || 0) + 1;
    record.revision = revision;
    record.readTicket = {};
    await releaseCursor(record);
    if (record.disposed || record.revision !== revision) return;
    Object.assign(record, snapshot, { pendingAction: undefined });
    record.panel.title = record.object.className + " · " + record.object.oid;
    // Native cursors were released on navigation. Restart explicitly with First.
    if (record.page) record.page = { ...record.page, hasMore: false, restartRequired: true };
    return sendObject(record);
  }
  async function sendObject(record) {
    if (!record.object || record.disposed) return;
    return record.panel.webview.postMessage({
      command: "object",
      object: record.object,
      source: record.source,
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
        entries: record.history.entries.map(({ object }) => ({ oid: object.oid, schema: object.schema, className: object.className })),
        position: record.history.position,
        back: record.history.position > 0,
        forward: record.history.position < record.history.entries.length - 1,
      },
    });
  }
  async function configurationChanged() {
    ++browseVersion;
    credentials = undefined;
    currentTarget = undefined;
    await cancelConnection();
    refreshDescription();
  }
  for (const subscription of [
    vscode.workspace.onDidChangeConfiguration?.(event => {
      if (event.affectsConfiguration("jadeNative")) return configurationChanged().catch(error => output.appendLine(error.message));
    }),
    vscode.workspace.onDidSaveTextDocument?.(document => {
      if (document.uri.scheme === "file" && path.basename(document.uri.fsPath).toLowerCase() === "jade.json" &&
          currentConfig?.workspaceRoots?.some(root => path.resolve(root, "jade.json") === path.resolve(document.uri.fsPath)))
        return configurationChanged().catch(error => output.appendLine(error.message));
    }),
  ]) if (subscription) context.subscriptions.push(subscription);
  context.subscriptions.push(
    events,
    output,
    view,
    status,
    {
      dispose() {
        disposed = true;
        connectionOperation?.controller.abort();
        for (const record of panels) record.panel.dispose();
        // The shared CLI service may already be disposed during extension shutdown.
        void session.disconnect().catch(() => {});
      },
    },
    vscode.commands.registerCommand("jadeNative.selectInspectionDatabase", () =>
      action(async () => {
        const version = ++browseVersion;
        const ownsTransition = () => version === browseVersion && !disposed;
        let config;
        try {
          config = await configuration();
        } catch {}
        if (!ownsTransition()) return { cancelled: true };
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
        if (!choice || !["source", "working"].includes(choice.target)) return;
        return serializeInspectionTransition(async () => {
          if (!ownsTransition()) return { cancelled: true };
          if (connectionOperation) await cancelConnection();
          if (!ownsTransition()) return { cancelled: true };
          await session.select(choice.target);
          if (!ownsTransition()) return { cancelled: true };
          currentTarget = undefined;
          refreshDescription();
          events.fire();
          return { selection: choice.target, readOnly: true };
        });

      }),
    ),
    vscode.commands.registerCommand("jadeNative.connectObjects", () =>
      {
        if (connectionOperation?.actionPromise) return connectionOperation.actionPromise;
        const pending = action(connect);
        if (connectionOperation) connectionOperation.actionPromise = pending;
        return pending;
      },
    ),
    vscode.commands.registerCommand("jadeNative.disconnectObjects", () =>
      action(async () => {
        if (services.isBusy()) throw Error('Wait for the current Jade operation or cancel it first.');
        ++browseVersion;
        if (connectionOperation) await cancelConnection();
        const target = session.target, generation = session.generation;
        const config = currentConfig || await configuration();
        if (target !== session.target || generation !== session.generation) throw Error('Database selection changed while disconnecting.');
        if (services.isBusy()) throw Error('Wait for the current Jade operation or cancel it first.');
        const client = session.client;
        await session.disconnect({ disconnect: true });
        if (!client) {
          if (services.disconnectTarget) await services.disconnectTarget(config, target);
          else await CliInspectionTransport.disconnectTarget(services.client, { config, target });
        }
      }),
    ),
    vscode.commands.registerCommand("jadeNative.cancelObjectInspection", () =>
      action(() => { ++browseVersion; return cancelConnection(); }),
    ),
    vscode.commands.registerCommand("jadeNative.refreshObjects", () =>
      action(async () => {
        await resetPages();
        await connect();
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
    vscode.commands.registerCommand("jadeNative.filterObjectInstances", row => action(() => filterInstances(row))),
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
    instanceCatalogue: row => instanceCatalogues.get(instanceCatalogueKey(row))?.controller,
    browseInstances,
    ownsLock: () => lock,
    releaseForOperation: async () => {
      ++browseVersion;
      await cancelConnection();
      if (lock) {
        lockOwner = undefined;
        await setLock(false);
      }
      return !disposed;
    },
  };
}
function objectHtml(csp, nonce, asset) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset("elements-lite.css")}"><link rel="stylesheet" href="${asset("objects.css")}"></head><body>
<header class="page-header"><div><div class="eyebrow">JADE / OBJECT EXPLORER</div><h1 id="title">Loading object…</h1><p id="schema"></p><p id="project" class="help"></p><p id="source-context" class="help"></p></div><span class="badge readonly-badge">Read-only</span></header>
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
