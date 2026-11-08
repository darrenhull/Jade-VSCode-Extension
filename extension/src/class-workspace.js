"use strict";
const crypto = require("node:crypto");
const KINDS = new Set(["all", "property", "reference", "method", "typeMethod", "constant", "key", "base"]);
const STATE_KEY = "jade.classWorkspaces.v1";
function classIdentity(row) {
  return JSON.stringify([String(row.projectId || row.projectRoot || row.workspaceRoot || row.project || ""), String(row.schema || ""), String(row.owner || row.className || row.name || ""), String(row.importIdentity || ""), String(row.packageAlias || ""), String(row.file || "")]);
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
 <nav class="toolbar" aria-label="Class actions"><button id="overview">Overview</button><button id="save-document" class="primary" title="Save the entire current file (Ctrl+S)">Save file</button><span id="save-feedback" class="save-feedback" role="status" aria-live="polite">Entire current file</span><button id="member-picker" aria-expanded="false" aria-controls="member-rail">Browse members <span id="member-count"></span> ▾</button><span class="toolbar-spacer"></span><button id="instances">Instances ↗</button><button id="original">Open Original Source ↗</button><button id="more" aria-label="More class actions" aria-expanded="false">⋯</button></nav>
 <p id="notice" class="notice" role="status" hidden></p>
 <div class="split"><aside id="member-rail" aria-label="Class members"><div class="rail-search"><label for="search">Find a member</label><input id="search" type="search" autocomplete="off" placeholder="Search all members…"><div class="filters"><label class="sr-only" for="kind">Member kind</label><select id="kind"><option value="all">All kinds</option><option value="property">Properties</option><option value="reference">References</option><option value="method">Methods</option><option value="typeMethod">Type methods</option><option value="constant">Constants</option><option value="key">Collection keys</option><option value="base">Inheritance</option></select><label class="inherited"><input id="inherited" type="checkbox" disabled> Inherited</label></div><p id="inherited-reason" class="hint"></p></div><div id="member-tree" role="tree" aria-label="Members" tabindex="0"></div><div id="pagination"><button id="previous" aria-label="Previous member page">‹</button><span id="page-status" aria-live="polite"></span><button id="next" aria-label="Next member page">›</button></div></aside><div id="rail-resizer" role="separator" aria-label="Resize member navigation" aria-orientation="vertical" aria-valuemin="240" aria-valuemax="320" aria-valuenow="280" tabindex="0"></div><main id="canvas"><div class="detail-header"><div><span id="detail-kind" class="eyebrow">OVERVIEW</span><h2 id="detail-title" tabindex="-1">Class overview</h2><p id="detail-origin"></p></div></div><div id="overview-content"></div><pre id="member-detail" hidden></pre><section id="editor-region" aria-label="Member source" hidden><p id="editor-status" class="hint"></p><div id="method-editor"></div><p class="hint save-hint">Save writes the entire source document. Build and Publish are separate actions.</p></section><div id="empty-state" hidden><h3>No members match</h3><p>Try another name or clear the filters.</p><button id="clear-search">Clear filters</button></div><div id="failure" role="alert" hidden><p id="failure-message"></p><button id="retry">Try again</button></div></main></div><div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
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
    const record = { panel, row, binding, viewId: crypto.randomUUID(), flushes: new Map(), key: classIdentity(row), state: normalizeState({ ...stored()[classIdentity(row)], ...(typeof selectedId === "string" ? { selectedId } : {}) }), ready: false, revision: 0, selectionRevision: 0, closed: false, snapshot: undefined, origin, subscriptions: [] };
    records.add(record);
    const asset = name => panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", name));
    panel.webview.options = { ...panel.webview.options, enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] };
    panel.webview.html = workspaceHtml({ nonce: crypto.randomBytes(18).toString("hex"), cspSource: panel.webview.cspSource, scriptUri: asset("class-workspace.js"), styleUri: asset("class-workspace.css"), editorScriptUri: services.editorScriptUri || asset("method-editor.js"), editorStyleUri: services.editorStyleUri });
    const current = revision => !disposed && !record.closed && record.revision === revision;
    const send = async message => {
      if (!record.ready || record.closed || disposed) return false;
      try { return await panel.webview.postMessage(message); }
      catch (error) {
        // The native panel can be released before its disposal notification
        // reaches the extension host. Retire it instead of reusing its view.
        if (/webview is disposed/i.test(error?.message || '')) { close(); return false; }
        return false;
      }
    };
    async function load(requestedId) {
      const requestedSelection = typeof requestedId === "string";
      let selection;
      const revision = ++record.revision;
      const lastSelected = selectedMember();
      void send({ command: "loading", revision });
      try {
        if (!current(revision)) return;
        const input = { ...record.state, ...(requestedSelection ? { selectedId: requestedId } : {}) };
        const snapshot = adapters.load ? await adapters.load(row, input, document) : { identity: await adapters.resolveClass(row, document), ...await adapters.members(row, input, document) };
        if (!current(revision)) return;
        let remaining = 100;
        const groups = (snapshot.groups || []).map(group => { const items = (group.items || []).slice(0, remaining); remaining -= items.length; return { ...group, items }; }).filter(group => group.items.length);
        if (requestedSelection) {
          if (snapshot.selected?.id !== requestedId && !groups.some(group => group.items.some(member => member.id === requestedId))) {
            if (record.snapshot) await send({ command: "workspace", revision, snapshot: record.snapshot });
            return false;
          }
          record.state.selectedId = requestedId;
          selection = ++record.selectionRevision;
        }
        record.state.offset = Number.isSafeInteger(snapshot.offset) ? snapshot.offset : record.state.offset;
        const bound = binding?.snapshot?.(), sourceSelected = lastSelected && ["method", "typeMethod", "property", "reference"].includes(lastSelected.kind);
        const anchored = bound?.available === true && sourceSelected && bound.member === lastSelected.name && bound.owner === (lastSelected.owner || row.owner || row.name) && (!lastSelected.file || lastSelected.file === document?.uri?.toString());
        const retainActive = sourceSelected ? anchored : document?.isDirty;
        if (record.state.selectedId && !snapshot.selected && !groups.some(group => group.items.some(member => member.id === record.state.selectedId)) && !retainActive) {
          record.state.selectedId = "";
          await send({ command: "notice", message: "The selected member is no longer available. Showing the class overview." });
          if (!current(revision)) return;
        }
        const retainedSelected = retainActive && record.state.selectedId === lastSelected?.id ? lastSelected : undefined;
        record.snapshot = { ...snapshot, viewId: record.viewId, groups, selected: snapshot.selected || retainedSelected, state: { ...record.state }, document: { uri: document?.uri?.toString(), dirty: document?.isDirty || snapshot.identity?.dirty || false } };
        if (!snapshot.inheritedAvailable) record.state.includeInherited = false;
        record.snapshot.state = { ...record.state };
        persist(record);
        panel.title = snapshot.identity?.qualifiedName || row.owner || panel.title;
        await send({ command: "workspace", revision, snapshot: record.snapshot });
        return requestedSelection ? { selection } : true;
      } catch (error) {
        if (current(revision)) {
          if (requestedSelection && record.snapshot) {
            await send({ command: "workspace", revision, snapshot: record.snapshot });
            if (current(revision)) await send({ command: "notice", message: error?.message || String(error) });
          } else await send({ command: "error", revision, message: error?.message || String(error) });
        }
        return false;
      }
    }
    function selectedMember() {
      if (!record.state.selectedId) return undefined;
      return record.snapshot?.groups?.flatMap(group => group.items).find(member => member.id === record.state.selectedId) || (record.snapshot?.selected?.id === record.state.selectedId ? record.snapshot.selected : undefined);
    }
    function localEditableMember() {
      const member = selectedMember();
      return member && ["method", "typeMethod", "property", "reference"].includes(member.kind) && !member.system && (!member.file || member.file === document?.uri?.toString()) ? member : undefined;
    }
    async function select(id) {
      if (record.closed || disposed) return;
      const visible = !id || record.snapshot?.groups?.some(group => group.items.some(member => member.id === id)) || record.snapshot?.selected?.id === id;
      ++record.revision;
      let selection;
      if (!visible) {
        // The model resolves a selected member independently of its bounded,
        // filtered page. Keep navigation state rather than expanding the rail.
        const resolved = await load(id);
        if (!resolved) return;
        selection = resolved.selection;
      } else {
        record.state.selectedId = id;
        selection = ++record.selectionRevision;
      }
      // Catalogue refreshes have their own revision. Once resolved, the
      // editor belongs to this selection until another valid selection wins.
      const selectedCurrent = () => !disposed && !record.closed && record.selectionRevision === selection && record.state.selectedId === id;
      if (!selectedCurrent()) return;
      persist(record);
      if (record.snapshot) { record.snapshot = { ...record.snapshot, state: { ...record.state } }; await send({ command: "workspace", revision: record.revision, snapshot: record.snapshot, focusDetail: true }); }
      if (!selectedCurrent()) return;
      const member = selectedMember();
      if (member && binding && ["method", "typeMethod", "property", "reference"].includes(member.kind)) {
        const memberFile = String(member.file || ""), documentFile = document?.uri?.toString();
        const foreign = memberFile && documentFile && memberFile !== documentFile || member.system;
        const preview = foreign && adapters.preview ? await adapters.preview(row, id, document) : undefined;
        if (!selectedCurrent()) return;
        const snapshot = foreign
          ? { available: false, owner: member.owner, member: member.name, text: preview?.text || "", reason: member.system ? "System source is read-only. Edit a resolved local declaration instead." : "This method belongs to another source document and is read-only here. Open Original Source to view or edit that file explicitly.", declaringClass: member.declaringClass || member.owner, canOpenDeclaring: member.inherited === true && !member.system }
          : binding.select(member.owner || member.declaringClass || row.owner, member.name, member.kind);
        const prepared = services.draftRecovery?.prepare && !foreign ? await services.draftRecovery.prepare(snapshot) : snapshot;
        if (!selectedCurrent()) return;
        record.editorEditable = prepared.available === true && !prepared.readOnly;
        await send({ command: "editorSnapshot", snapshot: prepared });
        await send({ command: "editorDiagnostics", items: services.diagnostics?.() || [] });
        if (services.draftRecovery) { const draft = await services.draftRecovery.get(); if (selectedCurrent()) await send({ command: "editorDraftRecovery", draft }); }
      } else if (member && adapters.preview) {
        const preview = await adapters.preview(row, id, document);
        if (selectedCurrent()) await send({ command: "memberDetail", id, preview });
      }
    }
    async function message(value) {
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.command !== "string" || record.closed) return;
      try {
        switch (value.command) {
          case "ready": record.ready = true; await load(); if (record.state.selectedId) await select(record.state.selectedId); if (services.draftRecovery) await send({ command: "editorDraftRecovery", draft: await services.draftRecovery.get() }); break;
          case "search": if (typeof value.query !== "string") return; record.state = normalizeState({ ...record.state, query: value.query, offset: 0 }); await load(); break;
          case "filter": record.state = normalizeState({ ...record.state, kind: value.kind, includeInherited: value.includeInherited === true && record.snapshot?.inheritedAvailable === true, offset: 0 }); await load(); break;
          case "page": if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > Math.max(0, (record.snapshot?.total || 0) - 1)) return; record.state = normalizeState({ ...record.state, offset: value.offset }); await load(); break;
          case "select": if (typeof value.id === "string" && value.id.length <= 2048) await select(value.id); break;
          case "layout": record.state = normalizeState({ ...record.state, railWidth: value.railWidth, scrollTop: value.scrollTop }); persist(record); break;
          case "openOriginal": await adapters.onOriginal?.(row, record.state.selectedId); break;
          case "instances": await adapters.onInstances?.(row); break;
          case "superclass": if (record.snapshot?.overview?.superclassIdentity) await adapters.onSuperclass?.(row, record.snapshot.overview.superclassIdentity); break;
          case "openDeclaring": { const member = selectedMember(); if (member?.inherited && !member.system) await adapters.onDeclaringClass?.(row, member); break; }
          case "pendingEditsReady": {
            const request = typeof value.requestId === "string" ? record.flushes.get(value.requestId) : undefined;
            if (request) { clearTimeout(request.timer); record.flushes.delete(value.requestId); value.ok === true ? request.resolve(true) : request.reject(Error("Resolve the pending method draft before running this source operation.")); }
            break;
          }
          case "backToClasses": await adapters.onBack?.(row, record.origin); break;
          case "retry": await load(); break;
          case "editorDraft": if (services.draftRecovery) await services.draftRecovery.save(value.draft); break;
          case "editorEdit": if (binding) {
            const member = localEditableMember();
            if (!member || record.editorEditable === false || value.edit?.owner !== (member.owner || row.owner) || value.edit?.member !== member.name || value.edit?.kind !== undefined && value.edit.kind !== member.kind) throw Error("This edit no longer belongs to an editable selected local member. Your draft was retained.");
            if (services.draftRecovery && value.draft) await services.draftRecovery.save(value.draft);
            const snapshot = await binding.edit(value.edit); await send({ command: "editorSnapshot", snapshot });
            if (await services.draftRecovery?.acknowledge(snapshot)) await send({ command: "editorDraftRecovery", draft: undefined });
          } break;
          case "copyDraft": if (services.draftRecovery) { await services.draftRecovery.copy(); await send({ command: "notice", message: "Recovered member draft copied. The source document has not changed." }); } break;
          case "discardDraft": if (services.draftRecovery) {
            const answer = await vscode.window.showWarningMessage("Discard the recovered member draft? The source document will not change.", { modal: true }, "Discard draft");
            if (answer === "Discard draft") { const resolved = await services.draftRecovery.discard() || binding?.snapshot(); if (resolved) { record.editorEditable = resolved.available === true && !resolved.readOnly; await send({ command: "editorSnapshot", snapshot: resolved, reset: true }); } await send({ command: "editorDraftRecovery", draft: undefined }); }
          } break;
          case "restoreDraft": if (services.draftRecovery && localEditableMember()) {
            const answer = await vscode.window.showWarningMessage("Replace the selected member with its recovered draft? Review the source and draft before restoring. Saving still writes the entire source document.", { modal: true }, "Restore draft");
            if (answer === "Restore draft") { const snapshot = await services.draftRecovery.restore(); record.editorEditable = snapshot.available === true && !snapshot.readOnly; await send({ command: "editorSnapshot", snapshot, reset: true }); await send({ command: "editorDraftRecovery", draft: await services.draftRecovery.get() }); }
          } break;
          case "editorSave": {
            if(record.saving)break;
            record.saving=true;
            await send({command:"saveState",status:"saving",dirty:document?.isDirty ?? true});
            try{
              if(typeof services.save!=="function"||await services.save()===false)throw Error("The current source file was not saved. Your edits remain in the document.");
              await send({command:"saveState",status:"saved",dirty:document?.isDirty ?? false});
            }catch(error){
              await send({command:"saveState",status:"error",dirty:document?.isDirty ?? true,message:error?.message || String(error)});
              await send({command:"notice",message:error?.message || String(error)});
            }finally{record.saving=false;}
            break;
          }
          case "editorUndo": await services.undo?.(); break;
          case "editorRedo": await services.redo?.(); break;
          case "editorBuild": await services.build?.(); break;
          case "editorPublish": await services.publish?.(); break;
          case "editorRunTests": await services.runTests?.(); break;
          case "editorActionBlocked": await send({ command: "notice", message: "Resolve the unapplied member draft before building, publishing or running tests." }); break;
          case "editorConflict": await send({ command: "notice", message: "Source changed while an edit was pending. Your member draft is preserved; open original source to resolve it." }); break;
          case "editorNotice": await send({ command: "notice", message: "Member draft is too large for protected editing. Open Original Source to edit this method." }); break;
          case "editorDefinition": if (localEditableMember() && Number.isSafeInteger(value.offset) && value.offset >= 0 && value.offset <= (binding?.snapshot()?.text?.length || 0)) await services.definition?.(value.offset); break;
          case "editorCompletions": {
            if (!localEditableMember() || !Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > (binding?.snapshot()?.text?.length || 0) || value.version !== binding?.snapshot()?.version) return;
            const version = value.version, member = binding.snapshot()?.member;
            const result = await services.completions?.(value.offset, typeof value.trigger === "string" ? value.trigger.slice(0, 1) : undefined);
            if (!record.closed && binding.snapshot()?.version === version && binding.snapshot()?.member === member) await send({ command: "editorCompletions", id: value.id, result: result || { items: [] } });
            break;
          }
          default: if (value.command.startsWith("editor")) await services.onEditorMessage?.(value, { binding, document, send });
        }
      } catch (error) {
        if (value.command === "editorEdit" || value.command === "editorDraft") {
          await send({ command: "editorRejected", message: error?.message || String(error) });
          if (services.draftRecovery) await send({ command: "editorDraftRecovery", draft: await services.draftRecovery.get() });
        }
        await send({ command: "notice", message: error?.message || String(error) });
      }
    }
    record.subscriptions.push(panel.webview.onDidReceiveMessage(message));
    if (binding?.onDidChange) record.subscriptions.push(binding.onDidChange(snapshot => {
      const member = selectedMember();
      if (member && ["method", "typeMethod", "property", "reference"].includes(member.kind) && member.name === snapshot.member && (!snapshot.kind || snapshot.kind === member.kind) && (member.owner || row.owner) === snapshot.owner && (!member.file || member.file === document?.uri?.toString())) send({ command: "editorSnapshot", snapshot });
    }));
    if (services.onDiagnostics) record.subscriptions.push(services.onDiagnostics(() => send({ command: "editorDiagnostics", items: services.diagnostics?.() || [] })));
    function close() { if (record.closed) return; record.closed = true; record.revision++; records.delete(record); persist(record); for (const request of record.flushes.values()) { clearTimeout(request.timer); request.reject(Error("The class workspace closed before its method edits were acknowledged.")); } record.flushes.clear(); for (const subscription of record.subscriptions) subscription?.dispose(); }
    record.subscriptions.push(panel.onDidDispose(close));
    record.refresh = load;
    record.close = close;
    return { dispose: close, isClosed: () => record.closed, refresh: load, viewId: record.viewId, flushPendingEdits: () => {
      if (!record.ready || record.closed) return Promise.reject(Error("The method editor is not ready to flush its pending changes."));
      return new Promise((resolve, reject) => { const requestId = crypto.randomUUID(), timer = setTimeout(() => { record.flushes.delete(requestId); reject(Error("The method editor did not acknowledge its pending changes. Try again after resolving the draft.")); }, 15000); record.flushes.set(requestId, { resolve, reject, timer }); void send({ command: "flushPendingEdits", requestId }); });
    }, setOrigin: value => { record.origin = value; }, select: async id => {
      if (!record.ready) { record.state.selectedId = typeof id === "string" ? id : ""; persist(record); return; }
      await send({ command: "prepareSelection", id });
    }, state: () => ({ ...record.state }), identity: record.key };
  }
  return { attach, refresh: async () => Promise.all([...records].map(record => record.refresh())), dispose() { disposed = true; for (const record of [...records]) record.close(); records.clear(); } };
}
module.exports = { createClassWorkspaces, normalizeState, classIdentity, workspaceHtml };
