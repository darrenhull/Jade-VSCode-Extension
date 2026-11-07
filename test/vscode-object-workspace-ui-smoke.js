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
  const host = { ...vscode, window: Object.assign(Object.create(vscode.window), {
    createTreeView: (_name, options) => vscode.window.createTreeView("jade.testInspectionInstances", options),
    showQuickPick: async choices => choices.find(choice => choice.target === "source"),
  }), commands: { ...vscode.commands,
    registerCommand(name, callback) { commands.set(name, callback); const registration=vscode.commands.registerCommand(name,callback); return { dispose() { registration.dispose(); commands.delete(name); } }; },
    executeCommand(name, ...args) { return commands.has(name) ? Promise.resolve(commands.get(name)(...args)) : vscode.commands.executeCommand(name === "jadeNative.objects.focus" ? "jade.testInspectionInstances.focus" : name, ...args); },
  } };
  const inspector = registerObjectExplorer(host, context, {
    sourceContext: async () => ({available:true,file:path.join(workspace,"Fish.cls"),dirty:true}),
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
        if (command === "instances") {
          const offset = args.cursor ? 100 : 0;
          return {items:Array.from({length:100},(_,index)=>({oid:"9050."+(offset+index+1),className:"Fish",schema:"Pets",label:"Fish "+(offset+index+1)})),hasMore:!args.cursor,cursor:args.cursor?undefined:"instances-next"};
        }
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
    const instances = await inspector.browseInstances({schema:"Pets",className:"Fish",projectRoot:workspace});
    assert.equal(instances.available,true);
    const schemaNode = (await inspector.provider.getChildren()).find(row=>row.kind==="schema"&&row.name==="Pets");
    const classNode = (await inspector.provider.getChildren(schemaNode)).find(row=>row.kind==="class"&&row.name==="Fish");
    const instanceRows = await inspector.provider.getChildren(classNode);
    assert.equal(instanceRows.filter(row=>row.kind==="object").length,100);
    assert.ok(instanceRows.some(row=>row.command==="jadeNative.moreObjectInstances"));
    await vscode.commands.executeCommand("jadeNative.moreObjectInstances",classNode);
    assert.ok((await inspector.provider.getChildren(classNode)).some(row=>row.command==="jadeNative.firstObjectInstances"));
    await vscode.commands.executeCommand("jadeNative.firstObjectInstances",classNode);
    await vscode.commands.executeCommand("jadeNative.inspectObject","9050.1");
    const contrast = [];
    const evidence = await withClassWorkspace(Number(process.env.JADE_OBJECT_WORKSPACE_DEBUG_PORT), async browser => {
      await browser.wait('document.getElementById("identity").textContent.includes("9050.1")', "object snapshot");
      assert.equal(await browser.evaluate('document.getElementById("properties").children.length'), 37);
      for (const text of ['""', "false", "null", "0", "Unavailable:"]) assert.equal(await browser.evaluate('document.getElementById("properties").textContent.includes('+JSON.stringify(text)+')'), true);
      const instancesScreenshot = path.join(captures, "instances-tree.png");
      await browser.screenshot(instancesScreenshot);
      const objectScreenshot = path.join(captures, "object-snapshot.png");
      await browser.screenshot(objectScreenshot);
      await browser.evaluate('document.getElementById("properties-filter").value="children";document.getElementById("properties-filter").dispatchEvent(new Event("input"));window.focus();document.querySelector(".reference").focus()');
      await browser.keyInWindow("Enter", 13);
      await browser.wait('document.getElementById("title").textContent==="FishByName"', "keyboard reference opening");
      assert.equal(await browser.evaluate('document.getElementById("origin").textContent.includes("children")'), true);
      await browser.evaluate('document.getElementById("page-size").value="25";document.getElementById("page-size").dispatchEvent(new Event("change"))');
      await browser.wait('document.getElementById("entries").children.length===25', "collection page size");
      const collectionScreenshot = path.join(captures, "collection-page.png");
      await browser.screenshot(collectionScreenshot);
      await browser.viewport(360);
      assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true, "collection fits360px");
      assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("#entries td")).display'), "block");
      await browser.evaluate('document.getElementById("collection").scrollIntoView({block:"start"})');
      await browser.screenshot(path.join(captures, "collection-360.png"));
      await browser.evaluate("window.scrollTo(0,0)");
      await browser.viewport(760);
      await browser.evaluate('document.getElementById("entries-filter").value="Tank 1";document.getElementById("entries-filter").dispatchEvent(new Event("input"))');
      assert.equal(await browser.evaluate('document.getElementById("display-note").textContent.includes("this page only")'), true);
      await browser.evaluate('document.getElementById("clear-filter").click();document.getElementById("next").click()');
      await browser.wait('document.getElementById("page-status").textContent.includes("26–50")', "next native page");
      await browser.evaluate('document.getElementById("entries").closest(".table-wrap").scrollTop=150;window.focus();document.querySelectorAll("#entries .reference")[4].focus()');
      await browser.keyInWindow("Enter",13);
      await browser.wait('document.getElementById("title").textContent==="Fish"',"collection entry object");
      await browser.evaluate('document.getElementById("back").click()');
      await browser.wait('document.getElementById("title").textContent==="FishByName"',"collection snapshot Back");
      assert.equal(await browser.evaluate('document.getElementById("entries").closest(".table-wrap").scrollTop'),150);
      assert.equal(await browser.evaluate('document.getElementById("next").disabled'),true,"released cursor requires First restart");
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
          await browser.keyInWindow("Enter", 13);
          assert.equal(await browser.evaluate('document.getElementById("inspection-more").open'), true);
          await browser.evaluate('document.getElementById("inspection-more").open=false');
        }
        await browser.screenshot(path.join(captures, "object-" + width + ".png"));
      }
      async function checkContrast(kind) {
        const measured=await browser.evaluate(`(()=>{const rgb=value=>{const numbers=value.match(/[\\d.]+/g);return numbers.slice(0,3).map(Number);};const composite=(value,background)=>{const values=value.match(/[\\d.]+/g).map(Number),alpha=values[3]??1;return values.slice(0,3).map((channel,index)=>channel*alpha+(background?.[index]??0)*(1-alpha));};const luminance=value=>value.map(channel=>{channel/=255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;}).reduce((total,channel,index)=>total+channel*[.2126,.7152,.0722][index],0);const ratio=(first,second)=>{const background=composite(second,rgb(getComputedStyle(document.body).backgroundColor));const a=luminance(composite(first,background)),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};const body=getComputedStyle(document.body),button=document.getElementById("refresh");button.focus();const style=getComputedStyle(button);return {colors:{foreground:style.color,background:style.backgroundColor,body:body.color,bodyBackground:body.backgroundColor,outline:style.outlineColor,opacity:style.opacity},bodyText:ratio(body.color,body.backgroundColor),secondaryText:ratio(style.color,style.backgroundColor),descriptionText:ratio(getComputedStyle(document.getElementById("source-context")).color,body.backgroundColor),focusOutline:ratio(style.outlineColor,body.backgroundColor)};})()`);
        for(const key of ["bodyText","secondaryText","descriptionText"])assert.ok(measured[key]>=4.5,kind+" "+key+" contrast "+measured[key]+" "+JSON.stringify(measured.colors));
        assert.ok(measured.focusOutline>=3,kind+" focus outline contrast "+measured.focusOutline);
        contrast.push({kind,...measured});
      }
      await checkContrast("dark");
      for(const [theme,kind,filename] of [["Default Light Modern","vscode-light","object-light.png"],["Default High Contrast","vscode-high-contrast","object-high-contrast.png"]]) {
        await vscode.workspace.getConfiguration("workbench").update("colorTheme",theme,vscode.ConfigurationTarget.Global);
        await browser.wait('document.body.dataset.vscodeThemeKind==='+JSON.stringify(kind),"theme "+kind);
        await checkContrast(kind);
        await browser.screenshot(path.join(captures,filename));
      }
      await vscode.workspace.getConfiguration("workbench").update("colorTheme","Default Dark Modern",vscode.ConfigurationTarget.Global);
      await browser.wait('document.body.dataset.vscodeThemeKind==="vscode-dark"',"dark theme recovery");
      await vscode.workspace.getConfiguration("window").update("zoomLevel",Math.log(2)/Math.log(1.2),vscode.ConfigurationTarget.Global);
      await new Promise(resolve=>setTimeout(resolve,300));
      await browser.viewport(360);
      assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,"360CSSpx at200% zoom");
      await browser.screenshot(path.join(captures,"object-360-zoom200.png"));
      await vscode.workspace.getConfiguration("window").update("zoomLevel",0,vscode.ConfigurationTarget.Global);
      await new Promise(resolve=>setTimeout(resolve,100));
      await browser.viewport(360);
      await inspector.session.disconnect();
      await browser.wait('document.getElementById("status-label").textContent.includes("stale")', "stale snapshot");
      assert.equal(inspector.session.client,undefined);
      assert.match(inspector.view.message,/Disconnected/);
      for(let attempt=0;attempt<50;attempt++){if(!await browser.windowEvaluate('document.body.innerText.includes("Connected. Compile and test")'))break;await new Promise(resolve=>setTimeout(resolve,50));}
      assert.equal(await browser.windowEvaluate('document.body.innerText.includes("Connected. Compile and test")'),false,"sidebar must settle to disconnected before capture");
      assert.equal(await browser.evaluate('document.getElementById("properties").children.length'), 37);
      assert.equal(await browser.evaluate('document.getElementById("refresh").disabled'), true);
      assert.equal(await browser.evaluate('document.querySelector(".reference").disabled'), true);
      assert.equal(await browser.evaluate('document.getElementById("copyOid").disabled'), false);
      await browser.evaluate('document.getElementById("state").scrollIntoView({block:"start"})');
      await browser.screenshot(path.join(captures, "object-stale-360.png"));
      return { objectScreenshot, collectionScreenshot, instances:true, instancesPageBound:100,instanceNextAndReturnFirst:true, snapshotValues: true, lazyKeyboardReference: true, collectionPages: [25, 50], pageOnlyFilter: true, pin: true, snapshotHistory: true, internalCollectionScroll:true, themes:["light","dark","high-contrast"],zoomPercent:200, contrast, responsive: [760, 480, 360], staleRetained: true, transport: "deterministic-read-only-ui-fixture", nativeDatabaseOpened: false };
    }, { predicate: 'Boolean(document.getElementById("identity")?.textContent.includes("9050.1") && document.getElementById("properties"))' });
    assert.ok(requests.every(request => ["catalog", "instances", "object", "collection", "release"].includes(request.command)));
    assert.ok(requests.filter(request=>request.command==="instances").every(request=>request.args.limit===100));
    const artifact = process.env.JADE_OBJECT_WORKSPACE_VSIX ? { name: path.basename(process.env.JADE_OBJECT_WORKSPACE_VSIX), sha256: require("node:crypto").createHash("sha256").update(fs.readFileSync(process.env.JADE_OBJECT_WORKSPACE_VSIX)).digest("hex") } : undefined;
    fs.writeFileSync(report, JSON.stringify({ passed: true, artifact, ...evidence }, null, 2));
  } catch (error) {
    fs.writeFileSync(report, JSON.stringify({ passed: false, error: error.stack }, null, 2));
    throw error;
  } finally {
    for (const transport of transports) await transport.stop();
    for (const item of subscriptions.reverse()) item.dispose?.();
  }
}
module.exports = { run };
