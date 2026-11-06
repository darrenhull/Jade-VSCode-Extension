"use strict";
const vscode = acquireVsCodeApi(),
  $ = (id) => document.getElementById(id),
  { fieldText, visibleRows, pageSummary } = JadeObjectPage;
let current;
const send = (command, data = {}) => vscode.postMessage({ command, ...data });
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
    td.textContent = field.error;
    return;
  }
  const content = document.createElement("span");
  content.className = "value-content";
  if (field.oid && !/^0+$/.test(field.oid)) {
    content.append(
      button(
        field.value || field.type + " · " + field.oid.slice(0, 10) + "…",
        "Inspect referenced object " + field.oid,
        () => send("open", { oid: field.oid }),
        "reference",
      ),
    );
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
  $("identity").textContent = "OID " + object.oid;
  $("environment").textContent = current.connection.name;
  $("connection").textContent = current.connection.path || "";
  $("connection-status").classList.add("connected");
  $("status-label").textContent = "Connected";
  $("back").disabled = !current.history.back;
  $("forward").disabled = !current.history.forward;
  $("pin").textContent = current.pinned ? "Unpin tab" : "Pin tab";
  $("pin").setAttribute("aria-pressed", String(current.pinned));
  $("pin-help").textContent = current.pinned
    ? "Pinned: opening a reference keeps this tab and opens another inspector."
    : "Opening a reference reuses this tab. Pin it to compare objects side by side.";
  $("state").textContent = busy
    ? "Retrieving next native page…"
    : "Read-only snapshot" +
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
  $("history").disabled = !(current.history.entries || []).length;
  const properties = object.properties || [],
    rows = visibleRows(properties, $("properties-filter").value);
  $("property-count").textContent = rows.length + " / " + properties.length;
  $("properties").replaceChildren();
  for (const { item, index } of rows) {
    const tr = document.createElement("tr");
    cell(tr, item.name);
    cell(tr, item.type, "type");
    valueCell(tr, item, index, "properties");
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
  if (!object.collection) return;
  const entries = visibleRows(
    page?.items || [],
    $("entries-filter").value,
    $("entries-sort").value,
  );
  $("entries").replaceChildren();
  for (const { item, index } of entries) {
    const tr = document.createElement("tr"),
      key = cell(tr, item.key ?? item.index, "key-column");
    key.append(
      button(
        "Copy",
        "Copy entry key or index",
        () => send("copyKey", { section: "entries", index }),
        "quiet-button copy-value",
      ),
    );
    cell(tr, item.type, "type-column type");
    valueCell(tr, item, index, "entries");
    $("entries").append(tr);
  }
  if (!entries.length)
    empty(
      $("entries"),
      page?.items?.length
        ? "No entries match on this page. Clear the filter or load the next page."
        : "This collection is empty.",
    );
  $("entry-count").textContent = String(page?.items?.length || 0) + " on page";
  $("page-status").textContent = pageSummary(page, entries.length);
  $("clear-filter").hidden = !$("entries-filter").value;
  $("page-size").value = current.limit || 100;
  $("page-size").disabled = Boolean(busy);
  $("first").disabled = Boolean(busy);
  $("next").disabled = busy || !page?.hasMore;
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
  $(id).oninput = render;
$("clear-filter").onclick = () => {
  $("entries-filter").value = "";
  render();
  $("entries-filter").focus();
};
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
    render();
    send("rendered");
  }
  if (data.command === "notice") $("state").textContent = data.message;
  if (data.command === "disconnected") {
    current = undefined;
    $("environment").textContent =
      data.target === "source" ? "Source database" : "Working database";
    $("state").textContent = data.message;
    $("status-label").textContent = "Disconnected";
    $("connection-status").classList.remove("connected");
    $("connection").textContent = "";
    for (const id of [
      "back",
      "forward",
      "refresh",
      "pin",
      "first",
      "next",
      "source",
      "copyOid",
      "history",
      "page-size",
    ])
      $(id).disabled = true;
    $("properties").replaceChildren();
    $("entries").replaceChildren();
    $("collection").hidden = true;
    $("identity").textContent =
      "Reconnect and reopen this object in the selected database.";
    $("pin-help").textContent =
      "Inspection history was cleared when the database disconnected.";
  }
});
send("ready");
