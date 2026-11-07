"use strict";
const path = require("node:path"),
  crypto = require("node:crypto");
const { ClassBrowserModel } = require("./class-browser-model");
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function registerClassCatalogue(vscode, context, options) {
  let panel,
    ready = false,
    disposed = false,
    fetchGeneration = 0,
    revision = 0,
    renderedRevision = 0,
    renderedRows = 0,
    loading = false,
    metadata = {
      scope: options.scope || "workspace",
      label: options.label || "Jade classes",
    },
    model = new ClassBrowserModel({ scope: metadata.scope }),
    filter = { query: "", offset: 0 },
    selectedId = "", scrollTop = 0,
    lastPayload;
  const listeners = [];
  function viewRow(row) {
    const parent = [
      row.parent,
      row.base,
      row.superclass,
      row.superclassName,
    ].find((value) => typeof value === "string" && value);
    return {
      browserId: row.browserId,
      name: row.name,
      schema: row.schema,
      projectName: row.projectName,
      ...(parent ? { parent } : {}),
      ...(typeof row.kind === "string" && row.kind ? { kind: row.kind } : {}),
      position: row.position,
    };
  }
  function publish() {
    if (!panel || disposed) return;
    const page = model.page({ ...filter, limit: 100 }),
      suggestions = filter.query.trim()
        ? model
            .search(filter.query, { schema: filter.schema, limit: 10 })
            .items.map(viewRow)
        : [];
    const columns = ["name", "schema"];
    if (model.rows.some(row => row.projectName)) columns.push("projectName");
    if (model.rows.some((row) => viewRow(row).parent)) columns.push("parent");
    else if (model.rows.some((row) => viewRow(row).kind)) columns.push("kind");
    lastPayload = {
      command: "catalogue",
      revision: ++revision,
      label: metadata.label,
      scope: metadata.scope,
      loading,
      filter: { ...filter },
      selectedId, scrollTop,
      schemas: model.schemas(),
      columns,
      page: { ...page, items: page.items.map(viewRow) },
      suggestions,
    };
    if (ready) void panel.webview.postMessage(lastPayload);
    return lastPayload;
  }
  function invalidate() {
    ++fetchGeneration;
    loading = true;
    model = new ClassBrowserModel({ scope: metadata.scope });
    publish();
  }
  async function refresh() {
    const generation = ++fetchGeneration;
    loading = true;
    publish();
    try {
      const value = await options.getRows();
      if (disposed || generation !== fetchGeneration) return;
      const next = Array.isArray(value) ? { rows: value } : value;
      if (!next || !Array.isArray(next.rows))
        throw Error("Class catalogue requires metadata rows");
      metadata = {
        scope: next.scope || options.scope || "workspace",
        label: next.label || options.label || "Jade classes",
        generation: next.generation,
      };
      model = new ClassBrowserModel({ scope: metadata.scope });
      model.setClasses(next.rows);
      if (
        filter.schema &&
        !model.schemas().some((row) => row.name === filter.schema)
      )
        filter.schema = undefined;
      loading = false;
      return publish();
    } catch (error) {
      if (disposed || generation !== fetchGeneration) return;
      if (generation === fetchGeneration) {
        loading = false;
        publish();
        if (ready)
          void panel?.webview.postMessage({
            command: "error",
            message: error.message,
          });
      }
      throw error;
    }
  }
  async function setFilter(value = {}) {
    if (typeof value.query !== "undefined" && typeof value.query !== "string")
      throw Error("Invalid class search");
    if (typeof value.schema !== "undefined" && typeof value.schema !== "string")
      throw Error("Invalid class schema");
    if (value.query?.length > 4096) throw Error("Class search is too long");
    const next = {
      query: value.query ?? filter.query,
      schema: Object.hasOwn(value, "schema")
        ? value.schema || undefined
        : filter.schema,
      offset: value.offset ?? 0,
    };
    model.page(next);
    filter = next;
    return publish();
  }
  async function open(id) {
    if (loading) throw Error("Class catalogue is refreshing");
    if (typeof id !== "string" || id.length > 16384)
      throw Error("Unknown class identity");
    let identity;
    try {
      identity = JSON.parse(id);
    } catch {
      throw Error("Unknown class identity");
    }
    if (
      !Array.isArray(identity) ||
      ![3,4].includes(identity.length) ||
      identity[0] !== metadata.scope
    )
      throw Error("Unknown class identity");
    const row = model.find({ schema: identity[1], name: identity[2], projectId: identity[3] });
    if (!row || row.browserId !== id) throw Error("Unknown class identity");
    selectedId = id;
    return options.openClass(row, {
      scope: metadata.scope,
      generation: metadata.generation,
      filter: { ...filter }, selectedId, scrollTop,
    });
  }
  async function receive(message) {
    if (!panel || disposed) return;
    if (message?.command === "ready") {
      ready = true;
      publish();
    } else if (message?.command === "query")
      await setFilter({
        query: message.query,
        schema: message.schema,
        offset: message.offset,
      });
    else if (message?.command === "refresh") await refresh();
    else if (message?.command === "open") {
      if (Number.isFinite(message.scrollTop)) scrollTop = Math.max(0, Math.min(10000000,message.scrollTop));
      await open(message.id);
    }
    else if (
      message?.command === "rendered" &&
      message.revision === revision &&
      Number.isInteger(message.rowsRendered) &&
      message.rowsRendered === lastPayload?.page.items.length
    ) {
      renderedRevision = revision;
      renderedRows = message.rowsRendered;
    }
  }
  function create() {
    panel = vscode.window.createWebviewPanel(
      "jadeClassCatalogue",
      options.label || "Jade classes",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
        ],
      },
    );
    const current = panel;
    ready = false;
    const nonce = crypto.randomBytes(16).toString("base64"),
      uri = (name) =>
        escape(
          current.webview
            .asWebviewUri(
              vscode.Uri.file(path.join(context.extensionPath, "media", name)),
            )
            .toString(),
        );
    current.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escape(current.webview.cspSource)}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${uri("class-catalogue.css")}"><title>${escape(options.label || "Jade classes")}</title></head><body><header><h1 id="title">${escape(options.label || "Jade classes")}</h1><p>Search the full class catalogue. Open a class to explore its members.</p></header><section class="toolbar" aria-label="Class search"><label class="search">Class or schema<input id="query" type="search" list="suggestions" autocomplete="off" placeholder="Search all classes" aria-controls="classes"><datalist id="suggestions"></datalist></label><label>Schema<select id="schema" aria-controls="classes"><option value="">All schemas</option></select></label><button id="refresh" type="button">Refresh</button></section><p id="error" role="alert" hidden></p><div class="table-wrap"><table id="classes"><thead id="head"></thead><tbody id="rows"></tbody></table><p id="empty" hidden>No matching classes.</p></div><footer><span id="count" role="status" aria-live="polite">Loading classes…</span><nav aria-label="Class pages"><button id="previous" type="button" disabled>Previous</button><button id="next" type="button" disabled>Next</button></nav></footer><script nonce="${nonce}" src="${uri("class-catalogue.js")}"></script></body></html>`;
    listeners.push(
      current.webview.onDidReceiveMessage((message) =>
        receive(message).catch((error) =>
          current.webview.postMessage({
            command: "error",
            message: error.message,
          }),
        ),
      ),
      current.onDidDispose(() => {
        if (panel !== current) return;
        ++fetchGeneration;
        panel = undefined;
        ready = false;
        lastPayload = undefined;
        for (const listener of listeners.splice(0)) listener.dispose();
      }),
    );
  }
  async function show(value = {}) {
    if (disposed) throw Error("Class catalogue is disposed");
    const reused = !!panel;
    if (!panel) create();
    else panel.reveal(vscode.ViewColumn.Active);
    if (value.restore) {
      const restore=value.restore;
      await setFilter(restore.filter || {});
      selectedId=typeof restore.selectedId==='string'?restore.selectedId:'';
      scrollTop=Number.isFinite(restore.scrollTop)?Math.max(0,restore.scrollTop):0;
    }
    if (Object.hasOwn(value, "schema"))
      filter = { query: "", schema: value.schema || undefined, offset: 0 };
    await refresh();
    return {
      shown: !!panel,
      reused,
      scope: metadata.scope,
      total: model.rows.length,
    };
  }
  const controller = {
    show,
    refresh,
    invalidate,
    setFilter,
    open,
    snapshot: () => lastPayload,
    get panel() {
      return panel;
    },
    get renderedRows() {
      return renderedRows;
    },
    get renderedRevision() {
      return renderedRevision;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++fetchGeneration;
      const current = panel;
      panel = undefined;
      current?.dispose();
      for (const listener of listeners.splice(0)) listener.dispose();
    },
  };
  context.subscriptions.push(controller);
  return controller;
}
module.exports = {
  registerClassCatalogue,
  createClassCatalogue: registerClassCatalogue,
};
