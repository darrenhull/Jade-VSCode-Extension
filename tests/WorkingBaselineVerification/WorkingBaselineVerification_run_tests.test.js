"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { registerWorkingBaselineVerification } = require("../../extension/src/working-baseline-verification");

const verified = () => ({ passed: true, code: 0, workingBaseline: {
  status: "verified", origin: "same-generation-native-extraction", scope: "all",
  identity: "opaque-native-binding", nativeCompilationVerified: false,
} });
function fixture(options = {}) {
  const calls = [], messages = [], commands = new Map(), subscriptions = [];
  const folder = { name: "Example", uri: { scheme: "file", fsPath: "C:/example" } };
  const config = { databasePath: "C:/source", iniPath: "C:/source/source.ini", workspaceRoots: [folder.uri.fsPath], user: "", password: "", workingJadeGitPolicy: "disabled" };
  let cancel, resolve, active, closed = false;
  const token = { isCancellationRequested: !!options.preCancelled, onCancellationRequested(fn) { cancel = fn; return { dispose() { calls.push("cancelSubscriptionDisposed"); } }; } };
  const output = { append: text => calls.push(["output", text]), appendLine: text => calls.push(["log", text]), show() {}, dispose() {} };
  const client = {
    async sourceCapabilities(value) { calls.push(["capabilities", value]); return { sourceExtraction: { workingBaseline: { format: 1, modes: options.unsupported ? ["fresh"] : ["fresh", "verify"] } } }; },
    async workingJadeGitCapability() { return { format: 1, configuration: "workingJadeGitPolicy", values: ["inherit", "disabled"], default: "inherit", scope: "owned-working-only", reversible: true }; },
    async workingLocation(value) { calls.push(["location", value]); return { databasePath: "C:/private/working/system" }; },
    startWorkingBaselineVerification(value, selection, callbacks) {
      calls.push(["verify", value, selection, callbacks]);
      active = { completion: options.deferred ? new Promise(r => { resolve = r; }) : Promise.resolve(options.result || verified()), stop() { calls.push("stop"); } };
      return active;
    },
    startSourceExtraction() { throw Error("Source export forbidden"); },
    startWorkingSync() { throw Error("Fresh generation forbidden"); },
    prepareDatabase() { throw Error("Backup forbidden"); },
    connectWorking() { throw Error("Connect forbidden"); },
  };
  const vscode = {
    ProgressLocation: { Notification: 15 },
    commands: { registerCommand(name, handler) { commands.set(name, handler); return { dispose() {} }; } },
    workspace: {
      get workspaceFolders() { return closed ? [] : [folder]; },
      getWorkspaceFolder: () => closed ? undefined : folder,
      fs: { writeFile() { throw Error("Workspace write forbidden"); } },
    },
    window: {
      createOutputChannel: () => output,
      async showQuickPick(items) { return items[0]; },
      async showWarningMessage(message, detail) { messages.push([message, detail]); if (options.changeSettings) config.iniPath = "C:/changed.ini"; if (options.closeDuringReview) closed = true; return options.decline ? undefined : "Verify Working"; },
      async showInformationMessage(message) { messages.push(message); },
      async showErrorMessage(message) { messages.push(message); },
      withProgress: (_options, fn) => fn({ report: value => calls.push(["progress", value]) }, token),
    },
  };
  const api = registerWorkingBaselineVerification(vscode, { subscriptions }, {
    client, configFor: () => config,
    async beforeOperation() { calls.push("claim"); return "owned-lease"; },
    async afterOperation(lease) { assert.equal(lease, "owned-lease"); calls.push("release"); if (options.cleanupFailure) throw Error("Context release failed"); },
  });
  return { api, config, calls, messages, commands, subscriptions,
    cancel: () => cancel?.(), resolve: value => resolve(value), closeFolder: () => { closed = true; } };
}
const started = f => f.calls.filter(c => Array.isArray(c) && c[0] === "verify");
async function untilStarted(f) { for (let n = 0; n < 30 && !started(f).length; n++) await new Promise(setImmediate); assert.equal(started(f).length, 1); }

test("palette action verifies existing Working without workspace promotion or index callbacks", async () => {
  const f = fixture();
  const result = await f.commands.get("jadeNative.verifyWorkingSourceBaseline")();
  assert.deepEqual(result, verified());
  const [, config, selection, callbacks] = started(f)[0];
  assert.deepEqual(config, f.config);
  assert.equal(config.user, ""); assert.equal(config.password, "");
  assert.deepEqual(selection, { destination: "C:/example", cwd: "C:/example", scope: "all" });
  assert.equal(callbacks.onFile, undefined);
  assert.equal(callbacks.onPermit, undefined, "native-private terminal promotion needs no client write permission");
  assert.equal(f.calls.filter(c => c === "claim").length, 1);
  assert.equal(f.calls.filter(c => c === "release").length, 1);
  assert.match(f.messages[0][1].detail, /C:\/private\/working\/system/);
  assert.match(f.messages[0][1].detail, /saved workspace files/);
  assert.match(f.messages[0][1].detail, /stay intact/);
  assert.match(f.messages.at(-1), /not compilation/i);
});

test("old CLI refuses clearly without starting verification", async () => {
  const f = fixture({ unsupported: true });
  const result = await f.api.verify();
  assert.equal(result.passed, false);
  assert.match(result.error, /update.*Jade CLI/i);
  assert.equal(started(f).length, 0);
  assert.equal(f.calls.includes("claim"), false);
});

for (const option of ["decline", "preCancelled"]) test(option + " starts no export or database operation", async () => {
  const f = fixture({ [option]: true });
  const result = await f.api.verify();
  assert.equal(result.cancelled, true);
  assert.equal(started(f).length, 0);
});

test("cancellation drains native result and keeps the lease until completion", async () => {
  const f = fixture({ deferred: true });
  const pending = f.api.verify(); await untilStarted(f); f.cancel();
  assert.equal(f.calls.includes("stop"), true);
  assert.equal(f.calls.includes("release"), false);
  const result = { passed: false, code: 130, status: "cancelled", report: { error: "Native verification cancelled" } };
  f.resolve(result); assert.deepEqual(await pending, result);
  assert.equal(f.calls.filter(c => c === "release").length, 1);
});

test("late cancellation refusal cannot replace committed native verification", async () => {
  const f = fixture({ deferred: true });
  const pending = f.api.verify(); await untilStarted(f); f.cancel(); f.resolve(verified());
  assert.deepEqual(await pending, verified());
});

test("native failure stays authoritative and repeat action does not retry automatically", async () => {
  const failed = { passed: false, code: 6295, report: { error: "Original native failure" } };
  const f = fixture({ result: failed });
  assert.deepEqual(await f.api.verify(), failed);
  assert.equal(started(f).length, 1);
  assert.equal(f.calls.filter(c => c === "release").length, 1);
});

test("dispose stops only the active verification and prevents a new operation", async () => {
  const f = fixture({ deferred: true });
  const pending = f.api.verify(); await untilStarted(f);
  f.api.dispose(); assert.equal(f.calls.includes("stop"), true);
  f.resolve({ passed: false, code: 130, status: "cancelled" }); await pending;
  await f.api.verify(); assert.equal(started(f).length, 1);
});

test("registration uses selected project settings and shared operation guard", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../extension/src/extension.js"), "utf8");
  const start = source.indexOf("  const baselineVerification=");
  assert.ok(start >= 0, "activation must register the command");
  const end = source.indexOf("  const workspaces=", start);
  let registration;
  const folder = { name: "Selected" }, config = { user: "", password: "" }, client = {};
  const guardCalls = [];
  vm.runInNewContext(source.slice(start, end), {
    require: name => { assert.equal(name, "./working-baseline-verification"); return { registerWorkingBaselineVerification(_v, _c, services) { registration = services; } }; },
    vscode: {}, context: {}, nativeTests: client,
    inspectionConfig: (selection, selected) => { assert.equal(selection, undefined); assert.equal(selected, folder); return config; },
    workspaceOperationGuard: { acquire: () => guardCalls.push("acquire"), release: lease => guardCalls.push(lease) },
  });
  assert.equal(registration.client, client);
  assert.equal(registration.configFor(folder), config);
  registration.beforeOperation(); registration.afterOperation("lease");
  assert.deepEqual(guardCalls, ["acquire", "lease"]);
  const manifest = require("../../extension/package.json");
  assert.deepEqual(manifest.contributes.commands.find(c => c.command === "jadeNative.verifyWorkingSourceBaseline"), {
    command: "jadeNative.verifyWorkingSourceBaseline", title: "Verify Working Source Baseline", category: "Jade",
  });
});

for (const option of ["changeSettings", "closeDuringReview"]) test(option + " refuses the stale reviewed target", async () => {
  const f = fixture({ [option]: true });
  const result = await f.api.verify();
  assert.equal(result.passed, false);
  assert.match(result.error, /settings changed|project closed/i);
  assert.equal(started(f).length, 0);
});

test("guard cleanup failure keeps the original native failure code and result", async () => {
  const original = { passed: false, code: 6295, report: { error: "Original native failure" } };
  const f = fixture({ result: original, cleanupFailure: true });
  const result = await f.api.verify();
  assert.equal(result.code, 6295);
  assert.deepEqual(result.report, original.report);
  assert.equal(result.cleanupError, "Context release failed");
  assert.equal(started(f).length, 1);
});

test("repeated invocation joins the one active verification without a second start", async () => {
  const f = fixture({ deferred: true });
  const first = f.api.verify(); await untilStarted(f);
  const second = f.api.verify(); assert.equal(first, second);
  f.resolve(verified()); await second;
  assert.equal(started(f).length, 1);
});
