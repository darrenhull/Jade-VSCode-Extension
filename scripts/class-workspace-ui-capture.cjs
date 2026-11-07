"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { connectPrivateDebugger } = require("./creation-ui-capture.cjs");

/** Targets only the webview in the private, owned extension host. */
async function withClassWorkspace(port, action, { predicate = 'Boolean(document.getElementById("workspace") && document.getElementById("member-tree"))' } = {}) {
  const client = await connectPrivateDebugger(port);
  let pageSession, frameSession, frameContext;
  try {
    for (let attempt = 0; attempt < 100 && !frameSession; attempt++) {
      const { targetInfos } = await client.request("Target.getTargets");
      const page = targetInfos.find(target => target.type === "page" && target.url.startsWith("vscode-file://"));
      if (page && !pageSession) pageSession = (await client.request("Target.attachToTarget", { targetId: page.targetId, flatten: true })).sessionId;
      for (const frame of targetInfos.filter(target => target.type === "iframe" && /webview/i.test(target.url))) {
        const attached = await client.request("Target.attachToTarget", { targetId: frame.targetId, flatten: true });
        const contexts = [];
        const unsubscribe = client.onEvent(event => { if (event.sessionId === attached.sessionId && event.method === "Runtime.executionContextCreated") contexts.push(event.params.context.id); });
        await client.request("Runtime.enable", {}, attached.sessionId);
        unsubscribe();
        for (const contextId of contexts) {
          const found = await client.request("Runtime.evaluate", { expression: predicate, contextId, returnByValue: true }, attached.sessionId);
          if (found.result?.value) { frameSession = attached.sessionId; frameContext = contextId; break; }
        }
        if (frameSession) break;
        await client.request("Target.detachFromTarget", { sessionId: attached.sessionId });
      }
      if (!frameSession) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!frameSession || !pageSession) throw Error("The private class workspace did not become available.");
    return await action({
      async evaluate(expression) {
        const result = await client.request("Runtime.evaluate", { expression, contextId: frameContext, awaitPromise: true, returnByValue: true }, frameSession);
        if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result?.value;
      },
      async wait(expression, description) {
        for (let attempt = 0; attempt < 100; attempt++) {
          const result = await this.evaluate(expression);
          if (result) return result;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error("Private workspace timed out: " + description);
      },
      async key(key, code, modifiers = 0) {
        for (const type of ["keyDown", "keyUp"]) await client.request("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers }, frameSession);
      },
      async keyInWindow(key, code, modifiers = 0) {
        await client.request("Page.bringToFront", {}, pageSession);
        for (const type of ["keyDown", "keyUp"]) await client.request("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers, ...(key === "Enter" && type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}) }, pageSession);
      },
      async type(text) { await client.request("Input.insertText", { text }, frameSession); },
      async viewport(width, height = 900) {
        // The desired width is the product webview, excluding Code's sidebars.
        for (let attempt = 0; attempt < 20; attempt++) {
          const frameWidth = await this.evaluate("window.innerWidth");
          if (Math.abs(frameWidth - width) <= 1) return;
          const page = await client.request("Runtime.evaluate", { expression: "({width:window.innerWidth,scale:window.devicePixelRatio})", returnByValue: true }, pageSession);
          const pageWidth = Math.round((page.result.value.width + width - frameWidth) * page.result.value.scale);
          await client.request("Emulation.setDeviceMetricsOverride", { width: Math.max(width, pageWidth), height, deviceScaleFactor: 1, mobile: false }, pageSession);
          await new Promise(resolve => setTimeout(resolve, 120));
        }
        const actual = await this.evaluate("window.innerWidth");
        if (Math.abs(actual - width) > 1) throw Error("The private webview could not be sized to " + width + "px (actual " + actual + "px).");
      },
      async screenshot(destination) {
        const result = await client.request("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, pageSession);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, Buffer.from(result.data, "base64"));
        return destination;
      },
    });
  } finally { client.close(); }
}
module.exports = { withClassWorkspace };
