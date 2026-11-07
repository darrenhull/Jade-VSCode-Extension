"use strict";
const vscode = acquireVsCodeApi(),
  $ = (id) => document.getElementById(id),
  { fieldText, visibleRows, pageSummary } = JadeObjectPage;
let current;
const compact = window.matchMedia?.("(max-width: 480px)");
if (compact) {
  const layout = () => { $("inspection-more").open = !compact.matches; };
  layout(); compact.addEventListener("change", layout);
}
function saveView() {
  if (!current) return;
  vscode.postMessage({ command: "viewState", oid: current.object.oid, scrollY: window.scrollY,
    propertiesScroll: $("properties").closest(".table-wrap").scrollTop,
    entriesScroll: $("entries").closest(".table-wrap").scrollTop,
    selection: document.activeElement?.closest?.("tr")?.dataset.selection || current.view?.selection || "",
    propertiesFilter: $("properties-filter").value, entriesFilter: $("entries-filter").value,
    entriesSort: $("entries-sort").value });
}
const send = (command, data = {}) => { saveView(); vscode.postMessage({ command, ...data }); };
for (const command of [
  "back",
  "forward",
  "refresh",
  "pin",
  "first",
  "next",
  "database",
  "focusExplorer",
  "source",
  "copyOid",
])
  $(command).onclick = () => send(command);
$("history").onchange = () =>
  send("history", { index: Number($("history").value) });
$("page-size").onchange = () =>
  send("pageSize", { limit: Number($("page-size").value) });
function cell(row, text, cls) {
  const td = document.createElement("td");
  td.textContent = text ?? "null";
  if (cls) td.className = cls;
  row.append(td);
  return td;
}
function button(text, title, click, cls = "quiet-button") {
  const b = document.createElement("button");
  b.textContent = text;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.className = cls;
  b.onclick = click;
  return b;
}
function valueCell(row, field, index, section) {
  const td = cell(row, "");
  td.className = "value-cell";
  if (field.error) {
    td.classList.add("error");
    td.textContent = "Unavailable: " + field.error;
    return;
  }
  const content = document.createElement("span");
  content.className = "value-content";
  if (field.oid && !/^0+$/.test(field.oid)) {
    content.append(
      button(
        field.value ?? (field.type + " · " + field.oid),
        ((current.history.entries || []).some(item => item.oid === field.oid) ? "Previously inspected · Open referenced object " : "Inspect referenced object ") + field.oid,
        () => send("open", { oid: field.oid, section, index }),
        "reference",
      ),
    );
    content.firstChild.disabled = Boolean(current.stale);
  } else content.textContent = fieldText(field);
  td.append(
    content,
    button(
      "Copy",
      "Copy " + (field.name || "entry") + " value",
      () => send("copyValue", { index, section }),
      "quiet-button copy-value",
    ),
  );
}
function empty(target, text) {
  const tr = document.createElement("tr"),
    td = cell(tr, text, "empty");
  td.colSpan = 3;
  target.append(tr);
}
function render() {
  if (!current) return;
  const { object, page, busy } = current;
  $("title").textContent = object.className;
  $("schema").textContent =
    object.schema +
    " schema" +
    (object.collection ? " · Collection" : " · Object");
  $("project").textContent = (current.connection.connection || "Configured connection") + (current.connection.projectRoot ? " · " + current.connection.projectRoot : "");
  $("source-context").textContent = current.source?.available
    ? "Local source · " + (current.source.dirty ? "Unsaved changes" : "Saved file") + " · " + current.source.file + " · Deployment not verified"
    : "Local source unavailable · " + (current.source?.reason || "No resolved local declaration.");
  $("identity").textContent = "OID " + object.oid;
  $("origin").textContent = current.origin ? "From " + current.origin.schema + "::" + current.origin.className + " · " + current.origin.oid + (current.origin.property ? " · " + current.origin.property : "") : "";
  $("environment").textContent = current.connection.name;
  $("connection").textContent = current.connection.path || "";
  $("connection-status").classList.toggle("connected", !current.stale);
  $("status-label").textContent = current.stale ? "Disconnected · stale snapshot" : "Connected";
  $("back").disabled = current.stale || !current.history.back;
  $("forward").disabled = current.stale || !current.history.forward;
  $("pin").textContent = current.pinned ? "Unpin tab" : "Pin tab";
  $("pin").setAttribute("aria-pressed", String(current.pinned));
  $("pin-help").textContent = current.pinned
    ? "Pinned: opening a reference keeps this tab and opens another inspector."
    : "Opening a reference reuses this tab. Pin it to compare objects side by side.";
  $("state").textContent = current.stale ? "Disconnected · Last retrieved snapshot retained. Choose a database and reopen the object to reconnect." : busy
    ? "Retrieving next native page…"
    : current.error ? "Collection read failed: " + current.error + ". Use First to retry." : "Read-only snapshot" +
      (current.readAt
        ? " · Retrieved " + new Date(current.readAt).toLocaleTimeString()
        : "") +
      " · Refresh for current values.";
  for (const id of ["refresh", "source", "copyOid", "pin"])
    $(id).disabled = Boolean(busy);
  $("history").replaceChildren();
  for (const [index, item] of (current.history.entries || []).entries()) {
    const option = document.createElement("option");
    option.value = index;
    option.textContent =
      item.schema + "::" + item.className + " · " + item.oid.slice(0, 10) + "…";
    option.selected = index === current.history.position;
    $("history").append(option);
  }
  $("history").disabled = current.stale || !(current.history.entries || []).length;
  const properties = object.properties || [],
    rows = visibleRows(properties, $("properties-filter").value);
  $("property-count").textContent = rows.length + " / " + properties.length;
  $("properties").replaceChildren();
  for (const { item, index } of rows) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0; tr.dataset.selection = "property:" + item.name;
    tr.classList.toggle("selected", current.view?.selection === tr.dataset.selection);
    cell(tr, item.name);
    tr.cells[0].dataset.label = "Property";
    cell(tr, item.type, "type").dataset.label = "Type";
    valueCell(tr, item, index, "properties");
    tr.lastChild.dataset.label = "Value";
    $("properties").append(tr);
  }
  if (!rows.length)
    empty(
      $("properties"),
      properties.length
        ? "No properties match this filter."
        : "No declared properties.",
    );
  $("object-properties").hidden =
    Boolean(object.collection) && !properties.length;
  $("collection").hidden = !object.collection;
  $("refresh").disabled = current.stale || Boolean(busy);
  if (!object.collection) return;
  const entries = visibleRows(
    page?.items || [],
    $("entries-filter").value,
    $("entries-sort").value,
  );
  $("entries").replaceChildren();
  for (const { item, index } of entries) {
    const tr = document.createElement("tr"),
      key = cell(tr, item.key ?? item.index ?? "Not supplied", "key-column");
    tr.tabIndex = 0; tr.dataset.selection = "entry:" + index;
    key.dataset.label = "Key / index";
    key.append(
      button(
        "Copy",
        "Copy entry key or index",
        () => send("copyKey", { section: "entries", index }),
        "quiet-button copy-value",
      ),
    );
    key.lastChild.disabled = item.key === undefined && item.index === undefined;
    cell(tr, item.type, "type-column type").dataset.label = "Type";
    valueCell(tr, item, index, "entries");
    tr.lastChild.dataset.label = "Value";
    $("entries").append(tr);
  }
  if (!entries.length)
    empty(
      $("entries"),
      page?.items?.length
        ? "No entries match on this page. Clear the filter or load the next page."
        : current.error ? "Collection entries could not be loaded. Use First to retry." : "This collection is empty.",
    );
  $("entry-count").textContent = String(page?.items?.length || 0) + " on page";
  $("page-status").textContent = page?.restartRequired ? "Retained page snapshot · First restarts native traversal." : pageSummary(page, entries.length);
  $("clear-filter").hidden = !$("entries-filter").value;
  $("page-size").value = current.limit || 100;
  $("refresh").disabled = current.stale || Boolean(busy);
  $("page-size").disabled = current.stale || Boolean(busy);
  $("first").disabled = current.stale || Boolean(busy);
  $("next").disabled = current.stale || busy || !page?.hasMore;
  for (const element of document.querySelectorAll(".key-column"))
    element.hidden = !$("show-key").checked;
  for (const element of document.querySelectorAll(".type-column"))
    element.hidden = !$("show-type").checked;
}
for (const id of [
  "properties-filter",
  "entries-filter",
  "entries-sort",
  "show-key",
  "show-type",
])
  $(id).oninput = () => { render(); saveView(); };
$("clear-filter").onclick = () => {
  $("entries-filter").value = "";
  render();
  saveView();
  $("entries-filter").focus();
};
let scrollTimer;
window.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveView, 80); }, true);
window.addEventListener("blur", saveView);
window.addEventListener("keydown", (event) => {
  if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const command = event.key === "ArrowLeft" ? "back" : "forward";
    if (!$(command).disabled) send(command);
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === "c" &&
    current
  ) {
    event.preventDefault();
    send("copyOid");
  }
});
window.addEventListener("message", ({ data }) => {
  if (data.command === "object") {
    if (current?.object.oid !== data.object.oid) {
      $("properties-filter").value = "";
      $("entries-filter").value = "";
      $("entries-sort").value = "native";
    }
    current = data;
    $("properties-filter").value = data.view?.propertiesFilter || "";
    $("entries-filter").value = data.view?.entriesFilter || "";
    $("entries-sort").value = data.view?.entriesSort || "native";
    render();
    window.scrollTo(0, data.view?.scrollY || 0);
    $("properties").closest(".table-wrap").scrollTop = data.view?.propertiesScroll || 0;
    $("entries").closest(".table-wrap").scrollTop = data.view?.entriesScroll || 0;
    send("rendered");
  }
  if (data.command === "notice") $("state").textContent = data.message;
  if (data.command === "disconnected" && current) {
    current.stale = true;
    render();
  }
});
send("ready");
