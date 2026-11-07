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
  assert.notEqual(classIdentity({...row,importIdentity:"package",packageAlias:"One"}),classIdentity({...row,importIdentity:"package",packageAlias:"Two"}));
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
test("a temporarily unparseable dirty method retains its selected canvas metadata", async()=>{
  const h=host();let missing=false;const document={isDirty:true,uri:{toString:()=>row.file}};
  const shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>missing?{...snapshot,groups:[],selected:undefined,total:0}:snapshot});
  const view=shell.attach({panel:h.panel,row,document});await h.message({command:"ready"});await h.message({command:"select",id:"m1"});missing=true;await view.refresh();
  const last=h.sent.filter(message=>message.command==="workspace").at(-1).snapshot;
  assert.equal(last.state.selectedId,"m1");assert.equal(last.selected.id,"m1");
});
test("initial member selection survives the custom editor ready handshake",async()=>{
  const h=host(),selected=[];
  const binding={select:(owner,member)=>{selected.push([owner,member]);return {owner,member,text:"getName",version:1};}};
  const shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>snapshot});
  shell.attach({panel:h.panel,row,binding,selectedId:"m1"});await h.message({command:"ready"});
  assert.deepEqual(selected,[["Customer","getName"]]);
  assert.equal(h.sent.filter(message=>message.command==="workspace").at(-1).snapshot.state.selectedId,"m1");
});
test("external selection asks the mounted editor to drain pending changes first",async()=>{
  const h=host(),shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>snapshot});
  const view=shell.attach({panel:h.panel,row});await h.message({command:"ready"});await view.select("m1");
  assert.deepEqual(h.sent.at(-1),{command:"prepareSelection",id:"m1"});
  assert.equal(view.state().selectedId,"");
});
test("foreign inherited source stays read-only and cannot edit the old local binding",async()=>{
  const h=host(),edits=[],document={uri:{toString:()=>row.file},isDirty:false};
  const foreign={id:"foreign",name:"calculate",owner:"Parent",declaringClass:"Parent",kind:"method",inherited:true,file:"C:/parent.cls"};
  const binding={select:()=>{throw Error("must not select old document");},edit:async edit=>edits.push(edit)};
  const shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>({...snapshot,groups:[{label:"Methods",items:[foreign]}]}),preview:async()=>({text:"calculate(); begin end;"})});
  shell.attach({panel:h.panel,row,document,binding});await h.message({command:"ready"});await h.message({command:"select",id:"foreign"});
  assert.equal(h.sent.find(message=>message.command==="editorSnapshot").snapshot.available,false);
  await h.message({command:"editorEdit",edit:{owner:"Parent",member:"calculate",version:1,start:0,end:0,text:"bad"}});
  assert.equal(edits.length,0);assert.ok(h.sent.some(message=>message.command==="editorRejected"));
});
test("the transport never sends more than a bounded member page",async()=>{
  const h=host(),shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>({...snapshot,total:10000,groups:[{label:"Methods",items:Array.from({length:10000},(_,index)=>({id:String(index),name:String(index),kind:"method"}))}]})});
  shell.attach({panel:h.panel,row});await h.message({command:"ready"});
  assert.equal(h.sent.find(message=>message.command==="workspace").snapshot.groups.flatMap(group=>group.items).length,100);
});
test("recovery remains visible from Overview and copy never changes the source",async()=>{
  const h=host(),calls=[],draft={identity:{schema:"Shop",owner:"Customer",member:"getName"},text:"recovered source",modifiedAt:1};
  const recovery={get:()=>draft,copy:async()=>calls.push("copy")};
  const shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>snapshot});
  shell.attach({panel:h.panel,row,services:{draftRecovery:recovery}});await h.message({command:"ready"});await h.message({command:"copyDraft"});
  assert.deepEqual(h.sent.find(message=>message.command==="editorDraftRecovery").draft,draft);assert.deepEqual(calls,["copy"]);
});
test("recovery replacement and discard require explicit modal confirmation",async()=>{
  const h=host(),calls=[],prompts=[];h.vscode.window={showWarningMessage:async(message,options)=>{prompts.push({message,options});return undefined;}};
  const recovery={get:()=>({text:"draft"}),restore:async()=>calls.push("restore"),discard:async()=>calls.push("discard")};
  const shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>snapshot});
  shell.attach({panel:h.panel,row,services:{draftRecovery:recovery}});await h.message({command:"ready"});await h.message({command:"select",id:"m1"});await h.message({command:"restoreDraft"});await h.message({command:"discardDraft"});
  assert.equal(prompts.length,2);assert.ok(prompts.every(prompt=>prompt.options.modal));assert.deepEqual(calls,[]);
});

test("reused class workspace Back restores its latest discovery origin",async()=>{
 const h=host(),origins=[],shell=createClassWorkspaces(h.vscode,h.context,{load:async()=>snapshot,onBack:(_row,origin)=>origins.push(origin)});
 const view=shell.attach({panel:h.panel,row,origin:{scope:"workspace",filter:{query:"old"}}});
 await h.message({command:"ready"});
 view.setOrigin({scope:"workspace",filter:{query:"new",offset:100},scrollTop:80});
 await h.message({command:"backToClasses"});
 assert.equal(origins[0].filter.query,"new");assert.equal(origins[0].scrollTop,80);shell.dispose();
});
