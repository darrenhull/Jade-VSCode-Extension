"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { EventEmitter } = require("node:events");
const vscode = require("vscode");
const { registerObjectExplorer } = require("../src/object-explorer");
const { withClassWorkspace } = require("./class-workspace-ui-capture.cjs");

/** Real product controller/webview; deterministic read-only transport, no native database. */
async function run() {
  const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const report = path.resolve(workspace, "../host-report.json"), commands = new Map(), subscriptions = [];
  const captures = process.env.JADE_OBJECT_WORKSPACE_SCREENSHOTS;
  const context = { extensionPath: path.resolve(__dirname, ".."), globalStorageUri: vscode.Uri.file(path.resolve(workspace, "../inspection-private")), subscriptions };
  const config = { installPath: "C:/NotOpened", databasePath: path.resolve(workspace, "../fixture-source"), iniPath: path.resolve(workspace, "../fixture.ini"), server: "singleUser", schema: "Pets", workspaceRoots: [workspace] };
  const requests = [], transports = [];
  const host = { ...vscode, commands: { ...vscode.commands,
    registerCommand(name, callback) { commands.set(name, callback); return { dispose() { commands.delete(name); } }; },
    executeCommand(name, ...args) { return commands.has(name) ? Promise.resolve(commands.get(name)(...args)) : vscode.commands.executeCommand(name, ...args); },
  } };
  const inspector = registerObjectExplorer(host, context, {
    config: () => config, isBusy: () => false, setBusy: async () => {},
    inspectionTarget: async (_config, selection) => ({ ...config, selection, readOnly: true }),
    workingLocation: async () => ({ databasePath: config.databasePath }),
    createTransport() {
      const transport = new EventEmitter();
      transport.ready = Promise.resolve({ readOnly: true });
      transport.closed = new Promise(resolve => { transport.stop = () => { transport.emit("close", 0); resolve(); return transport.closed; }; });
      transport.request = async (command, args) => {
        requests.push({ command, args });
        if (command === "catalog") return { schemas: [{ name: "Pets", oid: "9050.0", classes: [{ name: "Fish", schema: "Pets", oid: "9050.0" }] }] };
        if (command === "object") {
          if (args.oid === "9051.1") return { oid: args.oid, schema: "Pets", className: "FishByName", collection: true, properties: [] };
          return { oid: args.oid, schema: "Pets", className: "Fish", collection: false, properties: [
            { name: "name", type: "String", value: args.oid === "9050.2" ? "Goldie" : "Bubbles" },
            { name: "lengthCm", type: "Integer", value: 0 }, { name: "freshwater", type: "Boolean", value: false },
            { name: "notes", type: "String", value: "" }, { name: "dateOfBirth", type: "Date", value: null },
            { name: "children", type: "FishByName", oid: "9051.1" }, { name: "restricted", type: "String", error: "Unavailable in this read-only snapshot" },
            ...Array.from({ length: 30 }, (_, index) => ({ name: "detail" + index, type: "String", value: "Stored value " + index })),
          ] };
        }
        if (command === "collection") {
          const start = args.cursor ? Number(args.cursor.split(":")[1]) : 0;
          const count = Math.min(args.limit, 75 - start);
          return { items: Array.from({ length: Math.max(0, count) }, (_, index) => ({ key: "Tank " + (start + index + 1), index: start + index + 1, type: "Fish", oid: index % 2 ? "9050.1" : "9050.2" })), hasMore: start + count < 75, cursor: start + count < 75 ? "page:" + (start + count) : undefined };
        }
        return { readOnly: true };
      };
      transports.push(transport);
      return transport;
    },
  });
  try {
    await inspector.session.select("source");
    await commands.get("jadeNative.connectObjects")();
    await commands.get("jadeNative.inspectObject")("9050.1");
    const evidence = await withClassWorkspace(Number(process.env.JADE_OBJECT_WORKSPACE_DEBUG_PORT), async browser => {
      await browser.wait('document.getElementById("identity").textContent.includes("9050.1")', "object snapshot");
      assert.equal(await browser.evaluate('document.getElementById("properties").children.length'), 37);
      for (const text of ['""', "false", "null", "0", "Unavailable:"]) assert.equal(await browser.evaluate('document.getElementById("properties").textContent.includes('+JSON.stringify(text)+')'), true);
      const objectScreenshot = path.join(captures, "object-snapshot.png");
      await browser.screenshot(objectScreenshot);
      await browser.evaluate('document.getElementById("properties-filter").value="children";document.getElementById("properties-filter").dispatchEvent(new Event("input"));document.querySelector(".reference").focus()');
      await browser.key("Enter", 13);
      await browser.wait('document.getElementById("title").textContent==="FishByName"', "keyboard reference opening");
      assert.equal(await browser.evaluate('document.getElementById("origin").textContent.includes("children")'), true);
      await browser.evaluate('document.getElementById("page-size").value="25";document.getElementById("page-size").dispatchEvent(new Event("change"))');
      await browser.wait('document.getElementById("entries").children.length===25', "collection page size");
      const collectionScreenshot = path.join(captures, "collection-page.png");
      await browser.screenshot(collectionScreenshot);
      await browser.evaluate('document.getElementById("entries-filter").value="Tank 1";document.getElementById("entries-filter").dispatchEvent(new Event("input"))');
      assert.equal(await browser.evaluate('document.getElementById("display-note").textContent.includes("this page only")'), true);
      await browser.evaluate('document.getElementById("clear-filter").click();document.getElementById("next").click()');
      await browser.wait('document.getElementById("page-status").textContent.includes("26–50")', "next native page");
      await browser.evaluate('document.getElementById("pin").click()');
      await browser.wait('document.getElementById("pin").getAttribute("aria-pressed")==="true"', "pinned snapshot");
      await browser.screenshot(path.join(captures, "collection-pinned.png"));
      await browser.evaluate('document.getElementById("pin").click();document.getElementById("back").click()');
      await browser.wait('document.getElementById("title").textContent==="Fish"', "retained history snapshot");
      assert.equal(await browser.evaluate('document.getElementById("properties-filter").value'), "children");
      await browser.evaluate('document.getElementById("properties-filter").value="";document.getElementById("properties-filter").dispatchEvent(new Event("input"))');
      for (const width of [760, 480, 360]) {
        await browser.viewport(width);
        assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true, "no overflow at " + width);
        if (width <= 480) {
          assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("#object-properties td")).display'), "block");
          await browser.evaluate('document.querySelector("#inspection-more summary").focus()');
          await browser.key("Enter", 13);
          assert.equal(await browser.evaluate('document.getElementById("inspection-more").open'), true);
          await browser.evaluate('document.getElementById("inspection-more").open=false');
        }
        await browser.screenshot(path.join(captures, "object-" + width + ".png"));
      }
      await inspector.session.disconnect();
      await browser.wait('document.getElementById("status-label").textContent.includes("stale")', "stale snapshot");
      assert.equal(await browser.evaluate('document.getElementById("properties").children.length'), 37);
      assert.equal(await browser.evaluate('document.getElementById("refresh").disabled'), true);
      assert.equal(await browser.evaluate('document.querySelector(".reference").disabled'), true);
      assert.equal(await browser.evaluate('document.getElementById("copyOid").disabled'), false);
      await browser.screenshot(path.join(captures, "object-stale-360.png"));
      return { objectScreenshot, collectionScreenshot, snapshotValues: true, lazyKeyboardReference: true, collectionPages: [25, 50], pageOnlyFilter: true, pin: true, snapshotHistory: true, responsive: [760, 480, 360], staleRetained: true, transport: "deterministic-read-only-ui-fixture", nativeDatabaseOpened: false };
    }, { predicate: 'Boolean(document.getElementById("identity")?.textContent.includes("9050.1") && document.getElementById("properties"))' });
    assert.ok(requests.every(request => ["catalog", "object", "collection", "release"].includes(request.command)));
    fs.writeFileSync(report, JSON.stringify({ passed: true, ...evidence }, null, 2));
  } catch (error) {
    fs.writeFileSync(report, JSON.stringify({ passed: false, error: error.stack }, null, 2));
    throw error;
  } finally {
    for (const transport of transports) await transport.stop();
    for (const item of subscriptions.reverse()) item.dispose?.();
  }
}
module.exports = { run };
