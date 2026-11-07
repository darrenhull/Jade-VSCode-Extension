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
  function prepareInheritedKeys(current, inherited) {
    if (inherited?.status !== "known" || !Array.isArray(inherited.keys) || !inherited.keys.length) return;
    const fields = ["name", "type", "length", "scale", "descending", "caseInsensitive", "locale"];
    const keys = inherited.keys.map(key => Object.fromEntries(fields.filter(field => Object.hasOwn(key, field)).map(field => [field, key[field]])));
    if (keys.some(key => typeof key.name !== "string" || !key.name)) return;
    if (keys.some(key => typeof key.descending !== "boolean" || typeof key.caseInsensitive !== "boolean")) return;
    if (inherited.kind === "external" && keys.some(key => !key.type || ["String", "StringUtf8", "Binary", "Decimal"].includes(key.type) && !Number.isSafeInteger(key.length) || key.type === "Decimal" && !Number.isSafeInteger(key.scale))) return;
    return { keys, requiresConfirmation: current.some(key => key.name || key.descending || key.caseInsensitive || key.locale !== undefined) };
  }
  function collectionPresentation(draft) {
    const family = draft.collectionFamily || (draft.kind === "external" ? "externalDictionary" : "memberDictionary");
    const dictionary = ["memberDictionary", "externalDictionary"].includes(family);
    const selector = family === "memberDictionary" ? "member" : family === "externalDictionary" ? "external" : family;
    const base = { memberDictionary: "MemberKeyDictionary", externalDictionary: "ExtKeyDictionary", objectArray: "ObjectArray", objectSet: "ObjectSet" }[family];
    return { family, keys: dictionary, tuning: dictionary || family === "objectSet", selector, base: base ? "RootSchema::" + base : undefined };
  }
  function comparisonPresentation(key, kind) {
    const type = kind === "external" ? key.type : key._type;
    const applicable = !type || ["String", "StringUtf8"].includes(type), knownString = type === "String";
    const mode = key.comparison || "native";
    return { type, applicable, mode, legacy: applicable && mode === "native", options: [
      { value: "native", label: "Jade default / locale", disabled: false },
      { value: "binary", label: "Binary (case-sensitive)", disabled: !knownString },
      { value: "latin1", label: "Latin1 (unavailable)", disabled: true }
    ], reason: "Latin1 source syntax is not yet proved for this Jade runtime; this mode is unavailable." + (!knownString ? " Binary requires a known String key; select a String property or key type." : " Binary omits LCID and ignore-case options.") };
  }
  function comparisonSelectionError(draft) {
    if (draft.type !== "collection" || !collectionPresentation(draft).keys) return;
    for (const [index, key] of (draft.keys || []).entries()) {
      const view = comparisonPresentation(key, draft.kind);
      if (!view.applicable) continue;
      if (view.mode === "binary" && view.type !== "String") return { field: "key-comparison-" + index, message: "Binary comparison requires a known String key. Select a String property or choose Jade default / locale." };
      if (!["native", "binary"].includes(view.mode)) return { field: "key-comparison-" + index, message: "Latin1 or unknown comparison modes are unavailable until their native source behavior is proved. Choose Jade default / locale." };
    }
  }
  function definitionRequest(draft) {
    const request = JSON.parse(JSON.stringify(draft));
    for (const key of request.keys || []) {
      const view = comparisonPresentation(key, draft.kind);
      if (!view.applicable || key.comparison === "binary") { delete key.locale; delete key.caseInsensitive; }
      if (!view.applicable) delete key.comparison;
      delete key._type;
    }
    if (draft.type === "collection" && !collectionPresentation(draft).keys) {
      delete request.keys; delete request.duplicatesAllowed; delete request.kind;
    }
    if (draft.type === "collection" && !collectionPresentation(draft).tuning) delete request.loadFactor;
    if (draft.sizingMode !== undefined) {
      delete request.blockSize; delete request.expectedPopulation;
      if (["blockSize", "expectedPopulation"].includes(draft.sizingMode) && draft.sizingValue !== "" && draft.sizingValue !== undefined) request[draft.sizingMode] = Number(draft.sizingValue);
    }
    delete request.sizingMode; delete request.sizingValue;
    if (draft.type !== "collection") for (const field of ["mapFile", "blockSize", "expectedPopulation", "loadFactor", "keys", "membership", "membershipSchema", "collectionFamily", "kind", "duplicatesAllowed"]) delete request[field];
    return request;
  }
  function canSave({ step, receipt, validPreview, saving }) { return step === 2 && Boolean(receipt) && validPreview === true && saving !== true; }
  function choicePresentation(row, contextSchema) {
    const label = row.label || (row.schema ? row.schema + "::" : "") + row.name + (row.type ? " : " + row.type : "");
    let detail = "";
    if (row.imported) {
      const declaration = row.importingSchema || row.declarationSchema || row.id?.split("::")[0] || "Unknown importing schema", usage = row.usedInSchema || contextSchema;
      detail = "Exported by " + (row.originSchema || "unknown schema") + " · imported as " + (row.nativeName || row.name) + " in " + declaration + (usage && usage !== declaration ? " · used from " + usage : "");
      if (row.metadataStatus === "nativeRequired") detail += " · exported member/property metadata unavailable";
    }
    if (row.disabled && row.reason) detail += (detail ? " · " : "") + row.reason;
    return { label, detail, disabled: row.disabled === true };
  }
  function diagnosticPresentation(data) {
    if (data.code === "JADE_IMPORT_METADATA_UNAVAILABLE" || data.metadataStatus === "nativeRequired") return { kind: "metadata-unavailable", message: "Metadata unavailable: " + data.message };
    if (data.nativeCodeProvenance) return { kind: "native-rule-hint", message: "Rule validation: " + data.message, evidence: data.nativeCodeProvenance };
    if (data.code === "JADE_TYPE_NOT_VISIBLE") return { kind: "invalid-selection", message: "Type unavailable in this schema: " + data.message };
    return { kind: "validation", message: data.message || "" };
  }
  function diagnosticField(data) {
    if (!Number.isSafeInteger(data.keyIndex) || data.keyIndex < 0) return data.field;
    const suffix = { length: "length", nativeLength: "length", type: "type", scale: "scale", descending: "direction", direction: "direction", caseInsensitive: "case", locale: "locale", nativeSortOrder: "locale", comparison: "comparison" }[data.attribute];
    return "key-" + (suffix ? suffix + "-" : "") + data.keyIndex;
  }
  function describeDraft(draft) {
    if (draft.type === "schema") return "Schema " + (draft.name || "…") + " inheriting " + (draft.parent || "RootSchema");
    if (draft.type === "class") return "A " + draft.lifetime + " class " + (draft.name || "…") + " inheriting " + (draft.superclass || "Object");
    const family = collectionPresentation(draft).family;
    if (["objectArray", "objectSet"].includes(family)) return "A " + draft.lifetime + " " + (family === "objectArray" ? "array" : "set") + " of " + (draft.membership?.split("::").at(-1) || "…") + ". No sort keys apply.";
    const keys = (draft.keys || []).map(k => (k.name || "…") + (k.descending ? " descending" : " ascending") + (k.comparison === "binary" && comparisonPresentation(k, draft.kind).applicable ? " · Binary" : ""));
    return "A " + draft.lifetime + " dictionary of " + (draft.membership?.split("::").at(-1) || "…") + (keys.length ? ", sorted by " + keys.join(", then ") : "") + "; duplicate keys " + (draft.duplicatesAllowed ? "allowed" : "prohibited") + ".";
  }
  function mount(root) {
    const document = root.document, vscode = root.acquireVsCodeApi(), $ = id => document.getElementById(id);
    let sequence = 0, projectSequence, previewSequence, receipt, step = 0, timer, disposed = false;
    const savedState = vscode.getState();
    const pending = new Map(), combos = new Map();
    let draft = { type: "class", schema: "", name: "", superclass: "Object", lifetime: "transient", kind: "member", membership: "", keys: [{ name: "" }], duplicatesAllowed: false };
    let schemaPage = { items: [] }, selectedSchema, projectId, requestedProject, saveSequence, validPreview = false, saving = false;
    let sizingMetadata = {}, sizingModes = root.JadeCreationRulesView.sizingChoices({}), sizingContext, sizingOptionsStamp;
    const send = message => vscode.postMessage(["preview", "save", "search", "schemas", "properties", "invalidate", "describe", "storage"].includes(message.command) ? { ...message, project: projectId } : message);
    function setSaving(value) { saving = value; $("project").disabled = value; $("refresh-choices").disabled = value; }
    const option = (value, text = value) => { const o = document.createElement("option"); o.value = value; o.textContent = text; return o; };
    function persist() { vscode.setState({ draft, step, projectId }); }
    function error(message, field, details = {}) {
      const diagnostic = diagnosticPresentation({ ...details, message });
      $("error").hidden = !message; $("error").textContent = diagnostic.message; $("error").dataset.kind = diagnostic.kind;
      if (diagnostic.evidence) { const evidence = document.createElement("small"); evidence.className = "native-error-evidence"; evidence.textContent = diagnostic.evidence; $("error").append(evidence); }
      for (const el of document.querySelectorAll(".field-error")) el.textContent = "";
      for (const el of document.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
      if (field && $(field)) {
        const control = $(field), id = field === "name" ? "name-error" : "field-error-" + field;
        let detail = $(id);
        if (!detail) { detail = document.createElement("small"); detail.id = id; detail.className = "field-error"; control.parentElement.append(detail); const ids = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)); ids.add(id); control.setAttribute("aria-describedby", [...ids].join(" ")); }
        detail.textContent = diagnostic.message; control.setAttribute("aria-invalid", "true");
      }
    }
    function updateSteps() {
      $("definition").hidden = step !== 0; $("rules").hidden = step !== 1; $("review").hidden = step !== 2;
      $("back").hidden = step === 0; $("next").hidden = step === 2; $("save").hidden = step !== 2;
      $("save").disabled = !canSave({ step, receipt, validPreview, saving });
      $("next").textContent = step === 0 && draft.type === "collection" && collectionPresentation(draft).keys ? "Keys & rules →" : "Review source →";
      Array.from($("steps").children).forEach((el, index) => { if (index === step) el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current"); });
      $("steps").children[1].hidden = draft.type !== "collection" || !collectionPresentation(draft).keys;
      $("steps").children[2].textContent = (draft.type === "collection" && collectionPresentation(draft).keys ? "3" : "2") + " · Review";
      persist();
    }
    function renderSizing(metadata = sizingMetadata) {
      sizingMetadata = metadata || {};
      sizingModes = root.JadeCreationRulesView.sizingChoices(sizingMetadata);
      const stamp = JSON.stringify(sizingModes);
      if (stamp !== sizingOptionsStamp) {
        $("sizing-mode").replaceChildren(...sizingModes.map(mode => { const entry = option(mode.id, mode.label); entry.disabled = mode.disabled; entry.title = mode.reason || mode.provenance || ""; return entry; }));
        sizingOptionsStamp = stamp;
      }
      $("sizing-mode").value = draft.sizingMode || "native";
      const selected = sizingModes.find(mode => mode.id === (draft.sizingMode || "native"));
      $("sizing-value").disabled = !selected || selected.id === "native" || selected.disabled;
      if (selected && !selected.disabled && selected.id !== "native") { $("sizing-value").min = String(selected.min); $("sizing-value").max = String(selected.max); }
      else { $("sizing-value").removeAttribute("min"); $("sizing-value").removeAttribute("max"); }
      const known = selected?.id === "native" ? sizingModes.find(mode => mode.id !== "native" && !mode.disabled) : selected;
      $("sizing-note").textContent = (known && !known.disabled ? "Verified native source range: " + known.min + "–" + known.max + ". " + known.provenance : selected?.reason || sizingModes.find(mode => mode.disabled)?.reason || "Native source bounds are unavailable.") + " " + (selected?.runtimeNotice || "");
    }
    function reflectKind() {
      const schema = draft.type === "schema", collection = draft.type === "collection";
      for (const el of document.querySelectorAll(".schema-only")) el.hidden = !schema;
      for (const el of document.querySelectorAll(".not-schema")) el.hidden = schema;
      for (const el of document.querySelectorAll(".collection-only")) el.hidden = !collection;
      $("schema").parentElement.hidden = schema;
      $("name-label").textContent = schema ? "Schema name" : collection ? "Collection class name" : "Class name";
      $("rules").hidden = step !== 1 || !collectionPresentation(draft).keys;
      $("collection-rules").hidden = !collection;
      $("load-factor-field").hidden = !collectionPresentation(draft).tuning;
      $("sizing-value-field").hidden = !draft.sizingMode || draft.sizingMode === "native";
      $("sizing-value-label").textContent = draft.sizingMode === "expectedPopulation" ? "Requested expected population" : "Requested entries per block";
      renderSizing(); renderKeys(); updateSteps();
    }
    function changed() {
      validPreview = false; receipt = undefined; $("save").disabled = true;
      $("live-source").textContent = "Checking the current definition…";
      $("rule-details").textContent = "Checking native metadata for the current selection…";
      $("rules-info").textContent = "Checking native rules for the current selection…";
      send({ command: "invalidate" });
      $("summary").textContent = describeDraft(draft); error("");
      const context = [projectId, draft.type, draft.schema, collectionPresentation(draft).family].join("|");
      if (context !== sizingContext) { sizingContext = context; renderSizing({}); }
      clearTimeout(timer); previewSequence = ++sequence;
      $("status").textContent = "Checking your definition…";
      const id = previewSequence;
      timer = setTimeout(() => { if (!disposed && projectId !== undefined && requestedProject === undefined) { if (draft.type !== "schema") send({ command: "describe", sequence: id, request: definitionRequest(draft) }); send({ command: "preview", sequence: id, request: definitionRequest(draft) }); } }, 180);
      persist();
    }
    function search(field, query, offset = 0) {
      if (disposed || projectId === undefined || requestedProject !== undefined) return;
      const id = ++sequence;
      pending.set(field, id);
      const base = { sequence: id, field, query, offset, limit: 50, schema: draft.schema, membership: draft.membership, collectionKind: field === "superclass" && draft.type === "collection" && collectionPresentation(draft).keys ? draft.kind : undefined, collectionFamily: field === "superclass" && draft.type === "collection" ? collectionPresentation(draft).family : undefined };
      send({ ...base, command: field === "schema" || field === "parent" ? "schemas" : field.startsWith("key-") ? "properties" : field === "map-file" ? "storage" : "search", kind: field === "member" ? "member" : "superclass" });
      $("status").textContent = "Searching…";
    }
    function combo(input, list, field, choose) {
      let rows = [], active = -1, page, query = "", hideTimer, searchTimer, closed = false;
      input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", list.id); input.setAttribute("aria-expanded", "false");
      const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
      function select(row) { if (row.disabled) return; choose(row); close(); input.focus(); }
      function render(value) {
        if (closed || document.activeElement !== input && !list.contains(document.activeElement)) return;
        page = value; rows = value.items || []; active = -1;
        list.replaceChildren(...rows.map((row, index) => {
          const b = document.createElement("button"); b.type = "button"; b.role = "option"; b.tabIndex = -1; b.id = list.id + "-" + index;
          const presentation = choicePresentation(row, draft.schema); b.textContent = presentation.label; b.disabled = presentation.disabled; b.setAttribute("aria-disabled", String(presentation.disabled));
          if (presentation.detail) { const context = document.createElement("small"); context.className = "choice-context"; context.textContent = presentation.detail; b.append(context); b.title = presentation.detail; }
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
    function renderReviewFiles(files) {
      $("files").replaceChildren(...files.map(file => {
        const section = document.createElement("section"), title = document.createElement("h3"), source = document.createElement("pre");
        title.textContent = (file.operation === "update" ? "Update existing schema metadata · " : "Create · ") + file.relativePath;
        source.textContent = file.text; source.tabIndex = 0; source.setAttribute("aria-label", "Reviewed native source for " + file.relativePath);
        section.append(title);
        if (file.operation === "update") {
          const note = document.createElement("p"); note.textContent = "This reviewed change adds the new class mapping to existing native schema metadata. It does not move existing object data."; section.append(note);
          const before = document.createElement("details"), label = document.createElement("summary"), original = document.createElement("pre"); label.textContent = "Current on-disk metadata"; original.textContent = file.expectedText; original.tabIndex = 0; before.append(label, original); section.append(before);
        }
        section.append(source); return section;
      }));
      $("save").textContent = files.some(file => file.operation === "update") ? "Save source & reviewed metadata" : "Save source files";
    }
    function renderRules(rules) {
      if (!rules) return;
      renderSizing(rules.sizing);
      root.JadeCreationRulesView.renderRulesView(document, $("rule-details"), rules);
      const parts = [];
      const inherited = rules.inheritedKeys;
      if (inherited?.status === "known") parts.push("Inherited keys" + (inherited.owner ? " from " + inherited.owner : "") + ": " + inherited.keys.map(key => (key.name || String(key)) + (key.descending === true ? " descending" : key.descending === false ? " ascending" : " (direction unknown)")).join(", ") + ". These keys are read-only here.");
      else if (inherited?.status === "nativeRequired") parts.push("Inherited key definitions require native validation; no inferred keys will be generated.");
      else if (inherited?.status === "none" && collectionPresentation(draft).keys) parts.push("No inherited sort keys.");
      if (rules.keyBudget?.message && collectionPresentation(draft).keys) parts.push(rules.keyBudget.message);
      if (rules.lifetime?.message) { parts.push(rules.lifetime.message); $("lifetime-note").textContent = rules.lifetime.message; }
      for (const warning of rules.warnings || []) parts.push(typeof warning === "string" ? warning : warning.message);
      $("rules-info").replaceChildren(...parts.filter(Boolean).map(text => { const p = document.createElement("p"); p.className = "hint"; p.textContent = text; return p; }));
      if (inherited?.status === "known" && inherited.nativeSource) { const details = document.createElement("details"), summary = document.createElement("summary"), source = document.createElement("pre"); summary.textContent = "Inherited key declarations (read-only)"; source.textContent = inherited.nativeSource; source.tabIndex = 0; details.append(summary, source); $("rules-info").append(details); }
      const prepared = prepareInheritedKeys(draft.keys, inherited);
      if (prepared && collectionPresentation(draft).keys) {
        const use = document.createElement("button"); use.type = "button"; use.id = "use-inherited-keys"; use.className = "secondary"; use.textContent = "Use inherited keys";
        function apply() { draft.keys = prepared.keys; renderKeys(); changed(); $("status").textContent = "Inherited key settings copied. Review them before saving."; }
        use.onclick = () => {
          if (!prepared.requiresConfirmation) { apply(); return; }
          const confirmation = document.createElement("div"), message = document.createElement("p"), replace = document.createElement("button"), cancel = document.createElement("button");
          confirmation.setAttribute("role", "group"); confirmation.setAttribute("aria-labelledby", "inherited-confirmation"); message.id = "inherited-confirmation"; message.textContent = "Replace your current key choices with the inherited settings?";
          replace.type = cancel.type = "button"; replace.textContent = "Replace current keys"; replace.id = "replace-inherited-keys"; cancel.textContent = "Keep my keys"; cancel.className = "secondary";
          replace.onclick = apply; cancel.onclick = () => { confirmation.remove(); use.hidden = false; use.focus(); }; confirmation.append(message, replace, cancel); $("rules-info").append(confirmation); use.hidden = true; replace.focus();
        };
        $("rules-info").append(use);
      }
    }
    combo($("schema"), $("schema-results"), "schema", row => { selectedSchema = row; draft.schema = row.name; $("schema").value = row.name; if (row.version) $("version").value = draft.version = row.version; invalidateChoices(); renderKeys(); changed(); });
    combo($("parent"), $("parent-results"), "parent", row => { draft.parent = row.name; $("parent").value = row.name; changed(); });
    combo($("member"), $("member-results"), "member", row => { draft.membership = row.id || row.name; draft.membershipSchema = row.schema; $("member").value = row.label || row.name; invalidateChoices(); for (const key of draft.keys) delete key._type; renderKeys(); changed(); });
    combo($("superclass"), $("superclass-results"), "superclass", row => { draft.superclass = row.id || row.name; draft.superclassSchema = row.schema; $("superclass").value = row.label || row.name; changed(); });
    combo($("map-file"), $("map-file-results"), "map-file", row => { draft.mapFile = row.id; $("map-file").value = row.label || row.id; changed(); });
    function renderKeys() {
      for (const field of [...combos.keys()]) if (field.startsWith("key-")) { combos.get(field).dispose(); combos.delete(field); pending.delete(field); }
      $("keys").replaceChildren();
      (draft.keys || []).forEach((key, index) => {
        const row = document.createElement("fieldset"); row.className = "key";
        const legend = document.createElement("legend"); legend.textContent = "Key " + (index + 1); row.append(legend);
        function field(label, el) { const l = document.createElement("label"); l.textContent = label; l.append(el); row.append(l); return el; }
        const name = document.createElement("input"); name.value = key.name || ""; name.id = "key-" + index; name.autocomplete = "off";
        field(draft.kind === "external" ? "Key name" : "Property or reference path", name);
        name.oninput = () => { key.name = name.value; if (draft.kind !== "external") delete key._type; reflectComparison(); changed(); };
        if (draft.kind !== "external") { const list = document.createElement("span"); list.id = "key-results-" + index; list.className = "results"; list.hidden = true; list.role = "listbox"; name.parentElement.className = "choice"; name.parentElement.append(list); combo(name, list, "key-" + index, property => { key.name = property.name; key._type = property.type; name.value = property.name; renderKeys(); changed(); $("key-" + index)?.focus(); }); }
        if (draft.kind === "external") {
          const type = document.createElement("select"); type.id = "key-type-" + index; type.append(...["String", "StringUtf8", "Binary", "Integer", "Integer64", "Real", "Decimal", "Date", "Time", "TimeStamp", "Boolean", "Character"].map(t => option(t))); type.value = key.type || "String"; key.type = type.value; field("Key type", type).onchange = () => { key.type = type.value; renderKeys(); changed(); };
          if (["String", "StringUtf8", "Binary", "Decimal"].includes(key.type)) { const length = document.createElement("input"); length.id = "key-length-" + index; length.type = "number"; length.min = "1"; length.value = key.length ?? (key.type === "Decimal" ? 12 : 30); key.length = Number(length.value); length.title = "Preserves the native Jade CLS length or precision token; no character-to-byte conversion is performed."; field(key.type === "Decimal" ? "Precision" : "Native CLS length", length).oninput = () => { key.length = Number(length.value); changed(); }; }
          if (key.type === "Decimal") { const scale = document.createElement("input"); scale.id = "key-scale-" + index; scale.type = "number"; scale.min = "0"; scale.value = key.scale ?? 0; field("Scale", scale).oninput = () => { key.scale = Number(scale.value); changed(); }; }
        }
        const direction = document.createElement("select"); direction.id = "key-direction-" + index; direction.append(option("asc", "Ascending"), option("desc", "Descending")); direction.value = key.descending ? "desc" : "asc"; field("Direction", direction).onchange = () => { key.descending = direction.value === "desc"; changed(); };
        const ci = document.createElement("input"); ci.id = "key-case-" + index; ci.type = "checkbox"; ci.checked = Boolean(key.caseInsensitive); field("Ignore case (text)", ci).onchange = () => { key.caseInsensitive = ci.checked; changed(); };
        const locale = document.createElement("input"); locale.id = "key-locale-" + index; locale.type = "number"; locale.min = "1"; locale.placeholder = "Schema default"; locale.value = key.locale ?? ""; field("Text locale ID", locale).oninput = () => { if (locale.value === "") delete key.locale; else key.locale = Number(locale.value); changed(); };
        const locales = document.createElement("datalist"); locales.id = "key-locales-" + index; locale.setAttribute("list", locales.id); locales.append(...(selectedSchema?.locales || []).slice(0, 100).map(value => option(String(value.id), value.name + " (" + value.id + ")"))); row.append(locales);
        const schemaLocale = selectedSchema?.locales?.find(value => value.schemaDefault); if (schemaLocale) locale.placeholder = "Schema default (" + schemaLocale.id + ")";
        const comparison = document.createElement("select"); comparison.id = "key-comparison-" + index;
        field("Text comparison", comparison); const comparisonHelp = document.createElement("small"); comparisonHelp.id = "key-comparison-help-" + index; comparisonHelp.className = "hint";
        comparison.setAttribute("aria-describedby", comparisonHelp.id); comparison.parentElement.append(comparisonHelp);
        function reflectComparison() {
          const view = comparisonPresentation(key, draft.kind);
          comparison.replaceChildren(...view.options.map(choice => { const item = option(choice.value, choice.label); item.disabled = choice.disabled; return item; })); comparison.value = view.mode;
          comparison.parentElement.hidden = !view.applicable; comparisonHelp.textContent = view.reason;
          ci.disabled = locale.disabled = !view.legacy; ci.parentElement.hidden = locale.parentElement.hidden = !view.legacy;
        }
        comparison.onchange = () => { key.comparison = comparison.value; reflectComparison(); changed(); };
        reflectComparison();
        const controls = document.createElement("div"); controls.className = "key-controls";
        for (const [label, delta] of [["Up", -1], ["Down", 1], ["Remove", 0]]) { const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = label === "Up" ? "↑" : label === "Down" ? "↓" : "Remove"; b.setAttribute("aria-label", label + " key " + (index + 1)); b.disabled = delta !== 0 && (index + delta < 0 || index + delta >= draft.keys.length); b.onclick = () => { if (delta) draft.keys = moveKey(draft.keys, index, delta); else draft.keys.splice(index, 1); renderKeys(); changed(); const focus = $("key-" + Math.max(0, Math.min(draft.keys.length - 1, index + delta))); focus?.focus(); }; controls.append(b); }
        row.append(controls); $("keys").append(row);
      });
      $("add-key").disabled = draft.keys.length >= 16;
    }
    for (const id of ["schema", "name", "parent", "version", "superclass", "member", "load-factor", "map-file"]) $(id).addEventListener("input", () => {
      const prop = { member: "membership", "load-factor": "loadFactor", "map-file": "mapFile" }[id] || id;
      draft[prop] = id === "load-factor" ? ($(id).value === "" ? undefined : Number($(id).value)) : $(id).value;
      if (id === "member") delete draft.membershipSchema; if (id === "superclass") delete draft.superclassSchema; changed();
      if (["schema", "member"].includes(id)) { for (const [field, combo] of combos) if (field !== id) { pending.delete(field); combo.close(); } }
    });
    $("kind").onchange = () => { draft.type = $("kind").value; step = 0; if (draft.type === "collection" && draft.superclass?.split("::").at(-1) === "Object") draft.superclass = $("dictionary").selectedOptions[0]?.dataset.base || (draft.kind === "external" ? "ExtKeyDictionary" : "MemberKeyDictionary"); if (draft.type === "class" && ["MemberKeyDictionary", "ExtKeyDictionary", "ObjectArray", "ObjectSet"].includes(draft.superclass?.split("::").at(-1))) draft.superclass = "Object"; $("superclass").value = draft.superclass; invalidateChoices(); reflectKind(); changed(); };
    $("dictionary").onchange = () => {
      const value = $("dictionary").value;
      draft.collectionFamily = value === "member" ? "memberDictionary" : value === "external" ? "externalDictionary" : value;
      if (["member", "external"].includes(value)) draft.kind = value;
      const selected = $("dictionary").selectedOptions[0];
      if (selected?.dataset.base) draft.superclass = selected.dataset.base;
      else draft.superclass = draft.kind === "member" ? "MemberKeyDictionary" : "ExtKeyDictionary";
      $("superclass").value = draft.superclass; step = 0; invalidateChoices(); reflectKind(); changed();
    };
    $("lifetime").onchange = () => { draft.lifetime = $("lifetime").value; changed(); };
    $("sizing-mode").onchange = () => { draft.sizingMode = $("sizing-mode").value; reflectKind(); changed(); };
    $("sizing-value").oninput = () => { draft.sizingValue = $("sizing-value").value === "" ? "" : Number($("sizing-value").value); changed(); };
    $("duplicates").onchange = () => { draft.duplicatesAllowed = $("duplicates").checked; changed(); };
    $("add-key").onclick = () => { draft.keys.push({ name: "" }); renderKeys(); changed(); $("key-" + (draft.keys.length - 1))?.focus(); };
    $("next").onclick = () => { step = step === 0 && draft.type === "collection" && collectionPresentation(draft).keys ? 1 : 2; updateSteps(); changed(); const heading = (step === 1 ? $("rules") : $("review")).querySelector("h2"); heading.tabIndex = -1; heading.focus(); };
    $("back").onclick = () => { step = step === 2 && draft.type === "collection" && collectionPresentation(draft).keys ? 1 : 0; updateSteps(); };
    $("cancel").onclick = () => send({ command: "cancel" });
    $("designer").onsubmit = event => { event.preventDefault(); if (!canSave({ step, receipt, validPreview, saving })) return; setSaving(true); saveSequence = previewSequence; $("save").disabled = true; send({ command: "save", sequence: saveSequence, receipt }); };
    $("project").onchange = () => { if (saving) { $("project").value = projectId; return; } requestedProject = $("project").value; receipt = undefined; validPreview = false; clearTimeout(timer); previewSequence = undefined; $("save").disabled = true; projectSequence = ++sequence; pending.clear(); for (const c of combos.values()) c.close(); send({ command: "project", project: requestedProject, sequence: projectSequence }); };
    $("refresh-choices").onclick = () => $("project").onchange();
    root.addEventListener("message", ({ data }) => {
      if (!data || disposed) return;
      if (data.command === "projects") { $("project").replaceChildren(...data.projects.map(p => option(p.id, p.name))); const state = savedState; if (state?.draft && data.projects.some(p => p.id === state.projectId)) { draft = state.draft; step = state.step || 0; $("project").value = state.projectId; for (const [id, prop] of [["schema", "schema"], ["name", "name"], ["parent", "parent"], ["version", "version"], ["member", "membership"], ["superclass", "superclass"], ["kind", "type"], ["lifetime", "lifetime"], ["map-file", "mapFile"]]) $(id).value = draft[prop] || ""; $("dictionary").value = collectionPresentation(draft).selector; $("duplicates").checked = Boolean(draft.duplicatesAllowed); $("load-factor").value = draft.loadFactor ?? ""; $("sizing-mode").value = draft.sizingMode || "native"; $("sizing-value").value = draft.sizingValue ?? ""; } reflectKind(); $("project").onchange(); return; }
      if (data.command === "project") { if (data.sequence !== projectSequence || data.project !== requestedProject) return; projectId = data.project; requestedProject = undefined; $("project").value = projectId; schemaPage = data.page; $("catalog-notice").textContent = data.notice || ""; if (!draft.schema && schemaPage.items.length) draft.schema = schemaPage.items[0].name; $("schema").value = draft.schema; selectedSchema = schemaPage.items.find(s => s.name === draft.schema); if (!draft.version && selectedSchema?.version) $("version").value = draft.version = selectedSchema.version; draft.parent ||= "RootSchema"; renderKeys(); changed(); return; }
      if (data.command === "catalogUpdated") { if (data.project !== projectId) return; schemaPage = data.page; $("catalog-notice").textContent = data.notice || ""; pending.clear(); for (const combo of combos.values()) combo.close(); if (data.created?.type === "schema" && draft.type === "schema" && draft.name === data.created.name) { draft.schema = data.created.name; $("schema").value = draft.schema; } selectedSchema = schemaPage.items.find(s => s.name === draft.schema); persist(); return; }
      if (["search", "schemas", "properties", "storage"].includes(data.command)) { if (pending.get(data.field) !== data.sequence) return; let page = data.page; if (data.command === "storage") { $("map-file-note").textContent = page.message || "Only existing native database files are offered. The reviewed mapping applies to this new class."; root.JadeCreationRulesView.renderPlacementView(document, $("exclusive-placement-view"), page); } if (data.field === "parent" && !page.offset && !page.items.some(r => r.name === "RootSchema") && (!$("parent").value || "rootschema".includes($("parent").value.toLowerCase()))) page = { ...page, items: [{ name: "RootSchema" }, ...page.items] }; combos.get(data.field)?.render(page); return; }
      if (data.command === "describe") { if (requestedProject === undefined && data.sequence === previewSequence) renderRules(data.rules); return; }
      if (data.command === "preview") { if (requestedProject !== undefined || data.sequence !== previewSequence || data.project !== undefined && data.project !== projectId) return; const comparisonError = comparisonSelectionError(draft); if (comparisonError) { receipt = undefined; validPreview = false; error(comparisonError.message, comparisonError.field); $("status").textContent = "Choose an available comparison mode before reviewing source."; updateSteps(); return; } renderRules(data.rules); const sizingError = draft.type === "collection" && root.JadeCreationRulesView.sizingSelectionError(draft, sizingModes); if (sizingError) { receipt = undefined; validPreview = false; error(sizingError, "sizing-mode"); $("status").textContent = "Your sizing choice is preserved. Correct it or explicitly choose Jade default."; updateSteps(); return; } receipt = data.receipt; validPreview = true; $("summary").textContent = data.summary; $("live-source").textContent = data.files.map(file => file.relativePath + "\n" + file.text).join("\n\n"); renderReviewFiles(data.files); $("status").textContent = "Ready to save " + data.files.length + " native source file(s)" + (data.files.some(file => file.operation === "update") ? ", including a reviewed existing metadata update." : "."); error(""); updateSteps(); return; }
      if (data.command === "saved") { if (data.sequence !== saveSequence) return; setSaving(false); validPreview = false; receipt = undefined; $("save").disabled = true; $("status").textContent = "Saved " + data.files.join(", ") + ". Build or publish separately."; if (data.notice) error(data.notice); return; }
      if (data.command === "error") { if (data.operation === "project") { if (data.sequence !== projectSequence) return; requestedProject = undefined; $("project").value = projectId ?? ""; if (!saving) projectId = undefined; } if (data.operation === "save" && data.sequence !== saveSequence) return; if (["preview", "describe"].includes(data.operation) && data.sequence !== previewSequence) return; if (data.operation === "describe") { $("rules-info").textContent = data.message; $("rule-details").textContent = "Native metadata for the current selection is unavailable: " + data.message; return; } if (["search", "schemas", "properties", "storage"].includes(data.operation) && pending.get(data.field) !== data.sequence) return; if (data.operation === "save") setSaving(false); validPreview = false; receipt = undefined; error(data.message, diagnosticField(data), data); $("status").textContent = data.operation === "project" ? "Choose a project or refresh source choices before continuing." : diagnosticPresentation(data).kind === "metadata-unavailable" ? "Your choices are preserved. Supply the missing metadata, then refresh source choices." : "Your choices are preserved. Correct the definition to continue."; updateSteps(); if (data.operation === "save") { $("error").tabIndex = -1; $("error").focus(); } }
    });
    root.addEventListener("unload", () => { disposed = true; clearTimeout(timer); pending.clear(); for (const c of combos.values()) c.dispose(); });
    root.JadeCreationRulesView.renderPlacementView(document, $("exclusive-placement-view"), {});
    reflectKind(); send({ command: "ready" });
  }
  return { comparisonPresentation, comparisonSelectionError, moveKey, prepareInheritedKeys, definitionRequest, describeDraft, collectionPresentation, canSave, diagnosticField, choicePresentation, diagnosticPresentation, mount };
});
