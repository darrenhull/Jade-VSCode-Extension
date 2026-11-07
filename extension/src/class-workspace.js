"use strict";
const crypto = require("node:crypto");
const KINDS = new Set(["all", "property", "reference", "method", "typeMethod", "constant", "key", "base"]);
const STATE_KEY = "jade.classWorkspaces.v1";
function classIdentity(row) {
  return JSON.stringify([String(row.projectId || row.projectRoot || row.workspaceRoot || row.project || ""), String(row.schema || ""), String(row.owner || row.className || row.name || ""), String(row.importIdentity || row.packageAlias || "")]);
}
function normalizeState(value = {}) {
  return {
    query: typeof value.query === "string" ? value.query.slice(0, 256) : "",
    kind: KINDS.has(value.kind) ? value.kind : "all",
    includeInherited: value.includeInherited === true,
    offset: Number.isSafeInteger(value.offset) && value.offset >= 0 ? Math.min(value.offset, 10000000) : 0,
    limit: 100,
    railWidth: Number.isFinite(value.railWidth) ? Math.min(320, Math.max(240, value.railWidth)) : 280,
    scrollTop: Number.isFinite(value.scrollTop) ? Math.min(10000000, Math.max(0, value.scrollTop)) : 0,
    selectedId: typeof value.selectedId === "string" ? value.selectedId.slice(0, 2048) : "",
  };
}
function escape(value) { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function workspaceHtml({ nonce, cspSource, scriptUri, styleUri, editorScriptUri, editorStyleUri }) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escape(cspSource)} 'unsafe-inline'; script-src 'nonce-${escape(nonce)}'; font-src ${escape(cspSource)}; img-src ${escape(cspSource)} data:;"><link rel="stylesheet" href="${escape(styleUri)}">${editorStyleUri ? `<link rel="stylesheet" href="${escape(editorStyleUri)}">` : ""}<title>Class workspace</title></head><body>
<div id="workspace" class="workspace" aria-busy="true">
 <header class="identity"><button id="back" class="quiet">← Back to Classes</button><div class="identity-title"><span class="eyebrow">CLASS WORKSPACE</span><h1 id="class-name">Loading class…</h1><p id="class-context"></p></div><span id="source-status" class="badge">Workspace source</span></header>
 <nav class="toolbar" aria-label="Class actions"><button id="overview">Overview</button><button id="member-picker" aria-expanded="false" aria-controls="member-rail">Browse members <span id="member-count"></span> ▾</button><span class="toolbar-spacer"></span><button id="instances">Instances ↗</button><button id="original">Open Original Source ↗</button><button id="more" aria-label="More class actions" aria-expanded="false">⋯</button></nav>
 <p id="notice" class="notice" role="status" hidden></p>
 <div class="split"><aside id="member-rail" aria-label="Class members"><div class="rail-search"><label for="search">Find a member</label><input id="search" type="search" autocomplete="off" placeholder="Search all members…"><div class="filters"><label class="sr-only" for="kind">Member kind</label><select id="kind"><option value="all">All kinds</option><option value="property">Properties</option><option value="reference">References</option><option value="method">Methods</option><option value="typeMethod">Type methods</option><option value="constant">Constants</option><option value="key">Collection keys</option><option value="base">Inheritance</option></select><label class="inherited"><input id="inherited" type="checkbox" disabled> Inherited</label></div><p id="inherited-reason" class="hint"></p></div><div id="member-tree" role="tree" aria-label="Members" tabindex="0"></div><div id="pagination"><button id="previous" aria-label="Previous member page">‹</button><span id="page-status" aria-live="polite"></span><button id="next" aria-label="Next member page">›</button></div></aside><div id="rail-resizer" role="separator" aria-label="Resize member navigation" aria-orientation="vertical" aria-valuemin="240" aria-valuemax="320" aria-valuenow="280" tabindex="0"></div><main id="canvas"><div class="detail-header"><div><span id="detail-kind" class="eyebrow">OVERVIEW</span><h2 id="detail-title" tabindex="-1">Class overview</h2><p id="detail-origin"></p></div></div><div id="overview-content"></div><pre id="member-detail" hidden></pre><section id="editor-region" aria-label="Method source" hidden><p id="editor-status" class="hint"></p><div id="method-editor"></div><p class="hint save-hint">Save writes the entire source document. Build and Publish are separate actions.</p></section><div id="empty-state" hidden><h3>No members match</h3><p>Try another name or clear the filters.</p><button id="clear-search">Clear filters</button></div><div id="failure" role="alert" hidden><p id="failure-message"></p><button id="retry">Try again</button></div></main></div><div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
</div>${editorScriptUri ? `<script nonce="${escape(nonce)}" src="${escape(editorScriptUri)}"></script>` : ""}<script nonce="${escape(nonce)}" src="${escape(scriptUri)}"></script></body></html>`;
}
function createClassWorkspaces(vscode, context, adapters = {}) {
  const records = new Set();
  let disposed = false;
  const stored = () => context.workspaceState?.get(STATE_KEY) || {};
  function persist(record) {
    const entries = Object.entries(stored()).filter(([key]) => key !== record.key).slice(-49);
    entries.push([record.key, record.state]);
    Promise.resolve(context.workspaceState?.update(STATE_KEY, Object.fromEntries(entries))).catch(() => {});
  }
  function attach({ panel, document, binding, row: suppliedRow, origin, selectedId, services = {} }) {
    const row = suppliedRow || services.row || { file: document?.uri?.fsPath, ...services.identity };
    const record = { panel, row, binding, key: classIdentity(row), state: normalizeState({ ...stored()[classIdentity(row)], ...(typeof selectedId === "string" ? { selectedId } : {}) }), ready: false, revision: 0, closed: false, snapshot: undefined, origin, subscriptions: [] };
    records.add(record);
    const asset = name => panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", name));
    panel.webview.options = { ...panel.webview.options, enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] };
    panel.webview.html = workspaceHtml({ nonce: crypto.randomBytes(18).toString("hex"), cspSource: panel.webview.cspSource, scriptUri: asset("class-workspace.js"), styleUri: asset("class-workspace.css"), editorScriptUri: services.editorScriptUri || asset("method-editor.js"), editorStyleUri: services.editorStyleUri });
    const current = revision => !disposed && !record.closed && record.revision === revision;
    const send = message => { if (record.ready && !record.closed) return Promise.resolve(panel.webview.postMessage(message)).catch(() => {}); };
    async function load() {
      const revision = ++record.revision;
      send({ command: "loading", revision });
      try {
        const input = { ...record.state };
        const snapshot = adapters.load ? await adapters.load(row, input, document) : { identity: await adapters.resolveClass(row, document), ...await adapters.members(row, input, document) };
        if (!current(revision)) return;
        let remaining = 100;
        const groups = (snapshot.groups || []).map(group => { const items = (group.items || []).slice(0, remaining); remaining -= items.length; return { ...group, items }; }).filter(group => group.items.length);
        record.state.offset = Number.isSafeInteger(snapshot.offset) ? snapshot.offset : record.state.offset;
        if (record.state.selectedId && !snapshot.selected && !groups.some(group => group.items.some(member => member.id === record.state.selectedId)) && !document?.isDirty) {
          record.state.selectedId = "";
          await send({ command: "notice", message: "The selected member is no longer available. Showing the class overview." });
        }
        record.snapshot = { ...snapshot, groups, state: { ...record.state }, document: { uri: document?.uri?.toString(), dirty: document?.isDirty || snapshot.identity?.dirty || false } };
        if (!snapshot.inheritedAvailable) record.state.includeInherited = false;
        record.snapshot.state = { ...record.state };
        persist(record);
        panel.title = snapshot.identity?.qualifiedName || row.owner || panel.title;
        await send({ command: "workspace", revision, snapshot: record.snapshot });
      } catch (error) {
        if (current(revision)) await send({ command: "error", revision, message: error?.message || String(error) });
      }
    }
    function selectedMember() { return record.snapshot?.groups?.flatMap(group => group.items).find(member => member.id === record.state.selectedId) || record.snapshot?.selected; }
    async function select(id) {
      if (record.closed || id && !record.snapshot?.groups?.some(group => group.items.some(member => member.id === id)) && record.snapshot?.selected?.id !== id) return;
      record.state.selectedId = id;
      persist(record);
      if (record.snapshot) { record.snapshot = { ...record.snapshot, state: { ...record.state } }; await send({ command: "workspace", revision: record.revision, snapshot: record.snapshot, focusDetail: true }); }
      const member = selectedMember();
      if (member && binding && ["method", "typeMethod"].includes(member.kind)) {
        const memberFile = String(member.file || ""), documentFile = document?.uri?.toString();
        const foreign = memberFile && documentFile && memberFile !== documentFile || member.system;
        const preview = foreign && adapters.preview ? await adapters.preview(row, id, document) : undefined;
        if (record.closed || record.state.selectedId !== id) return;
        const snapshot = foreign
          ? { available: false, owner: member.owner, member: member.name, text: preview?.text || "", reason: member.system ? "System source is read-only. Edit a resolved local declaration instead." : "This member belongs to another source document. Open its declaring class to edit it with its own undo and save history.", declaringClass: member.declaringClass || member.owner, canOpenDeclaring: !member.system }
          : binding.select(member.owner || member.declaringClass || row.owner, member.name);
        await send({ command: "editorSnapshot", snapshot });
        await send({ command: "editorDiagnostics", items: services.diagnostics?.() || [] });
      } else if (member && adapters.preview) {
        const revision = record.revision, selectedId = id;
        const preview = await adapters.preview(row, id, document);
        if (current(revision) && record.state.selectedId === selectedId) await send({ command: "memberDetail", id, preview });
      }
    }
    async function message(value) {
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.command !== "string" || record.closed) return;
      try {
        switch (value.command) {
          case "ready": record.ready = true; await load(); if (record.state.selectedId) await select(record.state.selectedId); break;
          case "search": if (typeof value.query !== "string") return; record.state = normalizeState({ ...record.state, query: value.query, offset: 0 }); await load(); break;
          case "filter": record.state = normalizeState({ ...record.state, kind: value.kind, includeInherited: value.includeInherited === true && record.snapshot?.inheritedAvailable === true, offset: 0 }); await load(); break;
          case "page": if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > Math.max(0, (record.snapshot?.total || 0) - 1)) return; record.state = normalizeState({ ...record.state, offset: value.offset }); await load(); break;
          case "select": if (typeof value.id === "string" && value.id.length <= 2048) await select(value.id); break;
          case "layout": record.state = normalizeState({ ...record.state, railWidth: value.railWidth, scrollTop: value.scrollTop }); persist(record); break;
          case "openOriginal": await adapters.onOriginal?.(row, record.state.selectedId); break;
          case "instances": await adapters.onInstances?.(row); break;
          case "openDeclaring": { const member = selectedMember(); if (member?.inherited && !member.system) await adapters.onDeclaringClass?.(row, member); break; }
          case "backToClasses": await adapters.onBack?.(row, record.origin); break;
          case "retry": await load(); break;
          case "editorEdit": if (binding) { const snapshot = await binding.edit(value.edit); await send({ command: "editorSnapshot", snapshot }); } break;
          case "editorSave": if (await services.save?.() === false) await send({ command: "notice", message: "The source document was not saved. Your edits remain in the document." }); break;
          case "editorUndo": await services.undo?.(); break;
          case "editorRedo": await services.redo?.(); break;
          case "editorConflict": await send({ command: "notice", message: "Source changed while an edit was pending. Your method draft is preserved; open original source to resolve it." }); break;
          case "editorDefinition": if (Number.isSafeInteger(value.offset) && value.offset >= 0 && value.offset <= (binding?.snapshot()?.text?.length || 0)) await services.definition?.(value.offset); break;
          case "editorCompletions": {
            if (!Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > (binding?.snapshot()?.text?.length || 0) || value.version !== binding?.snapshot()?.version) return;
            const version = value.version, member = binding.snapshot()?.member;
            const result = await services.completions?.(value.offset, typeof value.trigger === "string" ? value.trigger.slice(0, 1) : undefined);
            if (!record.closed && binding.snapshot()?.version === version && binding.snapshot()?.member === member) await send({ command: "editorCompletions", id: value.id, result: result || { items: [] } });
            break;
          }
          default: if (value.command.startsWith("editor")) await services.onEditorMessage?.(value, { binding, document, send });
        }
      } catch (error) {
        if (value.command === "editorEdit") await send({ command: "editorRejected", message: error?.message || String(error) });
        await send({ command: "notice", message: error?.message || String(error) });
      }
    }
    record.subscriptions.push(panel.webview.onDidReceiveMessage(message));
    if (binding?.onDidChange) record.subscriptions.push(binding.onDidChange(snapshot => {
      const member = selectedMember();
      if (member && ["method", "typeMethod"].includes(member.kind) && member.name === snapshot.member && (member.owner || row.owner) === snapshot.owner && (!member.file || member.file === document?.uri?.toString())) send({ command: "editorSnapshot", snapshot });
    }));
    if (services.onDiagnostics) record.subscriptions.push(services.onDiagnostics(() => send({ command: "editorDiagnostics", items: services.diagnostics?.() || [] })));
    function close() { if (record.closed) return; record.closed = true; record.revision++; records.delete(record); persist(record); for (const subscription of record.subscriptions) subscription?.dispose(); }
    record.subscriptions.push(panel.onDidDispose(close));
    record.refresh = load;
    return { dispose: close, refresh: load, select: async id => {
      if (!record.ready) { record.state.selectedId = typeof id === "string" ? id : ""; persist(record); return; }
      await send({ command: "prepareSelection", id });
    }, state: () => ({ ...record.state }), identity: record.key };
  }
  return { attach, refresh: async () => Promise.all([...records].map(record => record.refresh())), dispose() { disposed = true; for (const record of [...records]) { record.closed = true; for (const subscription of record.subscriptions) subscription?.dispose(); } records.clear(); } };
}
module.exports = { createClassWorkspaces, normalizeState, classIdentity, workspaceHtml };
