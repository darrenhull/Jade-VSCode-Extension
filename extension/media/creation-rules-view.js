(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JadeCreationRulesView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const bool = (yes, no) => value => value === true ? yes : value === false ? no : undefined;
  const scalar = value => typeof value === "string" && value || typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
  function sizingChoices(sizing = {}) {
    const runtimeNotice = sizing.runtimeMessage || "Jade determines effective runtime allocation; a requested source value is not a guaranteed runtime capacity.";
    return [{ id: "native", label: "Jade default", disabled: false, runtimeNotice }, ...[
      ["blockSize", "Entries per block (source request)"], ["expectedPopulation", "Expected population (source request)"],
    ].map(([id, label]) => {
      const mode = sizing.modes?.[id];
      const known = mode?.status === "known" && mode.integer === true && Number.isSafeInteger(mode.min) && Number.isSafeInteger(mode.max) && mode.min <= mode.max && typeof mode.provenance === "string" && mode.provenance.length > 0;
      return { id, label, disabled: !known, ...(known ? { min: mode.min, max: mode.max, provenance: mode.provenance } : {}), reason: known ? "" : mode?.reason || "Native source bounds for this sizing mode are unavailable.", runtimeNotice };
    })];
  }
  function sizingSelectionError(draft, choices) {
    const id = draft.sizingMode || "native";
    if (id === "native") return;
    const selected = choices.find(mode => mode.id === id);
    if (!selected || selected.disabled) return selected?.reason || "This native source sizing mode is unavailable.";
    if (draft.sizingValue === "" || draft.sizingValue === undefined) return "Enter a native source sizing value, or choose Jade default.";
    if (!Number.isSafeInteger(draft.sizingValue)) return "Native source sizing requires a whole number.";
    if (draft.sizingValue < selected.min || draft.sizingValue > selected.max) return "Native source sizing must be between " + selected.min + " and " + selected.max + ".";
  }
  function field(id, label, raw, format = scalar, provenance) {
    const descriptor = raw && typeof raw === "object" ? raw : { value: raw };
    const formatted = format(descriptor.value);
    return {
      id, label,
      value: formatted === undefined ? "Unknown" : formatted + (descriptor.status === "nativeDefault" ? " (native default)" : ""),
      status: formatted === undefined ? "nativeRequired" : "provided",
      provenance: descriptor.provenance || provenance || "Native metadata origin not supplied",
    };
  }
  function inheritedKeyRows(inherited = {}) {
    return (inherited.keys || []).map((key, keyIndex) => {
      const native = (name, label, formatter, fallback) => field(name, label, key.fields?.[name] ?? key[name] ?? fallback, formatter, key.fieldProvenance?.[name] || inherited.provenance);
      const direction = field("direction", "Direction", key.fields?.descending ?? key.descending, bool("Descending", "Ascending"), key.fieldProvenance?.descending || inherited.provenance);
      const comparison = field("case", "Case comparison", key.fields?.caseInsensitive ?? key.caseInsensitive, bool("Ignore case", "Case-sensitive"), key.fieldProvenance?.caseInsensitive || inherited.provenance);
      const locale = native("locale", "Locale / comparison ID");
      if (locale.value === "Unknown" && key.nativeSortOrder !== undefined) locale.provenance += "; raw native sort order: " + String(key.nativeSortOrder);
      return {
        keyIndex, name: scalar(key.name) || "Unknown key", compatible: inherited.compatibilityStatus === "verified",
        fields: [native("type", "Native type"), native("length", "Native length", scalar, key.nativeLength), native("scale", "Scale"), direction, comparison, locale,
          field("duplicates", "Duplicate keys", inherited.fields?.duplicatesAllowed ?? inherited.duplicatesAllowed, bool("Allowed", "Not allowed"), inherited.fieldProvenance?.duplicatesAllowed || inherited.provenance)],
      };
    });
  }
  function lifetimeRows(lifetime = {}) {
    const labels = {
      persistentAllowed: "Persistent instances", transientAllowed: "Transient instances", sharedTransientAllowed: "Shared transient instances",
      subclassPersistentAllowed: "Persistent instances of subclasses", subclassTransientAllowed: "Transient instances of subclasses", subclassSharedTransientAllowed: "Shared transient instances of subclasses",
    };
    const nested = { persistentAllowed: ["class", "persistent"], transientAllowed: ["class", "transient"], sharedTransientAllowed: ["class", "sharedTransient"], subclassPersistentAllowed: ["subclass", "persistent"], subclassTransientAllowed: ["subclass", "transient"], subclassSharedTransientAllowed: ["subclass", "sharedTransient"] };
    return [field("default", "Default lifetime", lifetime.default, value => ["persistent", "transient"].includes(value) ? value : undefined, lifetime.defaultProvenance || "Selected default on the new source definition"),
      ...Object.entries(labels).map(([id, label]) => field(id, label, lifetime.allowFlags?.[nested[id][0]]?.[nested[id][1]] ?? lifetime.allowFlags?.[id], bool("Allowed", "Not allowed"), lifetime.flagProvenance?.[id]))];
  }
  function placementChoices(storage = {}) {
    const placement = storage.exclusivePlacement || {};
    return {
      classMap: storage.classMap,
      exclusive: [{ id: "owner", label: "Exclusive owner placement" }, { id: "sameFile", label: "Same-file placement" }].map(option => {
        const supplied = placement.options?.find(item => item.id === option.id);
        const disabled = placement.status !== "known" || supplied?.supported !== true;
        return { ...option, disabled, reason: disabled ? supplied?.reason || placement.message || "Native ownership metadata does not establish this placement option." : supplied.reason || "" };
      }),
    };
  }
  function renderTable(document, rows, caption) {
    const table = document.createElement("table"), title = document.createElement("caption"), head = document.createElement("thead"), header = document.createElement("tr"), body = document.createElement("tbody");
    table.className = "native-rules-table"; title.textContent = caption; table.append(title);
    for (const label of ["Setting", "Value", "Evidence"]) { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; header.append(cell); }
    head.append(header); table.append(head);
    for (const row of rows) { const line = document.createElement("tr"); line.dataset.status = row.status; for (const value of [row.label, row.value, row.provenance]) { const cell = document.createElement("td"); cell.textContent = value; line.append(cell); } body.append(line); }
    table.append(body); return table;
  }
  function renderRulesView(document, container, rules = {}) {
    const nodes = [];
    if (rules.lifetime) {
      const note = document.createElement("p"); note.textContent = "Default lifetime chooses an omitted create lifetime. It does not establish which instance or subclass lifetimes are permitted."; note.className = "hint"; nodes.push(note, renderTable(document, lifetimeRows(rules.lifetime), "New definition default and " + (rules.lifetime.owner ? rules.lifetime.owner + " permission flags" : "provided native permission flags") + " (read-only)"));
    }
    if (rules.inheritedKeys && rules.inheritedKeys.status !== "notApplicable") {
      const state = document.createElement("p"); state.className = "hint"; state.setAttribute("role", "status"); state.textContent = rules.inheritedKeys.status === "none" ? "No inherited dictionary keys were found in the supplied metadata." : rules.inheritedKeys.status === "nativeRequired" ? "Inherited key metadata is incomplete. Unknown attributes remain unknown; compatibility requires native validation." : "Inherited native key declarations are read-only. Native Jade still validates subclass compatibility."; nodes.push(state);
      const rows = inheritedKeyRows(rules.inheritedKeys);
      for (const row of rows.slice(0, 64)) nodes.push(renderTable(document, row.fields, "Inherited key " + (row.keyIndex + 1) + ": " + row.name));
      if (rows.length > 64) { const more = document.createElement("p"); more.textContent = "Showing the first 64 inherited keys. Review the native source for the complete definition."; nodes.push(more); }
    }
    for (const warning of rules.warnings || []) { const note = document.createElement("p"); note.className = "hint"; note.textContent = typeof warning === "string" ? warning : warning.message; nodes.push(note); }
    container.replaceChildren(...nodes);
  }
  function renderPlacementView(document, container, storage = {}) {
    const choices = placementChoices(storage), title = document.createElement("h3"), help = document.createElement("p");
    title.textContent = "Exclusive-map placement"; help.className = "hint"; help.textContent = "Ordinary class-to-file mapping and exclusive-map ownership are different native settings.";
    container.replaceChildren(title, help);
    for (const option of choices.exclusive) { const label = document.createElement("label"), select = document.createElement("select"), entry = document.createElement("option"), reason = document.createElement("small");
      label.textContent = option.label; select.disabled = option.disabled; entry.textContent = option.disabled ? "Unavailable" : "Not configured"; select.append(entry); reason.textContent = option.reason; reason.id = "placement-reason-" + option.id; select.setAttribute("aria-describedby", reason.id); label.append(select, reason); container.append(label); }
  }
  return { inheritedKeyRows, lifetimeRows, placementChoices, sizingChoices, sizingSelectionError, renderRulesView, renderPlacementView };
});
