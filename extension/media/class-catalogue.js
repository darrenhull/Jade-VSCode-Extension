"use strict";
(() => {
  const vscode = acquireVsCodeApi(),
    query = document.getElementById("query"),
    schema = document.getElementById("schema"),
    rows = document.getElementById("rows"),
    head = document.getElementById("head"),
    suggestions = document.getElementById("suggestions"),
    previous = document.getElementById("previous"),
    next = document.getElementById("next"),
    error = document.getElementById("error");
  let page,
    revision = 0,
    nativePaging,
    timer;
  const send = (offset = 0) =>
    vscode.postMessage({
      command: "query",
      query: query.value,
      schema: schema.value,
      offset,
    });
  query.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => send(), 120);
  });
  query.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      clearTimeout(timer);
      send();
    }
  });
  schema.addEventListener("change", () => {
    clearTimeout(timer);
    send();
  });
  document
    .getElementById("refresh")
    .addEventListener("click", () =>
      vscode.postMessage({ command: "refresh" }),
    );
  document.getElementById("clear").addEventListener("click", () => { query.value=""; clearTimeout(timer); send(); query.focus(); });
  previous.addEventListener("click", () => nativePaging ? vscode.postMessage({command:"nativeFirst"}) : send(page?.previousOffset || 0));
  next.addEventListener("click", () => {
    if (nativePaging) vscode.postMessage({command:"nativeNext"});
    else if (page?.nextOffset !== null) send(page.nextOffset);
  });
  window.addEventListener("message", (event) => {
    const value = event.data;
    if (value?.command === "error") {
      error.hidden = false;
      error.textContent = value.message;
      return;
    }
    if (value?.command !== "catalogue" || value.revision < revision) return;
    revision = value.revision;
    page = value.page;
    nativePaging=value.nativePaging;
    previous.textContent=nativePaging ? "First" : "Previous";
    document.getElementById("refresh").disabled=!!nativePaging?.stale;
    document.getElementById("empty").textContent=value.emptyMessage || "No matching classes.";
    error.hidden = true;
    document.getElementById("title").textContent = value.presentation?.title || value.label;
    document.getElementById("context").hidden=!value.presentation?.instance;
    document.getElementById("context").textContent=value.presentation?.instance ? value.label : "";
    document.getElementById("count").textContent = value.loading
      ? (value.presentation?.instance ? "Loading instances…" : "Loading classes…")
      : page.label + (nativePaging?.stale ? " · Disconnected snapshot — reopen from the connected database" : nativePaging?.cursorReleased ? " · Cursor released — choose First to restart" : "");
    if (document.activeElement !== query) query.value = value.filter.query;
    const selection =
      document.activeElement === schema
        ? schema.value
        : value.filter.schema || "";
    schema.replaceChildren(new Option("All schemas", ""));
    for (const row of value.schemas)
      schema.append(
        new Option(
          row.name + " (" + row.total.toLocaleString() + ")",
          row.name,
        ),
      );
    schema.value = selection;
    suggestions.replaceChildren();
    for (const row of value.suggestions)
      suggestions.append(
        new Option(row.schema + "::" + row.name, row.schema + "::" + row.name),
      );
    head.replaceChildren();
    const header = document.createElement("tr");
    for (const key of value.columns) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = {
        name: value.presentation?.instance ? "Object ID" : "Class",
        className: "Class",
        schema: "Schema",
        parent: "Base class",
        kind: "Kind",
        projectName: "Project",
      }[key];
      header.append(cell);
    }
    head.append(header);
    rows.replaceChildren();
    for (const row of page.items) {
      const tr = document.createElement("tr");
      for (const key of value.columns) {
        const cell = document.createElement("td");
        if (key === "name") {
          const button = document.createElement("button");
          button.className = "class-link";
          button.type = "button";
          button.textContent = row.name;
          button.title = "Explore " + row.schema + "::" + row.name;
          button.disabled=!!nativePaging?.stale;
          button.addEventListener("click", () =>
            vscode.postMessage({ command: "open", id: row.browserId, scrollTop: document.scrollingElement.scrollTop }),
          );
          cell.append(button);
        } else cell.textContent = row[key] || "—";
        tr.append(cell);
      }
      rows.append(tr);
      if (row.browserId === value.selectedId) {
        tr.setAttribute('aria-selected','true');
        tr.classList.add('selected');
      }
    }
    if (Number.isFinite(value.scrollTop)) document.scrollingElement.scrollTop=value.scrollTop;
    previous.disabled = value.loading || (nativePaging ? nativePaging.stale || (nativePaging.number<=1 && !nativePaging.cursorReleased) : !page.hasPrevious);
    next.disabled = value.loading || (nativePaging ? nativePaging.stale || !nativePaging.hasMore : !page.hasMore);
    document.getElementById("empty").hidden =
      value.loading || page.items.length !== 0;
    vscode.setState({
      query: query.value,
      schema: schema.value,
      offset: page.offset,
    });
    vscode.postMessage({
      command: "rendered",
      revision,
      rowsRendered: rows.children.length,
    });
  });
  vscode.postMessage({ command: "ready" });
})();
