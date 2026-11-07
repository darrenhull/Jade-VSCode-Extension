(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.mount(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function moveKey(keys, index, delta) {
    const copy = keys.map(key => ({ ...key })), target = index + delta;
    if (target >= 0 && target < copy.length) [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  }
  function definitionRequest(draft) { const request = JSON.parse(JSON.stringify(draft)); for (const key of request.keys || []) delete key._type; return request; }
  function canSave({ step, receipt, validPreview, saving }) { return step === 2 && Boolean(receipt) && validPreview === true && saving !== true; }
  function describeDraft(draft) {
    if (draft.type === "schema") return "Schema " + (draft.name || "…") + " inheriting " + (draft.parent || "RootSchema");
    if (draft.type === "class") return "A " + draft.lifetime + " class " + (draft.name || "…") + " inheriting " + (draft.superclass || "Object");
    const keys = (draft.keys || []).map(k => (k.name || "…") + (k.descending ? " descending" : " ascending"));
    return "A " + draft.lifetime + " dictionary of " + (draft.membership?.split("::").at(-1) || "…") + (keys.length ? ", sorted by " + keys.join(", then ") : "") + "; duplicate keys " + (draft.duplicatesAllowed ? "allowed" : "prohibited") + ".";
  }
  function mount(root) {
    const document = root.document, vscode = root.acquireVsCodeApi(), $ = id => document.getElementById(id);
    let sequence = 0, projectSequence, previewSequence, receipt, step = 0, timer, disposed = false;
    const savedState = vscode.getState();
    const pending = new Map(), combos = new Map();
    let draft = { type: "class", schema: "", name: "", superclass: "Object", lifetime: "transient", kind: "member", membership: "", keys: [{ name: "" }], duplicatesAllowed: false };
    let schemaPage = { items: [] }, selectedSchema, projectId, validPreview = false, saving = false;
    const send = message => vscode.postMessage(message);
    const option = (value, text = value) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
    function persist() { vscode.setState({ draft, step, projectId }); }
    function error(message, field) {
      $("error").hidden = !message; $("error").textContent = message || "";
      for (const el of document.querySelectorAll(".field-error")) el.textContent = "";
      for (const el of document.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
      if (field && $(field)) {
        const control = $(field), id = field === "name" ? "name-error" : "field-error-" + field;
        let detail = $(id);
        if (!detail) { detail = document.createElement("small"); detail.id = id; detail.className = "field-error"; control.parentElement.append(detail); const ids = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)); ids.add(id); control.setAttribute("aria-describedby", [...ids].join(" ")); }
        detail.textContent = message || ""; control.setAttribute("aria-invalid", "true");
      }
    }
    function updateSteps() {
      $("definition").hidden = step !== 0; $("rules").hidden = step !== 1; $("review").hidden = step !== 2;
      $("back").hidden = step === 0; $("next").hidden = step === 2; $("save").hidden = step !== 2;
      $("save").disabled = !canSave({ step, receipt, validPreview, saving });
      $("next").textContent = step === 0 && draft.type === "collection" ? "Keys & rules →" : "Review source →";
      Array.from($("steps").children).forEach((el, index) => { if (index === step) el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current"); });
      $("steps").children[1].hidden = draft.type !== "collection";
      persist();
    }
    function reflectKind() {
      const schema = draft.type === "schema", collection = draft.type === "collection";
      for (const el of document.querySelectorAll(".schema-only")) el.hidden = !schema;
      for (const el of document.querySelectorAll(".not-schema")) el.hidden = schema;
      for (const el of document.querySelectorAll(".collection-only")) el.hidden = !collection;
      $("schema").parentElement.hidden = schema;
      $("name-label").textContent = schema ? "Schema name" : collection ? "Collection class name" : "Class name";
      renderKeys(); updateSteps();
    }
    function changed() {
      validPreview = false; receipt = undefined; $("save").disabled = true;
      $("live-source").textContent = "Checking the current definition…";
      send({ command: "invalidate" });
      $("summary").textContent = describeDraft(draft); error("");
      clearTimeout(timer); previewSequence = ++sequence;
      $("status").textContent = "Checking your definition…";
      const id = previewSequence;
      timer = setTimeout(() => { if (!disposed && projectId !== undefined) send({ command: "preview", sequence: id, request: definitionRequest(draft) }); }, 180);
      persist();
    }
    function search(field, query, offset = 0) {
      if (disposed) return;
      const id = ++sequence;
      pending.set(field, id);
      const base = { sequence: id, field, query, offset, limit: 50, schema: draft.schema, membership: draft.membership, collectionKind: field === "superclass" && draft.type === "collection" ? draft.kind : undefined };
      send({ ...base, command: field === "schema" || field === "parent" ? "schemas" : field.startsWith("key-") ? "properties" : "search", kind: field === "member" ? "member" : "superclass" });
      $("status").textContent = "Searching…";
    }
    function combo(input, list, field, choose) {
      let rows = [], active = -1, page, query = "", hideTimer, searchTimer, closed = false;
      input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
      const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
      function select(row) { choose(row); close(); input.focus(); }
      function render(value) {
        if (closed || document.activeElement !== input && !list.contains(document.activeElement)) return;
        page = value; rows = value.items || []; active = -1;
        list.replaceChildren(...rows.map((row, index) => {
          const b = document.createElement("button"); b.type = "button"; b.role = "option"; b.tabIndex = -1; b.id = list.id + "-" + index;
          b.textContent = row.label || (row.schema ? row.schema + "::" : "") + row.name + (row.type ? " : " + row.type : "");
          b.onmousedown = event => event.preventDefault(); b.onclick = () => select(row); return b;
        }));
        if (!rows.length) { const empty = document.createElement("span"); empty.className = "empty"; empty.textContent = "No matching choices"; list.append(empty); }
        if (value.hasMore) { const more = document.createElement("button"); more.type = "button"; more.textContent = "More results →"; more.onmousedown = event => event.preventDefault(); more.onclick = () => search(field, query, (value.offset || 0) + (value.limit || 50)); list.append(more); }
        list.hidden = false; input.setAttribute("aria-expanded", "true");
        $("status").textContent = (value.total ?? rows.length) + " matching choices; showing up to 50.";
      }
      input.addEventListener("focus", () => { clearTimeout(hideTimer); query = ""; search(field, query); });
      input.addEventListener("blur", () => { hideTimer = setTimeout(() => { if (!list.contains(document.activeElement)) close(); }, 150); });
      list.addEventListener("focusout", () => { hideTimer = setTimeout(() => { if (document.activeElement !== input && !list.contains(document.activeElement)) close(); }, 150); });
      input.addEventListener("input", () => { clearTimeout(searchTimer); query = input.value; const ticket = ++sequence; pending.set(field, ticket); searchTimer = setTimeout(() => { if (pending.get(field) === ticket && !closed) search(field, query); }, 120); });
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") { close(); return; }
        if (event.key === "Tab" && !page?.hasMore) { close(); return; }
        if (event.key === "PageDown" && page?.hasMore) { event.preventDefault(); search(field, query, (page.offset || 0) + (page.limit || 50)); return; }
        if (event.key === "PageUp" && page?.offset) { event.preventDefault(); search(field, query, Math.max(0, page.offset - (page.limit || 50))); return; }
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); if (list.hidden) { search(field, ""); return; } active = Math.max(0, Math.min(rows.length - 1, active + (event.key === "ArrowDown" ? 1 : -1))); Array.from(list.children).forEach((n, index) => { n.classList.toggle("active", index === active); n.setAttribute("aria-selected", String(index === active)); }); if (rows[active]) { input.setAttribute("aria-activedescendant", list.children[active].id); list.children[active].scrollIntoView({ block: "nearest" }); } }
        if (event.key === "Enter" && !list.hidden) { event.preventDefault(); if (rows[active]) select(rows[active]); }
      });
      const api = { render, close, dispose() { closed = true; clearTimeout(hideTimer); clearTimeout(searchTimer); close(); } }; combos.set(field, api); return api;
    }
    function invalidateChoices() { pending.clear(); for (const c of combos.values()) c.close(); }
    combo($("schema"), $("schema-results"), "schema", row => { selectedSchema = row; draft.schema = row.name; $("schema").value = row.name; if (row.version) $("version").value = draft.version = row.version; invalidateChoices(); renderKeys(); changed(); });
    combo($("parent"), $("parent-results"), "parent", row => { draft.parent = row.name; $("parent").value = row.name; changed(); });
    combo($("member"), $("member-results"), "member", row => { draft.membership = row.id || row.name; draft.membershipSchema = row.schema; $("member").value = row.label || row.name; invalidateChoices(); for (const key of draft.keys) delete key._type; renderKeys(); changed(); });
    combo($("superclass"), $("superclass-results"), "superclass", row => { draft.superclass = row.id || row.name; draft.superclassSchema = row.schema; $("superclass").value = row.label || row.name; changed(); });
    function renderKeys() {
      for (const field of [...combos.keys()]) if (field.startsWith("key-")) { combos.get(field).dispose(); combos.delete(field); pending.delete(field); }
      $("keys").replaceChildren();
      (draft.keys || []).forEach((key, index) => {
        const row = document.createElement("fieldset"); row.className = "key";
        const legend = document.createElement("legend"); legend.textContent = "Key " + (index + 1); row.append(legend);
        function field(label, el) { const l = document.createElement("label"); l.textContent = label; l.append(el); row.append(l); return el; }
        const name = document.createElement("input"); name.value = key.name || ""; name.id = "key-" + index; name.autocomplete = "off";
        field(draft.kind === "external" ? "Key name" : "Property or reference path", name);
        name.oninput = () => { key.name = name.value; changed(); };
        if (draft.kind !== "external") { const list = document.createElement("span"); list.id = "key-results-" + index; list.className = "results"; list.hidden = true; list.role = "listbox"; name.parentElement.className = "choice"; name.parentElement.append(list); combo(name, list, "key-" + index, property => { key.name = property.name; key._type = property.type; name.value = property.name; renderKeys(); changed(); $("key-" + index)?.focus(); }); }
        if (draft.kind === "external") {
          const type = document.createElement("select"); type.append(...["String", "StringUtf8", "Binary", "Integer", "Integer64", "Real", "Decimal", "Date", "Time", "TimeStamp", "Boolean", "Character"].map(t => option(t))); type.value = key.type || "String"; key.type = type.value; field("Key type", type).onchange = () => { key.type = type.value; renderKeys(); changed(); };
          if (["String", "StringUtf8", "Binary", "Decimal"].includes(key.type)) { const length = document.createElement("input"); length.type = "number"; length.min = "1"; length.value = key.length ?? (key.type === "Decimal" ? 12 : 30); key.length = Number(length.value); field("Length", length).oninput = () => { key.length = Number(length.value); changed(); }; }
          if (key.type === "Decimal") { const scale = document.createElement("input"); scale.type = "number"; scale.min = "0"; scale.value = key.scale ?? 0; field("Scale", scale).oninput = () => { key.scale = Number(scale.value); changed(); }; }
        }
        const direction = document.createElement("select"); direction.append(option("asc", "Ascending"), option("desc", "Descending")); direction.value = key.descending ? "desc" : "asc"; field("Direction", direction).onchange = () => { key.descending = direction.value === "desc"; changed(); };
        const ci = document.createElement("input"); ci.type = "checkbox"; ci.checked = Boolean(key.caseInsensitive); field("Ignore case (text)", ci).onchange = () => { key.caseInsensitive = ci.checked; changed(); };
        const locale = document.createElement("input"); locale.type = "number"; locale.min = "1"; locale.placeholder = "Schema default"; locale.value = key.locale ?? ""; field("Text locale ID", locale).oninput = () => { if (locale.value === "") delete key.locale; else key.locale = Number(locale.value); changed(); };
        const locales = document.createElement("datalist"); locales.id = "key-locales-" + index; locale.setAttribute("list", locales.id); locales.append(...(selectedSchema?.locales || []).slice(0, 100).map(value => option(String(value.id), value.name + " (" + value.id + ")"))); row.append(locales);
        const schemaLocale = selectedSchema?.locales?.find(value => value.schemaDefault); if (schemaLocale) locale.placeholder = "Schema default (" + schemaLocale.id + ")";
        const valueType = draft.kind === "external" ? key.type : key._type;
        const text = !valueType || ["String", "StringUtf8"].includes(valueType);
        ci.disabled = locale.disabled = !text;
        ci.parentElement.hidden = locale.parentElement.hidden = !text;
        if (!text) { delete key.caseInsensitive; delete key.locale; }
        const controls = document.createElement("div"); controls.className = "key-controls";
        for (const [label, delta] of [["Up", -1], ["Down", 1], ["Remove", 0]]) { const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = label === "Up" ? "↑" : label === "Down" ? "↓" : "Remove"; b.setAttribute("aria-label", label + " key " + (index + 1)); b.disabled = delta !== 0 && (index + delta < 0 || index + delta >= draft.keys.length); b.onclick = () => { if (delta) draft.keys = moveKey(draft.keys, index, delta); else draft.keys.splice(index, 1); renderKeys(); changed(); const focus = $("key-" + Math.max(0, Math.min(draft.keys.length - 1, index + delta))); focus?.focus(); }; controls.append(b); }
        row.append(controls); $("keys").append(row);
      });
      $("add-key").disabled = draft.keys.length >= 16;
    }
    for (const id of ["schema", "name", "parent", "version", "superclass", "member", "load-factor"]) $(id).addEventListener("input", () => {
      const prop = { member: "membership", "load-factor": "loadFactor" }[id] || id;
      draft[prop] = id === "load-factor" ? ($(id).value === "" ? undefined : Number($(id).value)) : $(id).value;
      if (id === "member") delete draft.membershipSchema; if (id === "superclass") delete draft.superclassSchema; changed();
      if (["schema", "member"].includes(id)) { for (const [field, combo] of combos) if (field !== id) { pending.delete(field); combo.close(); } }
    });
    $("kind").onchange = () => { draft.type = $("kind").value; step = 0; if (draft.type === "collection" && draft.superclass?.split("::").at(-1) === "Object") draft.superclass = draft.kind === "external" ? "ExtKeyDictionary" : "MemberKeyDictionary"; if (draft.type === "class" && ["MemberKeyDictionary", "ExtKeyDictionary"].includes(draft.superclass?.split("::").at(-1))) draft.superclass = "Object"; $("superclass").value = draft.superclass; invalidateChoices(); reflectKind(); changed(); };
    $("dictionary").onchange = () => { draft.kind = $("dictionary").value; draft.superclass = draft.kind === "member" ? "MemberKeyDictionary" : "ExtKeyDictionary"; $("superclass").value = draft.superclass; renderKeys(); changed(); };
    $("lifetime").onchange = () => { draft.lifetime = $("lifetime").value; changed(); };
    $("duplicates").onchange = () => { draft.duplicatesAllowed = $("duplicates").checked; changed(); };
    $("add-key").onclick = () => { draft.keys.push({ name: "" }); renderKeys(); changed(); $("key-" + (draft.keys.length - 1))?.focus(); };
    $("next").onclick = () => { step = step === 0 && draft.type === "collection" ? 1 : 2; updateSteps(); changed(); const heading = (step === 1 ? $("rules") : $("review")).querySelector("h2"); heading.tabIndex = -1; heading.focus(); };
    $("back").onclick = () => { step = step === 2 && draft.type === "collection" ? 1 : 0; updateSteps(); };
    $("cancel").onclick = () => send({ command: "cancel" });
    $("designer").onsubmit = event => { event.preventDefault(); if (!canSave({ step, receipt, validPreview, saving })) return; saving = true; $("save").disabled = true; send({ command: "save", sequence: previewSequence, receipt }); };
    $("project").onchange = () => { projectId = $("project").value; receipt = undefined; validPreview = false; $("save").disabled = true; projectSequence = ++sequence; pending.clear(); for (const c of combos.values()) c.close(); send({ command: "project", project: projectId, sequence: projectSequence }); };
    root.addEventListener("message", ({ data }) => {
      if (!data || disposed) return;
      if (data.command === "projects") { $("project").replaceChildren(...data.projects.map(p => option(p.id, p.name))); const state = savedState; if (state?.draft && data.projects.some(p => p.id === state.projectId)) { draft = state.draft; step = state.step || 0; $("project").value = state.projectId; for (const [id, prop] of [["schema", "schema"], ["name", "name"], ["parent", "parent"], ["version", "version"], ["member", "membership"], ["superclass", "superclass"], ["kind", "type"], ["dictionary", "kind"], ["lifetime", "lifetime"]]) $(id).value = draft[prop] || ""; $("duplicates").checked = Boolean(draft.duplicatesAllowed); $("load-factor").value = draft.loadFactor ?? ""; } reflectKind(); $("project").onchange(); return; }
      if (data.command === "project") { if (data.sequence !== projectSequence) return; schemaPage = data.page; $("catalog-notice").textContent = data.notice || ""; if (!draft.schema && schemaPage.items.length) draft.schema = schemaPage.items[0].name; $("schema").value = draft.schema; selectedSchema = schemaPage.items.find(s => s.name === draft.schema); if (!draft.version && selectedSchema?.version) $("version").value = draft.version = selectedSchema.version; draft.parent ||= "RootSchema"; renderKeys(); changed(); return; }
      if (data.command === "catalogUpdated") { if (data.project !== projectId) return; schemaPage = data.page; $("catalog-notice").textContent = data.notice || ""; pending.clear(); for (const combo of combos.values()) combo.close(); if (data.created?.type === "schema" && draft.type === "schema" && draft.name === data.created.name) { draft.schema = data.created.name; $("schema").value = draft.schema; } selectedSchema = schemaPage.items.find(s => s.name === draft.schema); persist(); return; }
      if (["search", "schemas", "properties"].includes(data.command)) { if (pending.get(data.field) !== data.sequence) return; let page = data.page; if (data.field === "parent" && !page.offset && !page.items.some(r => r.name === "RootSchema") && (!$("parent").value || "rootschema".includes($("parent").value.toLowerCase()))) page = { ...page, items: [{ name: "RootSchema" }, ...page.items] }; combos.get(data.field)?.render(page); return; }
      if (data.command === "preview") { if (data.sequence !== previewSequence) return; receipt = data.receipt; validPreview = true; $("summary").textContent = data.summary; $("live-source").textContent = data.files.map(file => file.relativePath + "\n" + file.text).join("\n\n"); $("files").replaceChildren(...data.files.map(file => { const section = document.createElement("section"), title = document.createElement("h3"), source = document.createElement("pre"); title.textContent = file.relativePath; source.textContent = file.text; source.tabIndex = 0; section.append(title, source); return section; })); $("status").textContent = "Ready to save " + data.files.length + " native source file(s)."; error(""); updateSteps(); return; }
      if (data.command === "saved") { saving = false; validPreview = false; receipt = undefined; $("save").disabled = true; $("status").textContent = "Saved " + data.files.join(", ") + ". Build or publish separately."; if (data.notice) error(data.notice); return; }
      if (data.command === "error") { if (data.operation === "preview" && data.sequence !== previewSequence) return; if (["search", "schemas", "properties"].includes(data.operation) && pending.get(data.field) !== data.sequence) return; saving = false; validPreview = false; receipt = undefined; error(data.message, data.field); $("status").textContent = "Your choices are preserved. Correct the definition to continue."; updateSteps(); if (data.operation === "save") { $("error").tabIndex = -1; $("error").focus(); } }
    });
    root.addEventListener("unload", () => { disposed = true; clearTimeout(timer); pending.clear(); for (const c of combos.values()) c.dispose(); });
    reflectKind(); send({ command: "ready" });
  }
  return { moveKey, definitionRequest, describeDraft, canSave, mount };
});
