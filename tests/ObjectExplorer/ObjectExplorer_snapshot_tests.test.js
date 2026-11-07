"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { fieldText } = require("../../extension/media/object-page");
const { setup, oid } = require("../../test/fixtures/object-ui.cjs");
const turn = () => new Promise(resolve => setImmediate(resolve));
const latest = panel => panel.messages.filter(message => message.command === "object").at(-1);
async function usingFixture(run) {
  const fixture = setup();
  try { await run(fixture); } finally { await fixture.cleanup(); }
}

test("stored values distinguish null, empty, false, zero, unavailable and unloaded references", () => {
  assert.equal(fieldText({ value: null }), "null");
  assert.equal(fieldText({ value: "" }), '\"\"');
  assert.equal(fieldText({ value: false }), "false");
  assert.equal(fieldText({ value: 0 }), "0");
  assert.equal(fieldText({ error: "Restricted" }), "Unavailable: Restricted");
  assert.equal(fieldText({ oid: "51.1", type: "Fish" }), "Not loaded · 51.1");
  assert.equal(fieldText({}), "Unavailable: no stored value supplied");
});

test("snapshot retains its target context after connection closes", () => usingFixture(async s => {
  await s.connect();
  await s.commands.get("jadeNative.inspectObject")(oid(10));
  const panel = s.panels[0], before = latest(panel);
  assert.equal(before.connection.target, "source");
  assert.ok(before.connection.projectRoot);
  s.clients[0].finishClose();
  await turn();
  assert.equal(panel.messages.at(-1).command, "disconnected");
  assert.equal(panel.messages.at(-1).connection.path, before.connection.path);
  assert.equal(panel.messages.at(-1).object.oid, oid(10));
}));

test("Back restores the prior page and scroll without another native object read", () => usingFixture(async s => {
  await s.connect();
  await s.commands.get("jadeNative.inspectObject")(oid(10));
  const panel = s.panels[0];
  await panel.receive({ command: "viewState", oid: oid(10), scrollY: 127, selection: "name" });
  await panel.receive({ command: "open", oid: oid(11) });
  const count = s.clients[0].requests.filter(request => request.command === "object").length;
  await panel.receive({ command: "back" });
  assert.equal(latest(panel).object.oid, oid(10));
  assert.equal(panel.title, "Fish · " + oid(10));
  assert.equal(latest(panel).view.scrollY, 127);
  assert.equal(s.clients[0].requests.filter(request => request.command === "object").length, count);
}));

test("class-to-instances bridge selects the exact declared schema and reports absent local classes", () => usingFixture(async s => {
  await s.connect();
  const identity = { schema: "Pets", className: "Fish", projectRoot: path.join(s.root, "source") };
  const result = await s.controller.browseInstances(identity);
  assert.equal(result.name, "Fish");
  assert.equal(result.target, "source");
  assert.ok(result.databasePath);
  const missing = await s.controller.browseInstances({ ...identity, schema: "Other" });
  assert.equal(missing.available, false);
  assert.equal(s.controller.session.target, "source");
}));

test("disposed inspection tabs ignore a late native object result", () => usingFixture(async s => {
  await s.connect();
  await s.commands.get("jadeNative.inspectObject")(oid(10));
  const panel = s.panels[0], client = s.clients[0], request = client.request;
  let finish;
  client.request = (command, args) => command === "object"
    ? new Promise(resolve => { finish = () => resolve({ oid: args.oid, className: "Fish", schema: "Pets", properties: [] }); })
    : request(command, args);
  const pending = s.commands.get("jadeNative.inspectObject")(oid(11));
  await turn();
  panel.dispose();
  const count = panel.messages.length;
  finish();
  await pending;
  assert.equal(panel.messages.length, count);
  assert.equal(s.panels.length, 1);
}));

test("disconnected snapshot supports copy and source navigation without reconnecting", () => usingFixture(async s => {
  await s.connect();
  await s.commands.get("jadeNative.inspectObject")(oid(10));
  const panel = s.panels[0];
  s.clients[0].finishClose();
  await turn();
  await panel.receive({ command: "copyOid" });
  assert.equal(s.copied.at(-1), oid(10));
  let source;
  s.commands.set("jadeNative.findSourceClass", (...args) => { source = args; });
  await panel.receive({ command: "source" });
  assert.equal(source[0], "Fish");
  assert.equal(source[1], "Pets");
  assert.ok(source[2]);
  assert.equal(s.clients.length, 1);
}));

test("collection failure retains the object identity and surfaces a retryable page error", () => usingFixture(async s => {
  await s.connect();
  const client = s.clients[0], request = client.request;
  client.request = async (command, args) => {
    if (command === "object") return { oid: args.oid, className: "FishList", schema: "Pets", collection: true, properties: [] };
    if (command === "collection") throw Error("Cursor read denied");
    return request(command, args);
  };
  await s.commands.get("jadeNative.inspectObject")(oid(20));
  const data = latest(s.panels[0]);
  assert.equal(data.object.oid, oid(20));
  assert.equal(data.error, "Cursor read denied");
  assert.equal(data.page, undefined);
}));

test("cancelled class instance target selection never starts a database session and resolves the requested project", () => usingFixture(async s => {
  s.vscode.window.showQuickPick = async () => undefined;
  const project = path.join(s.root, "different-project");
  const result = await s.controller.browseInstances({ schema: "Pets", className: "Fish", projectRoot: project });
  assert.equal(result.cancelled, true);
  assert.equal(s.clients.length, 0);
  assert.equal(s.configCalls.at(-1).folder.uri.fsPath, project);
}));

test("older class-to-instances chooser cannot retarget a newer class request", () => usingFixture(async s => {
  let resolve, count = 0;
  s.vscode.window.showQuickPick = async () => ++count === 1 ? new Promise(done => { resolve = done; }) : { target: "source" };
  const identity = { schema: "Pets", className: "Fish", projectRoot: path.join(s.root, "source") };
  const older = s.controller.browseInstances(identity);
  await turn();
  await s.controller.browseInstances(identity);
  resolve({ target: "source" });
  assert.equal((await older).cancelled, true);
  assert.equal(s.clients.length, 1);
}));

test("local source metadata stays separate from the database snapshot", async () => {
  const s = setup({sourceContext: async identity => ({available:true,file:"file:///C:/workspace/Fish.cls",dirty:true,identity})});
  try {
    await s.connect();
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const data = latest(s.panels[0]);
    assert.equal(data.source.dirty,true);
    assert.equal(data.source.identity.schema,"Pets");
    assert.equal(data.source.identity.projectRoot,data.connection.projectRoot);
    assert.equal(data.object.source,undefined);
  } finally { await s.cleanup(); }
});

test("unavailable inspection configuration offers settings while keeping local classes usable", async () => {
  const s = setup({configError:"No database connection configured"});
  try {
    let actions; s.vscode.window.showErrorMessage=async (_message,...items)=>{actions=items;};
    const result=await s.controller.browseInstances({schema:"Pets",className:"Fish",projectRoot:s.root});
    assert.equal(result.available,false);
    assert.match(result.reason,/No database connection/);
    assert.ok(actions.includes("Open Jade settings"));
    assert.equal(s.clients.length,0);
  } finally { await s.cleanup(); }
});

test("missing class source offers the existing pull workflow only after explicit selection", async()=>{
 let pulls=0;const s=setup({pullSource:async()=>{pulls++;}});
 try{await s.connect();await s.commands.get("jadeNative.inspectObject")(oid(10));
 s.commands.set("jadeNative.findSourceClass",async()=>({opened:false}));
 s.vscode.window.showInformationMessage=async(_message,...choices)=>choices.includes("Pull source…")?"Pull source…":undefined;
 assert.equal(pulls,0);await s.panels[0].receive({command:"source"});assert.equal(pulls,1);
 }finally{await s.cleanup();}
});

test("late native class reveal cannot steal selection from a newer instance request",async()=>{
 const s=setup();try{await s.connect();let resume;const reveals=[];s.controller.view.reveal=async row=>{reveals.push(row);if(reveals.length===1)await new Promise(resolve=>{resume=resolve;});};
 const identity={schema:"Pets",className:"Fish",projectRoot:require("node:path").join(s.root,"source")};
 const older=s.controller.browseInstances(identity);await turn();
 await s.controller.browseInstances(identity);const count=reveals.length;resume();
 assert.equal((await older).cancelled,true);assert.equal(reveals.length,count);
 }finally{await s.cleanup();}
});

test("manual database switch cancels pending class reveal before stale native instance lookup",async()=>{
 const s=setup();try{await s.connect();let resume;s.controller.view.reveal=()=>new Promise(resolve=>{resume=resolve;});
 const pending=s.controller.browseInstances({schema:"Pets",className:"Fish",projectRoot:require("node:path").join(s.root,"source")});await turn();
 const switched=s.controller.session.select("working");s.clients[0].finishClose();await switched;resume();
 assert.equal((await pending).cancelled,true);assert.equal(s.clients[0].requests.filter(request=>request.command==="instances").length,0);
 }finally{await s.cleanup();}
});

test("database tree class source resolves within the selected inspection project",async()=>{
 const s=setup();try{await s.connect();let source;s.commands.set("jadeNative.findSourceClass",(...args)=>{source=args;});
 await s.commands.get("jadeNative.openObjectClassSource")({name:"Fish",schema:"Pets"});
 assert.equal(source[2],require("node:path").join(s.root,"source"));
 }finally{await s.cleanup();}
});

test("pinning a snapshot while a reference loads prevents late replacement",async()=>{
 const s=setup();try{await s.connect();await s.commands.get("jadeNative.inspectObject")(oid(10));const panel=s.panels[0],client=s.clients[0],request=client.request;let finish;
 client.request=(command,args)=>command==="object"?new Promise(resolve=>{finish=()=>resolve({oid:args.oid,className:"Fish",schema:"Pets",properties:[]});}):request(command,args);
 await panel.receive({command:"open",oid:oid(11)});await panel.receive({command:"pin"});finish();await turn();
 assert.equal(latest(panel).object.oid,oid(10));assert.equal(latest(panel).pinned,true);
 }finally{await s.cleanup();}
});

test("inspection status bar follows explicit native session target changes",async()=>{
 const s=setup();try{await s.connect();const changing=s.controller.session.select("working");s.clients[0].finishClose();await changing;assert.match(s.statuses[0].text,/Working/);
 }finally{await s.cleanup();}
});
