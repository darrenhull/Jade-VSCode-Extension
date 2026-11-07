"use strict";
const path = require("node:path"), crypto = require("node:crypto");

// The webview handles presentation. This session owns project identity, bounded
// lookups and the exact native bytes the user reviewed before an explicit save.
function createDesignerSession({ post, projects, modelProvider, save, dirtyPaths = () => [], saved = async () => {} }) {
  let current, model, disposed = false, review, saving = false;
  const latest = new Map();
  const reply = message => disposed ? undefined : post(message);
  const fingerprint = value => JSON.stringify(value.files.map(f => [f.file, f.text, f.operation || "create", f.expectedHash || null, f.expectedText ?? null, f.encoding ?? null, f.bom ?? null]));
  async function handle(message) {
    if (disposed || !message || typeof message !== "object") return;
    const command = message.command;
    const channel = command === "search" ? "search:" + String(message.field || message.kind) : command;
    const sequence = Number.isSafeInteger(message.sequence) ? message.sequence : 0;
    const token = Symbol(); latest.set(channel, token);
    const fresh = () => !disposed && latest.get(channel) === token;
    try {
      if (command === "ready") return reply({ command: "projects", projects: projects.map(p => ({ id: p.id, name: p.name })) });
      if (command === "invalidate") { if (message.project !== undefined && message.project !== current?.id) return; review = undefined; latest.delete("preview"); latest.delete("describe"); return; }
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
      if (message.project !== undefined && message.project !== current.id) throw Error("The active project changed. Choose the project again before continuing.");
      const project = current, activeModel = model;
      if (command === "search" || command === "schemas" || command === "properties" || command === "storage") {
        const request = { schema: String(message.schema || ""), query: String(message.query || "").slice(0, 256), kind: message.kind === "member" ? "member" : "superclass", membership: String(message.membership || ""), collectionKind: message.collectionKind, collectionFamily: message.collectionFamily, offset: Math.max(0, Math.min(100000, Number(message.offset) || 0)), limit: Math.max(1, Math.min(50, Number(message.limit) || 50)) };
        const page = await (command === "schemas" ? activeModel.schemas(request) : command === "properties" ? activeModel.keyChoices(request) : command === "storage" ? activeModel.storage(request) : activeModel.search(request));
        if (fresh() && project === current && activeModel === model) return reply({ command, sequence, field: message.field, schema: request.schema, membership: request.membership, page });
      } else if (command === "describe") {
        const rules = await activeModel.describe(structuredClone(message.request));
        if (fresh() && project === current && activeModel === model) return reply({ command: "describe", sequence, rules });
      } else if (command === "preview") {
        review = undefined;
        const request = structuredClone(message.request);
        const generated = await activeModel.preview(request);
        if (!fresh() || project !== current || activeModel !== model) return;
        const receipt = crypto.randomBytes(24).toString("hex");
        review = { receipt, request, generated, fingerprint: fingerprint(generated), project };
        return reply({ command: "preview", sequence, receipt, summary: generated.summary, rules: generated.rules, files: generated.files.map(f => ({ relativePath: f.relativePath || path.basename(f.file), text: f.text, operation: f.operation || "create", ...(f.operation === "update" ? { expectedText: f.expectedText } : {}) })) });
      } else if (command === "save") {
        if (saving) throw Error("A save is already running.");
        const approved = review;
        if (!approved || approved.project !== current || approved.receipt !== message.receipt) throw Error("Review the current native source before saving.");
        saving = true;
        try {
          const freshModel = await modelProvider(project);
          if (disposed || current !== project) return;
          // Keep the active catalogue fresh even when this receipt is rejected.
          // Otherwise every subsequent preview would repeat the stale plan.
          model = freshModel;
          let checked;
          try { checked = await freshModel.preview(approved.request); }
          catch (error) { if (review === approved) review = undefined; throw error; }
          if (disposed) return;
          if (review !== approved) throw Error("The definition changed during save preparation. Review the current source before saving.");
          if (fingerprint(checked) !== approved.fingerprint) {
            review = undefined;
            await reply({ command: "catalogUpdated", project: project.id, page: freshModel.schemas({ limit: 50 }), notice: freshModel.notice });
            throw Error("Source definitions changed since review. Review the updated source before saving.");
          }
          const result = await save(project.root, approved.generated, { dirtyPaths: dirtyPaths() });
          review = undefined;
          let notice;
          // A successful write is final even if catalogue refresh or opening the
          // new editor fails. Never replay it or label it a failed save.
          try {
            const refreshed = await modelProvider(project), page = await refreshed.schemas({ limit: 50 });
            if (!disposed && current === project) {
              model = refreshed;
              await reply({ command: "catalogUpdated", project: project.id, page, notice: refreshed.notice, created: { type: approved.request.type, name: approved.request.name, schema: approved.request.schema } });
            }
          } catch (error) {
            if (current === project) model = undefined;
            notice = "Files saved, but refreshing the source choices failed: " + error.message + ". Select the project again to refresh before creating another definition.";
          }
          try { if (!disposed) await saved(result); }
          catch (error) { notice = (notice ? notice + " " : "") + "Files saved, but opening the source editor failed: " + error.message; }
          return reply({ command: "saved", sequence, files: result.files.map(f => typeof f === "string" ? path.basename(f) : f.relativePath || path.basename(f.file)), ...(notice ? { notice } : {}) });
        } finally { saving = false; }
      }
    } catch (error) {
      if (fresh()) {
        if (command === "save" && error.outcome && (error.outcome.changedFiles?.length || error.outcome.savedFiles?.length)) { review = undefined; model = undefined; }
        const text = error.message || String(error), nativeField = error.field || message.field || (/name|already exists/i.test(text) ? "name" : /member/i.test(text) ? "member" : /superclass/i.test(text) ? "superclass" : /schema/i.test(text) ? "schema" : undefined);
        const field = nativeField === "sizing" ? "sizing-value" : nativeField;
        return reply({ command: "error", sequence, operation: command, field, message: text, ...(error.code !== undefined ? { code: error.code } : {}), ...(error.metadataStatus ? { metadataStatus: error.metadataStatus } : {}), ...(error.outcome ? { outcome: error.outcome } : {}), ...(Number.isSafeInteger(error.keyIndex) ? { keyIndex: error.keyIndex } : {}), ...(error.keyName ? { keyName: error.keyName } : {}), ...(error.attribute ? { attribute: error.attribute } : {}), ...(error.nativeCode !== undefined ? { nativeCode: error.nativeCode } : {}), ...(error.nativeCodeProvenance ? { nativeCodeProvenance: error.nativeCodeProvenance } : {}) });
      }
    }
  }
  return { handle, dispose() { disposed = true; review = undefined; latest.clear(); } };
}

function designerHtml({ nonce, cspSource, asset }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset("creation-designer.css")}"><link rel="stylesheet" href="${asset("creation-rules-view.css")}"><title>Create Jade source</title></head><body>
  <header><div class="eyebrow">JADE TOOLS / CREATE</div><h1>Create something native.</h1><p>Define it here. Review the source. Save when you’re ready.</p><span class="badge">Local files only · no publish</span></header>
  <nav aria-label="Creation steps"><ol id="steps"><li aria-current="step">1 · Definition</li><li>2 · Keys &amp; rules</li><li>3 · Review</li></ol></nav>
  <form id="designer" novalidate><div class="layout"><main>
  <section class="card" id="definition"><h2>Definition</h2><div class="grid">
  <label>Project<select id="project" data-test="project"></select></label><label>Create<select id="kind" data-test="kind"><option value="class">Class</option><option value="collection">Collection</option><option value="schema">Schema</option></select></label>
  <label class="choice">Target schema<input id="schema" data-test="schema" autocomplete="off" aria-describedby="schema-help"><span class="results" id="schema-results" role="listbox" hidden></span><small id="schema-help">Search existing schemas in this project.</small></label>
  <label title="Collection class name identifies the new collection type"><span id="name-label">Class name</span><input id="name" data-test="name" autocomplete="off" aria-describedby="name-error"><small class="field-error" id="name-error"></small></label>
  <label class="schema-only choice" hidden>Parent schema<input id="parent" value="RootSchema" autocomplete="off"><span class="results" id="parent-results" role="listbox" hidden></span></label><label class="schema-only" hidden>Jade version<input id="version" placeholder="25.0.02" autocomplete="off"></label>
  <label class="not-schema">Default lifetime<select id="lifetime"><option value="transient">Transient</option><option value="persistent">Persistent</option></select><small id="lifetime-note">Jade validates lifetime compatibility with the selected superclass.</small></label>
  <label class="collection-only" hidden>Collection family<select id="dictionary"><option value="member" data-base="RootSchema::MemberKeyDictionary">Member-key dictionary</option><option value="external" data-base="RootSchema::ExtKeyDictionary">External-key dictionary</option><option value="objectArray" data-base="RootSchema::ObjectArray">Object array</option><option value="objectSet" data-base="RootSchema::ObjectSet">Object set</option></select></label>
  <label class="collection-only choice" hidden>Member class<input id="member" data-test="member" autocomplete="off" aria-describedby="member-help"><span class="results" id="member-results" role="listbox" hidden></span><small id="member-help">Search visible schema-qualified classes.</small></label>
  <label class="not-schema choice">Superclass<input id="superclass" value="Object" autocomplete="off" aria-describedby="superclass-help"><span class="results" id="superclass-results" role="listbox" hidden></span><small id="superclass-help">Imported package classes can be collection members; native Jade does not permit subclassing imported classes.</small></label>
  </div><p class="hint">Choices follow schema visibility. A folder name does not identify a Jade type.</p>
  <details id="collection-storage" class="collection-only" hidden><summary>Storage &amp; sizing</summary><div class="grid"><label>Requested source sizing<select id="sizing-mode"><option value="native">Jade default</option><option value="blockSize" disabled>Entries per block — source bounds unavailable</option><option value="expectedPopulation" disabled>Expected population — source bounds unavailable</option></select></label><label id="sizing-value-field" hidden><span id="sizing-value-label">Requested entries per block</span><input id="sizing-value" type="number" step="1" placeholder="Enter requested source value" aria-describedby="sizing-note"><small>Zero explicitly requests Jade's native default. Only one sizing option is emitted.</small></label><label id="load-factor-field">Btree load factor (%)<input id="load-factor" type="number" min="1" max="100" step="1" placeholder="Jade default"><small>Available for dictionaries and object sets; omitted for arrays.</small></label><label class="choice">Class-map file (existing)<input id="map-file" autocomplete="off" placeholder="Jade default — leave empty" aria-describedby="map-file-note"><span class="results" id="map-file-results" role="listbox" hidden></span><small id="map-file-note">Search schema-qualified native files. This ordinary class mapping adds a reviewed schema-metadata change for the new class; it does not move existing data.</small></label></div><div id="exclusive-placement-view"></div><p class="hint" id="sizing-note" aria-live="polite">Custom modes require verified native source bounds. Jade determines effective runtime allocation.</p></details></section>
  <section class="card" id="rules" hidden><h2>Keys &amp; rules</h2><p>Keys run from top to bottom. Use the arrow buttons to change priority.</p><div id="keys"></div><button id="add-key" type="button" class="secondary">＋ Add key</button>
  <details><summary>Advanced key settings</summary><label class="check"><input type="checkbox" id="duplicates">Allow duplicate keys</label><p class="hint">Positive text locale IDs and ignore-case settings are supported. Unproved comparison modes, primitive arrays, dynamic dictionaries and ad hoc indexes are unavailable.</p></details></section>
  <section class="card" id="review" hidden><h2>Review native source</h2><p>Saving creates source files only. Use Build or Publish separately.</p><div id="files"></div></section>
  <details class="card not-schema native-rules-panel" id="native-rule-details"><summary>Native lifetime permissions &amp; inherited key details</summary><div id="rule-details"></div></details>
  </main><aside class="card"><div class="eyebrow">YOUR DEFINITION</div><h2 id="summary" data-test="summary">Start with a project and a schema.</h2><p id="status" role="status" aria-live="polite">Loading projects…</p><div id="error" data-test="error" role="alert" hidden></div><button id="refresh-choices" type="button" class="secondary">Refresh source choices</button><section id="collection-rules" hidden><h3>Native rules</h3><div id="rules-info" aria-live="polite"></div></section><p id="catalog-notice" class="hint"></p><details id="live-source-details"><summary>Native source preview</summary><pre id="live-source" tabindex="0">Complete the definition to preview native source.</pre></details><p class="hint">Jade’s native compiler remains the authority. No database instances are created here.</p></aside></div>
  <footer><button id="cancel" type="button" class="secondary">Cancel</button><span class="spacer"></span><button id="back" data-test="back" type="button" class="secondary" hidden>Back</button><button id="next" data-test="next" type="button">Review source →</button><button id="save" data-test="save" type="submit" hidden disabled>Save source files</button></footer></form>
  <script nonce="${nonce}" src="${asset("creation-rules-view.js")}"></script><script nonce="${nonce}" src="${asset("creation-designer.js")}"></script></body></html>`;
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
        model.notice = [notice, "Choices follow schema ancestry and extracted package visibility.", model.importsNotice].filter(Boolean).join(" ");
        return model;
      },
      save: (root, generated, options) => generated.files.some(file => file.operation === "update") ? require("./creation-workspace-edit").applyCreationWorkspaceEdit(vscode, root, generated, options) : writeCreation(root, generated, options),
      dirtyPaths: () => vscode.workspace.textDocuments.filter(d => d.isDirty && ["file", "untitled"].includes(d.uri.scheme) && path.isAbsolute(d.uri.fsPath)).map(d => d.uri.fsPath),
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
