"use strict";
const path = require("node:path"), crypto = require("node:crypto");

// The webview handles presentation. This session owns project identity, bounded
// lookups and the exact native bytes the user reviewed before an explicit save.
function createDesignerSession({ post, projects, modelProvider, save, dirtyPaths = () => [], saved = async () => {} }) {
  let current, model, disposed = false, review, saving = false;
  const latest = new Map();
  const reply = message => disposed ? undefined : post(message);
  const fingerprint = value => JSON.stringify(value.files.map(f => [f.file, f.text]));
  async function handle(message) {
    if (disposed || !message || typeof message !== "object") return;
    const command = message.command;
    const channel = command === "search" ? "search:" + String(message.field || message.kind) : command;
    const sequence = Number.isSafeInteger(message.sequence) ? message.sequence : 0;
    const token = Symbol(); latest.set(channel, token);
    const fresh = () => !disposed && latest.get(channel) === token;
    try {
      if (command === "ready") return reply({ command: "projects", projects: projects.map(p => ({ id: p.id, name: p.name })) });
      if (command === "invalidate") { review = undefined; latest.delete("preview"); return; }
      if (command === "project") {
        if (saving) throw Error("Wait for the current save to finish.");
        const selected = projects.find(p => p.id === message.project);
        if (!selected) throw Error("Choose an open Jade source project.");
        current = undefined; model = undefined; review = undefined;
        latest.delete("preview");
        const next = await modelProvider(selected);
        if (!fresh()) return;
        current = selected; model = next;
        return reply({ command: "project", sequence, project: selected.id, page: model.schemas({ limit: 50 }), notice: model.notice });
      }
      if (!current || !model) throw Error("Choose a project first.");
      const project = current, activeModel = model;
      if (command === "search" || command === "schemas" || command === "properties") {
        const request = { schema: String(message.schema || ""), query: String(message.query || "").slice(0, 256), kind: message.kind === "member" ? "member" : "superclass", membership: String(message.membership || ""), collectionKind: message.collectionKind, offset: Math.max(0, Math.min(100000, Number(message.offset) || 0)), limit: Math.max(1, Math.min(50, Number(message.limit) || 50)) };
        const page = await (command === "schemas" ? activeModel.schemas(request) : command === "properties" ? activeModel.keyChoices(request) : activeModel.search(request));
        if (fresh() && project === current) return reply({ command, sequence, field: message.field, schema: request.schema, membership: request.membership, page });
      } else if (command === "preview") {
        review = undefined;
        const request = structuredClone(message.request);
        const generated = await activeModel.preview(request);
        if (!fresh() || project !== current) return;
        const receipt = crypto.randomBytes(24).toString("hex");
        review = { receipt, request, generated, fingerprint: fingerprint(generated), project };
        return reply({ command: "preview", sequence, receipt, summary: generated.summary, files: generated.files.map(f => ({ relativePath: f.relativePath || path.basename(f.file), text: f.text })) });
      } else if (command === "save") {
        if (saving) throw Error("A save is already running.");
        const approved = review;
        if (!approved || approved.project !== current || approved.receipt !== message.receipt) throw Error("Review the current native source before saving.");
        saving = true;
        try {
          const freshModel = await modelProvider(project);
          const checked = await freshModel.preview(approved.request);
          if (disposed) return;
          if (review !== approved) throw Error("The definition changed during save preparation. Review the current source before saving.");
          if (fingerprint(checked) !== approved.fingerprint) throw Error("Source definitions changed since review. Review the updated source before saving.");
          const result = await save(project.root, approved.generated, { dirtyPaths: dirtyPaths() });
          review = undefined;
          await saved(result);
          return reply({ command: "saved", sequence, files: result.files.map(f => typeof f === "string" ? path.basename(f) : f.relativePath || path.basename(f.file)) });
        } finally { saving = false; }
      }
    } catch (error) {
      if (fresh()) {
        const text = error.message || String(error), field = error.field || message.field || (/name|already exists/i.test(text) ? "name" : /member/i.test(text) ? "member" : /superclass/i.test(text) ? "superclass" : /schema/i.test(text) ? "schema" : undefined);
        return reply({ command: "error", sequence, operation: command, field, message: text });
      }
    }
  }
  return { handle, dispose() { disposed = true; review = undefined; latest.clear(); } };
}

function designerHtml({ nonce, cspSource, asset }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset("creation-designer.css")}"><title>Create Jade source</title></head><body>
  <header><div class="eyebrow">JADE TOOLS / CREATE</div><h1>Create something native.</h1><p>Define it here. Review the source. Save when you’re ready.</p><span class="badge">Local files only · no publish</span></header>
  <nav aria-label="Creation steps"><ol id="steps"><li aria-current="step">1 · Definition</li><li>2 · Keys &amp; rules</li><li>3 · Review</li></ol></nav>
  <form id="designer" novalidate><div class="layout"><main>
  <section class="card" id="definition"><h2>Definition</h2><div class="grid">
  <label>Project<select id="project" data-test="project"></select></label><label>Create<select id="kind" data-test="kind"><option value="class">Class</option><option value="collection">Collection</option><option value="schema">Schema</option></select></label>
  <label class="choice">Target schema<input id="schema" data-test="schema" autocomplete="off" aria-describedby="schema-help"><span class="results" id="schema-results" role="listbox" hidden></span><small id="schema-help">Search existing schemas in this project.</small></label>
  <label title="Collection class name identifies the new collection type"><span id="name-label">Class name</span><input id="name" data-test="name" autocomplete="off" aria-describedby="name-error"><small class="field-error" id="name-error"></small></label>
  <label class="schema-only choice" hidden>Parent schema<input id="parent" value="RootSchema" autocomplete="off"><span class="results" id="parent-results" role="listbox" hidden></span></label><label class="schema-only" hidden>Jade version<input id="version" placeholder="25.0.02" autocomplete="off"></label>
  <label class="not-schema">Lifetime<select id="lifetime"><option value="transient">Transient</option><option value="persistent">Persistent</option></select></label>
  <label class="collection-only" hidden>Dictionary<select id="dictionary"><option value="member">Member-key dictionary</option><option value="external">External-key dictionary</option></select></label>
  <label class="collection-only choice" hidden>Member class<input id="member" data-test="member" autocomplete="off" aria-describedby="member-help"><span class="results" id="member-results" role="listbox" hidden></span><small id="member-help">Search visible schema-qualified classes.</small></label>
  <label class="not-schema choice">Superclass<input id="superclass" value="Object" autocomplete="off"><span class="results" id="superclass-results" role="listbox" hidden></span></label>
  </div><p class="hint">Choices follow schema visibility. A folder name does not identify a Jade type.</p></section>
  <section class="card" id="rules" hidden><h2>Keys &amp; rules</h2><p>Keys run from top to bottom. Use the arrow buttons to change priority.</p><div id="keys"></div><button id="add-key" type="button" class="secondary">＋ Add key</button>
  <details><summary>Advanced settings</summary><label class="check"><input type="checkbox" id="duplicates">Allow duplicate keys</label><label> Btree load factor (%)<input id="load-factor" type="number" min="1" max="100" placeholder="Jade default"></label><p class="hint">Positive text locale IDs and ignore-case settings are supported. Binary/Latin1 modes and further collection families are not available in this flow yet.</p></details></section>
  <section class="card" id="review" hidden><h2>Review native source</h2><p>Saving creates source files only. Use Build or Publish separately.</p><div id="files"></div></section>
  </main><aside class="card"><div class="eyebrow">YOUR DEFINITION</div><h2 id="summary" data-test="summary">Start with a project and a schema.</h2><p id="status" role="status" aria-live="polite">Loading projects…</p><div id="error" data-test="error" role="alert" hidden></div><p id="catalog-notice" class="hint"></p><details id="live-source-details"><summary>Native source preview</summary><pre id="live-source" tabindex="0">Complete the definition to preview native source.</pre></details><p class="hint">Jade’s native compiler remains the authority. No database instances are created here.</p></aside></div>
  <footer><button id="cancel" type="button" class="secondary">Cancel</button><span class="spacer"></span><button id="back" data-test="back" type="button" class="secondary" hidden>Back</button><button id="next" data-test="next" type="button">Review source →</button><button id="save" data-test="save" type="submit" hidden disabled>Save source files</button></footer></form>
  <script nonce="${nonce}" src="${asset("creation-designer.js")}"></script></body></html>`;
}

function registerCreationDesigner(vscode, context, options = {}) {
  const { scanProject } = require("./native-project"), { createCreationModel } = require("./creation-model"), { writeCreation } = require("./creation-files");
  const { SystemTypeCache } = require("./system-type-cache"), { parseSource } = require("./source_symbols"), systemCache = new SystemTypeCache();
  const panels = new Set();
  const command = vscode.commands.registerCommand("jadeNative.createDefinition", async () => {
    const projects = (vscode.workspace.workspaceFolders || []).map((f, index) => ({ id: String(index), name: f.name, root: f.uri.fsPath, folder: f }));
    if (!projects.length) { await vscode.window.showErrorMessage("Open a Jade source workspace first."); return { error: "No workspace" }; }
    const panel = vscode.window.createWebviewPanel("jade.creation", "Create Jade Source", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))] });
    panels.add(panel);
    const session = createDesignerSession({
      projects, post: m => panel.webview.postMessage(m),
      modelProvider: async project => {
        const scanned = await scanProject(project.root);
        for (const document of vscode.workspace.textDocuments) {
          if (!document.isDirty || document.uri.scheme !== "file" || !/\.cls$/i.test(document.uri.fsPath) || vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() !== project.folder.uri.toString()) continue;
          const parsed = parseSource(document.getText(), document.uri.fsPath), schema = scanned.schemas.find(s => s.name === parsed.schema);
          for (const existing of scanned.schemas) existing.classes = existing.classes.filter(c => path.resolve(c.file).toLowerCase() !== path.resolve(document.uri.fsPath).toLowerCase());
          if (!schema) continue;
          for (const cls of parsed.classes) schema.classes.push({ file: document.uri.fsPath, owner: cls.name, model: parsed });
        }
        const settings = options.settings?.(project.folder) || vscode.workspace.getConfiguration("jadeNative", project.folder.uri);
        const subfolder = settings.extractionDirectory ?? settings.get?.("extractionDirectory") ?? ".";
        const sourceRoot = require("./extract").resolveExtractionDirectory(project.root, subfolder);
        const expanded = value => typeof value === "string" ? value.replace(/\$\{env:([^}]+)\}/g, (_, name) => process.env[name] || "").replaceAll("${workspaceFolder}", project.root).replaceAll("${userHome}", require("node:os").homedir()) : value;
        const installPath = expanded(settings.installPath ?? settings.get?.("installPath")) || process.env.JADE_INSTALL;
        const directory = expanded(settings.cacheDirectory ?? settings.get?.("cacheDirectory"));
        const storagePath = directory ? path.resolve(project.root, directory) : path.join(context.globalStorageUri.fsPath, "native");
        let cache, notice;
        try { cache = await systemCache.get({ installPath, storagePath, workspaceRoots: projects.map(p => p.root) }); }
        catch (error) { notice = "System type cache unavailable: " + error.message + ". Refresh the Jade type cache to restore system choices."; }
        if (!cache && !notice) notice = "System type cache not found. Refresh the Jade type cache for full RootSchema choices. Workspace classes and the supported base types remain available.";
        const model = createCreationModel(scanned, { sourceRoot, systemCache: cache });
        model.notice = (notice ? notice + " " : "") + "Choices follow schema ancestry; imported-package aliases are not resolved by this source catalogue.";
        return model;
      },
      save: writeCreation, dirtyPaths: () => vscode.workspace.textDocuments.filter(d => d.isDirty && ["file", "untitled"].includes(d.uri.scheme) && path.isAbsolute(d.uri.fsPath)).map(d => d.uri.fsPath),
      saved: async result => { const file = result.header || result.files[0]; if (file) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(typeof file === "string" ? file : file.file)); },
    });
    const listener = panel.webview.onDidReceiveMessage(async message => { if (message?.command === "cancel") { panel.dispose(); return; } await session.handle(message); });
    panel.onDidDispose(() => { panels.delete(panel); session.dispose(); listener.dispose(); });
    const asset = name => panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", name))).toString();
    panel.webview.html = designerHtml({ nonce: crypto.randomBytes(24).toString("hex"), cspSource: panel.webview.cspSource, asset });
    return { opened: true };
  });
  context.subscriptions.push(command);
  context.subscriptions.push({ dispose() { for (const panel of panels) panel.dispose(); panels.clear(); } });
  return command;
}
module.exports = { createDesignerSession, designerHtml, registerCreationDesigner };
