"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const {setup, oid} = require("./fixtures/object-ui.cjs");

test('Working inspection sends original Source configuration with its explicit native target',async()=>{
 const s=setup({nativeTarget:true});
 try{await s.commands.get('jadeNative.connectObjects')();assert.equal(s.sessionData[0].databasePath,path.join(s.root,'database'));assert.equal(s.sessionData[0].target,'working');assert.equal(s.sessionData[0].readOnly,true);}finally{await s.cleanup();}
});
test("exclusive handoff waits for the logical inspector session to close", async () => {
  const s = setup();
  try {
    await s.connect();
    assert.equal(s.controller.ownsLock(), true);
    let completed = false;
    const release = s.controller
      .releaseForOperation()
      .then(() => (completed = true));
    await Promise.resolve();
    assert.equal(s.clients[0].stopCalled, true);
    assert.equal(completed, false);
    assert.equal(s.busy(), false);
    s.clients[0].finishClose();
    await release;
    assert.equal(s.busy(), false);
    assert.equal(s.configFiles.length, 0);
  } finally {
    await s.cleanup();
  }
});
test("concurrent exclusive handoffs both wait for the same logical session close", async () => {
  const s = setup();
  try {
    await s.connect();
    let first = false,
      second = false;
    const a = s.controller.releaseForOperation().then(() => (first = true)),
      b = s.controller.releaseForOperation().then(() => (second = true));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(first, false);
    assert.equal(second, false);
    assert.equal(s.busy(), false);
    s.clients[0].finishClose();
    await Promise.all([a, b]);
    assert.equal(s.busy(), false);
  } finally {
    await s.cleanup();
  }
});
test("configured empty workspaces can browse a database without searching for a CLS file", async () => {
  const s = setup();
  try {
    s.vscode.window.activeTextEditor = undefined;
    await s.connect();
    assert.equal(s.clients.length, 1);
    assert.equal(s.controller.ownsLock(), true);
    assert.equal(s.sessionData[0].readOnly, true);
  } finally {
    await s.cleanup();
  }
});
test("instance pages remain bounded and expose returning to the first native page", async () => {
  const s = setup();
  try {
    await s.connect();
    const schema = (await s.controller.provider.getChildren()).find(
        (r) => r.kind === "schema",
      ),
      cls = (await s.controller.provider.getChildren(schema))[0];
    let children = await s.controller.provider.getChildren(cls);
    assert.equal(children.filter((r) => r.kind === "object").length, 100);
    assert.equal(
      children.some((r) => r.name === "Fish 0"),
      true,
    );
    await s.commands.get("jadeNative.moreObjectInstances")(cls);
    children = await s.controller.provider.getChildren(cls);
    assert.equal(children.filter((r) => r.kind === "object").length, 100);
    assert.equal(
      children.some((r) => r.name === "Fish 0"),
      false,
    );
    assert.equal(
      children.some((r) => r.command === "jadeNative.firstObjectInstances"),
      true,
    );
  } finally {
    await s.cleanup();
  }
});
test("object panels identify the selected readonly database and invalidate data after a switch", async () => {
  const s = setup();
  try {
    await s.connect();
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const p = s.panels[0],
      data = p.messages.find((m) => m.command === "object");
    assert.equal(data.connection.name, "Source database");
    assert.equal(data.connection.readOnly, true);
    assert.match(p.webview.html, /Content-Security-Policy/);
    const switching = s.controller.session.select("working");
    s.clients[0].finishClose();
    await switching;
    assert.equal(p.messages.at(-1).command, "disconnected");
    assert.equal(s.controller.session.history.length, 0);
  } finally {
    await s.cleanup();
  }
});
test("cancel during connection setup cannot launch a helper or clear a subsequent compiler lock", async () => {
  const s = setup({ delayedBusy: true });
  try {
    await s.commands.get("jadeNative.selectInspectionDatabase")();
    const connecting = s.commands.get("jadeNative.connectObjects")();
    for (let i = 0; i < 10 && !s.controller.ownsLock(); i++)
      await Promise.resolve();
    assert.equal(s.controller.ownsLock(), false);
    const releasing = s.controller.releaseForOperation();
    s.setExternalBusy(true);
    s.allowBusy();
    await releasing;
    await connecting;
    assert.equal(s.clients.length, 0);
    assert.equal(s.busy(), true);
  } finally {
    await s.cleanup();
  }
});
test("show system schemas requests a new native catalog with the selected scope", async () => {
  const s = setup();
  try {
    await s.connect();
    assert.equal(
      (await s.controller.provider.getChildren()).some(
        (r) => r.name === "RootSchema",
      ),
      false,
    );
    await s.commands.get("jadeNative.toggleSystemObjects")();
    assert.equal(
      (await s.controller.provider.getChildren()).some(
        (r) => r.name === "RootSchema",
      ),
      true,
    );
    assert.equal(
      s.clients[0].requests.filter((r) => r.command === "catalog").at(-1).args
        .includeSystem,
      true,
    );
  } finally {
    await s.cleanup();
  }
});
test("an older catalog response cannot overwrite a newer system-schema selection", async () => {
  const s = setup();
  try {
    await s.connect();
    let first, second;
    const client = s.clients[0],
      original = client.request;
    let count = 0;
    client.request = (command, args) =>
      command === "catalog"
        ? new Promise((resolve) => {
            if (++count === 1) first = resolve;
            else second = resolve;
          })
        : original(command, args);
    const on = s.commands.get("jadeNative.toggleSystemObjects")();
    for (let i = 0; i < 20 && !first; i++) await Promise.resolve();
    const off = s.commands.get("jadeNative.toggleSystemObjects")();
    for (let i = 0; i < 20 && !second; i++) await Promise.resolve();
    second({ schemas: [{ name: "Pets", oid: oid(1), classes: [] }] });
    await off;
    first({ schemas: [{ name: "JadeSystem", oid: oid(900), classes: [] }] });
    await on;
    assert.equal(
      (await s.controller.provider.getChildren()).some(
        (r) => r.name === "JadeSystem",
      ),
      false,
    );
  } finally {
    await s.cleanup();
  }
});
test("toggling subclasses invalidates an outstanding instance page and releases its stale cursor", async () => {
  const s = setup();
  try {
    await s.connect();
    const provider = s.controller.provider,
      schema = (await provider.getChildren()).find((r) => r.kind === "schema"),
      cls = (await provider.getChildren(schema))[0],
      client = s.clients[0],
      original = client.request;
    let resolve;
    client.request = (command, args) =>
      command === "instances" && !args.includeSubclasses
        ? new Promise((r) => (resolve = r))
        : original(command, args);
    const previous = provider.getChildren(cls);
    await s.commands.get("jadeNative.toggleObjectSubclasses")();
    resolve({
      items: [{ oid: oid(123), label: "Old page" }],
      cursor: "stale-cursor",
      hasMore: true,
    });
    await previous;
    const rows = await provider.getChildren(cls);
    assert.equal(
      rows.some((r) => r.name === "Old page"),
      false,
    );
    assert.ok(
      client.requests.some(
        (r) => r.command === "release" && r.args.cursor === "stale-cursor",
      ),
    );
  } finally {
    await s.cleanup();
  }
});
test("security policy denials are not misreported as database lock failures", async () => {
  const s = setup();
  try {
    await s.connect();
    s.clients[0].request = async () => {
      throw Error(
        "A DevelopmentSecurityLibrary is configured. Inspection is blocked until native authentication is supported.",
      );
    };
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    assert.match(s.errors[0], /DevelopmentSecurityLibrary/);
    assert.doesNotMatch(s.errors[0], /database may already be open/);
  } finally {
    await s.cleanup();
  }
});
test("copy controls copy known object values rather than arbitrary webview payloads", async () => {
  const s = setup();
  try {
    await s.connect();
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const panel = s.panels[0];
    await panel.receive({ command: "copyOid" });
    assert.equal(s.copied.at(-1), oid(10));
    await panel.receive({
      command: "copyValue",
      section: "properties",
      index: 0,
      text: "injected",
    });
    assert.equal(s.copied.at(-1), "Bubbles");
    const count = s.copied.length;
    await panel.receive({
      command: "copyValue",
      section: "properties",
      index: 999,
    });
    assert.equal(s.copied.length, count);
  } finally {
    await s.cleanup();
  }
});
test("a slow collection response cannot replace details after navigation to another object", async () => {
  const s = setup();
  try {
    await s.connect();
    const client = s.clients[0],
      original = client.request;
    let resolve;
    client.request = (command, args) =>
      command === "object" && args.oid === oid(10)
        ? Promise.resolve({
            oid: oid(10),
            schema: "Pets",
            className: "OldCollection",
            collection: true,
            properties: [],
          })
        : command === "collection"
          ? new Promise((r) => (resolve = r))
          : original(command, args);
    const first = s.commands.get("jadeNative.inspectObject")(oid(10));
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    assert.ok(resolve);
    await s.commands.get("jadeNative.inspectObject")(oid(20));
    resolve({
      items: [{ index: 1, value: "old collection data" }],
      hasMore: false,
      cursor: null,
    });
    await first;
    const latest = s.panels[0].messages
      .filter((m) => m.command === "object")
      .at(-1);
    assert.equal(latest.object.oid, oid(20));
    assert.equal(latest.page, undefined);
    assert.match(s.panels[0].title, /Fish/);
  } finally {
    await s.cleanup();
  }
});

test("collection paging is bounded, deduplicated and cannot overwrite newer navigation", async () => {
  const s = setup();
  try {
    await s.connect();
    const client = s.clients[0],
      original = client.request;
    let resolve,
      requests = 0;
    client.request = (command, args) =>
      command === "object" && args.oid === oid(10)
        ? Promise.resolve({
            oid: oid(10),
            schema: "Pets",
            className: "Items",
            collection: true,
            properties: [],
          })
        : command === "collection"
          ? ++requests === 1
            ? Promise.resolve({
                items: [{ index: 1, value: "first" }],
                cursor: "page1",
                hasMore: true,
              })
            : new Promise((r) => (resolve = r))
          : original(command, args);
    await s.commands.get("jadeNative.inspectObject")(oid(10));
    const panel = s.panels[0];
    const first = panel.receive({ command: "next" }),
      duplicate = panel.receive({ command: "next" });
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    assert.equal(requests, 2);
    await s.commands.get("jadeNative.inspectObject")(oid(20));
    resolve({
      items: [{ index: 2, value: "stale" }],
      cursor: "stale-page",
      hasMore: true,
    });
    await Promise.all([first, duplicate]);
    const latest = panel.messages.filter((m) => m.command === "object").at(-1);
    assert.equal(latest.object.oid, oid(20));
    assert.equal(latest.page, undefined);
    assert.ok(
      client.requests.some(
        (r) => r.command === "release" && r.args.cursor === "stale-page",
      ),
    );
  } finally {
    await s.cleanup();
  }
});
test("shared inspection passes configuration in memory without temporary files", async () => {
  const s = setup();
  try {
    await s.connect();
    assert.equal(s.configFiles.length, 0);
  } finally {
    await s.cleanup();
  }
});
test("native security sign-on supplies a masked password before connection with in-memory credentials", async () => {
  const s = setup({ authentication: true });
  try {
    await s.connect();
    assert.equal(s.clients.length, 1);
    assert.equal(s.prompts.length, 2);
    assert.equal(s.prompts[1].password, true);
    assert.equal(s.sessionData[0].user, "developer");
    assert.equal(s.sessionData[0].password, "private-password");
    assert.ok(s.configFiles.every((file) => !fs.existsSync(file)));
    assert.equal(s.errors.length, 0);
  } finally {
    await s.cleanup();
  }
});
test("a slower object read cannot overwrite a later navigation", async () => {
  const s = setup();
  try {
    await s.connect();
    const client = s.clients[0],
      original = client.request;
    let resolve;
    client.request = (command, args) =>
      command === "object" && args.oid === oid(10)
        ? new Promise((r) => (resolve = r))
        : original(command, args);
    const previous = s.commands.get("jadeNative.inspectObject")(oid(10));
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    await s.commands.get("jadeNative.inspectObject")(oid(20));
    resolve({
      oid: oid(10),
      schema: "Pets",
      className: "OldFish",
      properties: [],
    });
    await previous;
    assert.equal(
      s.panels[0].messages.filter((m) => m.command === "object").at(-1).object
        .oid,
      oid(20),
    );
  } finally {
    await s.cleanup();
  }
});

test('legacy lookup inputs remain internal while history and Copy ID use the native response identity',async()=>{
 const s=setup(),legacy='A'.repeat(44),canonical='66.101.305.2.1';
 try{
  await s.connect();const client=s.clients[0],original=client.request;
  client.request=async(command,args)=>{const result=await original(command,args);return command==='object'?{...result,oid:canonical}:result;};
  const opened=await s.commands.get('jadeNative.inspectObject')(legacy);assert.equal(opened.oid,canonical);assert.equal(client.requests.find(request=>request.command==='object').args.oid,legacy,'Native parsing receives the unchanged legacy input.');
  assert.equal(s.controller.session.history.at(-1).oid,canonical,'History must not redisplay a transport alias.');
  await s.panels[0].receive({command:'copyOid'});assert.equal(s.copied.at(-1),canonical);assert.equal(s.panels[0].title,'Fish · '+canonical);
 }finally{await s.cleanup();}
});
