"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createClassWorkspaces, normalizeState, classIdentity, workspaceHtml } = require("../../extension/src/class-workspace");

function host() {
  let message, close;
  const sent = [], stored = new Map();
  return {
    sent,
    panel: { webview: { cspSource: "vscode-resource:", asWebviewUri: value => value.toString(), postMessage: async value => sent.push(value), onDidReceiveMessage: callback => { message = callback; return { dispose() {} }; } }, onDidDispose: callback => { close = callback; return { dispose() {} }; } },
    context: { extensionUri: { fsPath: "C:/extension" }, workspaceState: { get: key => stored.get(key), update: async (key,value) => stored.set(key,value) } },
    vscode: { Uri: { joinPath: (base,...parts) => ({ toString: () => [base.fsPath,...parts].join("/") }) } },
    message: value => message(value), close: () => close(),
  };
}
const row = { projectId: "project-a", schema: "Shop", owner: "Customer", file: "C:/a.cls" };
const snapshot = { identity: { qualifiedName: "Shop::Customer" }, groups: [{ label: "Methods", items: [{ id: "m1", name: "getName", kind: "method" }] }], total: 1, inheritedAvailable: false };

test("class identity keeps projects, schemas and imported aliases separate", () => {
  assert.notEqual(classIdentity(row), classIdentity({ ...row, projectId: "project-b" }));
  assert.notEqual(classIdentity(row), classIdentity({ ...row, schema: "Other" }));
  assert.notEqual(classIdentity(row), classIdentity({ ...row, importIdentity: "Alias" }));
});
test("state clamps large pages and accepts only presentation fields", () => {
  assert.deepEqual(normalizeState({ offset: -1, limit: 100000, railWidth: 500, kind: "bad", query: "x", selectedId: "m1", file: "evil" }), { query: "x", kind: "all", includeInherited: false, offset: 0, limit: 100, railWidth: 320, scrollTop: 0, selectedId: "m1" });
});
test("selection retains class panel and passes only trusted row to source navigation", async () => {
  const h = host(), calls = [], shell = createClassWorkspaces(h.vscode,h.context,{ load: async () => snapshot, onOriginal: (...args) => calls.push(args) });
  shell.attach({ panel: h.panel, row });
  await h.message({ command: "ready" });
  await h.message({ command: "select", id: "m1" });
  await h.message({ command: "openOriginal", file: "C:/attacker.cls" });
  assert.equal(calls.length,1);
  assert.equal(calls[0][0].file,row.file);
  assert.equal(calls[0][1],"m1");
  assert.equal(h.sent.at(-1).snapshot.state.selectedId,"m1");
  shell.dispose();
});
test("late asynchronous load cannot overwrite a newer query or a disposed panel", async () => {
  const h = host(), pending = [], shell = createClassWorkspaces(h.vscode,h.context,{ load: (_row,state) => new Promise(resolve => pending.push({ resolve,state })) });
  shell.attach({ panel:h.panel,row });
  const first = h.message({ command:"ready" });
  const second = h.message({ command:"search", query:"new" });
  pending[1].resolve({ ...snapshot, marker:"new" }); await second;
  pending[0].resolve({ ...snapshot, marker:"old" }); await first;
  assert.equal(h.sent.filter(x => x.command === "workspace").at(-1).snapshot.marker,"new");
  const third = h.message({ command:"search", query:"closed" }); h.close();
  pending[2].resolve(snapshot); await third;
  assert.equal(h.sent.filter(x => x.command === "workspace").length,1);
});
test("filter changes reset pagination and malicious or unsupported actions are ignored", async () => {
  const h=host(), requests=[], shell=createClassWorkspaces(h.vscode,h.context,{load:async (_row,state)=>{requests.push(state);return {...snapshot,total:300};}});
  shell.attach({panel:h.panel,row}); await h.message({command:"ready"});
  await h.message({command:"page",offset:100});
  await h.message({command:"search",query:"name"});
  await h.message({command:"publish"});
  await h.message({command:"select",id:"missing"});
  assert.equal(requests.at(-1).offset,0); assert.equal(requests.at(-1).limit,100);
  assert.equal(requests.length,3);
});
test("HTML provides nonce CSP and an external editor mount without interpolated source",()=>{
  const html=workspaceHtml({nonce:"safe",cspSource:"vscode-resource:",scriptUri:"script.js",styleUri:"style.css"});
  assert.match(html,/default-src 'none'/); assert.match(html,/script-src 'nonce-safe'/);
  assert.match(html,/id="method-editor"/); assert.match(html,/Back to Classes/); assert.doesNotMatch(html,/<textarea/);
});
