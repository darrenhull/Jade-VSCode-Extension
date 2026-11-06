"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { registerClassCatalogue } = require("../extension/src/class-catalogue");
function fixture(options = {}) {
  const panels = [],
    opened = [],
    context = { extensionPath: "C:/extension", subscriptions: [] },
    vscode = {
      ViewColumn: { Active: -1 },
      Uri: { file: (p) => ({ toString: () => p }) },
      window: {
        createWebviewPanel: (type, title, column, settings) => {
          let receive, closed;
          const panel = {
            type,
            title,
            column,
            settings,
            reveals: 0,
            webview: {
              cspSource: "test-source",
              asWebviewUri: (uri) => uri,
              onDidReceiveMessage: (fn) => {
                receive = fn;
                return { dispose() {} };
              },
              postMessage: async (m) => {
                panel.messages.push(m);
                return true;
              },
            },
            messages: [],
            onDidDispose: (fn) => {
              closed = fn;
              return { dispose() {} };
            },
            reveal() {
              this.reveals++;
            },
            dispose() {
              closed?.();
            },
            receive: (m) => receive(m),
          };
          panels.push(panel);
          return panel;
        },
      },
    };
  const controller = registerClassCatalogue(vscode, context, {
    label: "Classes",
    scope: "workspace",
    getRows: async () => [{ schema: "Pets", name: "Fish", parent: "Object" }],
    openClass: async (row, scope) => opened.push({ row, scope }),
    ...options,
  });
  return { controller, panels, opened, context };
}
test("persistent catalogue searches all 30,000 classes and sends one page without source payloads", async () => {
  const rows = Array.from({ length: 30000 }, (_, i) => ({
      schema: i % 2 ? "A" : "B",
      name: "Class" + String(i).padStart(5, "0"),
      parent: "Object",
      entries: [{ source: "secret-source" }],
    })),
    f = fixture({ getRows: async () => rows });
  await f.controller.show();
  const panel = f.panels[0];
  await panel.receive({ command: "ready" });
  let payload = f.controller.snapshot();
  assert.equal(payload.page.items.length, 100);
  assert.equal(payload.page.total, 30000);
  assert.doesNotMatch(JSON.stringify(payload), /secret-source|entries/);
  await f.controller.setFilter({ query: "Class29999" });
  payload = f.controller.snapshot();
  assert.equal(payload.page.total, 1);
  assert.equal(payload.suggestions.length, 1);
  assert.equal(payload.page.items[0].name, "Class29999");
  await f.controller.setFilter({ query: "", schema: "A", offset: 100 });
  payload = f.controller.snapshot();
  assert.equal(payload.page.offset, 100);
  assert.equal(payload.page.total, 15000);
  assert.equal(payload.page.items.length, 100);
  await f.controller.show();
  assert.equal(f.panels.length, 1);
  assert.equal(panel.column, -1);
  assert.ok(panel.reveals > 0);
});
test("opening accepts only known schema-qualified class IDs", async () => {
  const f = fixture();
  await f.controller.show();
  await assert.rejects(f.controller.open("file:///bad.cls"), /Unknown class/);
  const row = f.controller.snapshot().page.items[0];
  await f.controller.open(row.browserId);
  assert.equal(f.opened.length, 1);
  assert.equal(f.opened[0].row.name, "Fish");
  assert.equal(f.opened[0].scope.scope, "workspace");
});
test("stale asynchronous loads cannot overwrite the latest target and invalidation rejects old IDs", async () => {
  let resolve,
    n = 0;
  const f = fixture({
    getRows: () =>
      ++n === 1
        ? new Promise((r) => (resolve = r))
        : Promise.resolve({
            rows: [{ schema: "Live", name: "Current" }],
            scope: "database:Working",
            generation: 2,
            label: "Working · Read-only",
          }),
  });
  const first = f.controller.show();
  await f.controller.refresh();
  resolve({
    rows: [{ schema: "Old", name: "Stale" }],
    scope: "database:Source",
    generation: 1,
  });
  await first;
  assert.equal(f.controller.snapshot().page.items[0].name, "Current");
  const id = f.controller.snapshot().page.items[0].browserId;
  f.controller.invalidate();
  await assert.rejects(f.controller.open(id), /refresh|Unknown class/);
  await f.controller.refresh();
  await assert.rejects(
    f.controller.open(JSON.stringify(["database:Source", "Live", "Current"])),
    /Unknown class/,
  );
});
test("disposing clears the panel and reopens safely with a strict content security policy", async () => {
  const f = fixture();
  await f.controller.show();
  const old = f.panels[0];
  assert.match(old.webview.html, /Content-Security-Policy/);
  assert.match(old.webview.html, /class-catalogue\.js/);
  assert.doesNotMatch(old.webview.html, /onclick=/);
  old.dispose();
  assert.equal(f.controller.panel, undefined);
  await f.controller.show();
  assert.equal(f.panels.length, 2);
  assert.notEqual(f.controller.panel, old);
  f.controller.dispose();
  assert.equal(f.controller.panel, undefined);
});

test("obsolete catalogue request errors are discarded after a newer context wins", async () => {
  let reject,
    count = 0;
  const f = fixture({
    getRows: () =>
      ++count === 1
        ? new Promise((_, r) => (reject = r))
        : Promise.resolve([{ schema: "New", name: "Class" }]),
  });
  const first = f.controller.show();
  await f.controller.refresh();
  reject(Error("old connection closed"));
  await first;
  assert.equal(f.controller.snapshot().page.items[0].schema, "New");
});
