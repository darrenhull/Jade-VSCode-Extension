"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events");
const { registerDebugger } = require("../extension/src/debugger");
function setup(open, overrides = {}) {
  let factory,
    busy = false;
  const changes = [],
    messages = [];
  class Emitter {
    constructor() {
      this.e = new EventEmitter();
      this.event = (fn) => {
        this.e.on("message", fn);
        return { dispose: () => this.e.off("message", fn) };
      };
    }
    fire(m) {
      this.e.emit("message", m);
    }
    dispose() {
      this.e.removeAllListeners();
    }
  }
  const disposable = { dispose() {} };
  const vscode = {
    EventEmitter: Emitter,
    DebugAdapterInlineImplementation: class {
      constructor(adapter) {
        this.adapter = adapter;
      }
    },
    window: {
      createOutputChannel: () => ({
        clear() {},
        show() {},
        clear() {},
        show() {},
        append() {},
        appendLine() {},
        dispose() {},
      }),
    },
    workspace: { openTextDocument: open },
    commands: { registerCommand: () => disposable },
    languages: { registerCodeLensProvider: () => disposable },
    debug: {
      registerDebugAdapterDescriptorFactory: (type, f) => {
        factory = f;
        return disposable;
      },
      registerDebugConfigurationProvider: () => disposable,
    },
  };
  registerDebugger(
    vscode,
    { subscriptions: [], ...overrides.context },
    {
      isBusy: () => busy,
      setBusy: async (value) => {
        busy = value;
        changes.push(value);
      },
      ...overrides.services,
    },
  );
  const adapter = factory.createDebugAdapterDescriptor().adapter;
  adapter.onDidSendMessage((m) => messages.push(m));
  return { adapter, messages, changes, busy: () => busy };
}

test('debug compilation delegates to the injected native CLI session without opening a legacy working base',async t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-debug-native-gateway-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text=fs.readFileSync(path.join(__dirname,'fixtures/DebugDemo.cls'),'utf8'),file=path.join(root,'DebugDemo.cls');fs.writeFileSync(file,text);
 const abi=path.join(root,'vendor/jade-tools-cli/native');fs.mkdirSync(abi,{recursive:true});fs.writeFileSync(path.join(abi,'debugger-abi.json'),JSON.stringify({libraries:{}}));
 const method=require('../extension/src/debug-source').debugMethods(text,file)[0];let compiled=0;
 const document={isDirty:false,uri:{fsPath:file,toString:()=>file},getText:()=>text};
 const s=setup(async()=>document,{context:{extensionPath:root},services:{config:()=>({installPath:root,databasePath:path.join(root,'absent-source'),iniPath:path.join(root,'absent.ini'),storagePath:path.join(root,'storage'),workspaceRoots:[root],program:file,files:[file]}),workingFiles:async()=>{},startWorking:()=>{compiled++;return {completion:Promise.resolve({passed:false,code:6026,report:{error:'Native CLI rejected the test fixture'}}),stop(){}};},prepareWorking:()=>{throw Error('Do not prepare after a compiler failure');}}});
 await s.adapter.handleMessage({seq:1,command:'launch',arguments:{program:file,method:method.name}});
 assert.equal(compiled,1);assert.match(s.messages.find(message=>message.request_seq===1).message,/Native CLI rejected/);s.adapter.dispose();
});
test("disconnect while a launch awaits a document cancels before save, compile or database work", async () => {
  let resolve,
    saves = 0;
  const pending = new Promise((r) => (resolve = r)),
    s = setup(() => pending);
  const launch = s.adapter.handleMessage({
    seq: 1,
    command: "launch",
    arguments: { program: "Thing.cls" },
  });
  await Promise.resolve();
  assert.equal(s.busy(), true);
  await s.adapter.handleMessage({ seq: 2, command: "disconnect" });
  resolve({
    isDirty: true,
    save: async () => {
      saves++;
      return true;
    },
  });
  await launch;
  assert.equal(saves, 0);
  assert.equal(s.busy(), false);
  assert.deepEqual(s.changes, [true, false]);
  assert.equal(s.messages.filter((m) => m.event === "terminated").length, 1);
  assert.match(
    s.messages.find((m) => m.request_seq === 1).message,
    /cancelled/,
  );
});
test("disposal is idempotent and releases a pending launch without further protocol events", async () => {
  let resolve;
  const s = setup(() => new Promise((r) => (resolve = r))),
    launch = s.adapter.handleMessage({
      seq: 1,
      command: "launch",
      arguments: { program: "Thing.cls" },
    });
  await Promise.resolve();
  s.adapter.dispose();
  s.adapter.dispose();
  resolve({});
  await launch;
  assert.equal(s.busy(), false);
  assert.deepEqual(s.changes, [true, false]);
  assert.equal(s.messages.length, 0);
});
test("invalid breakpoint positions and running evaluations return DAP errors", async () => {
  const s = setup();
  await s.adapter.handleMessage({
    seq: 1,
    command: "setBreakpoints",
    arguments: { source: { path: "Thing.cls" }, breakpoints: [{ line: 0 }] },
  });
  await s.adapter.handleMessage({
    seq: 2,
    command: "evaluate",
    arguments: { expression: "answer" },
  });
  assert.equal(s.messages.length, 2);
  assert.ok(
    s.messages.every((m) => m.type === "response" && m.success === false),
  );
  s.adapter.dispose();
});
test("cancellation keeps the session alive until the native build has stopped", async () => {
  const s = setup();
  let resolve,
    stops = 0;
  s.adapter.busy = true;
  s.adapter.operation = {
    stop: () => stops++,
    completion: new Promise((r) => (resolve = r)),
  };
  const stopping = s.adapter.handleMessage({ seq: 1, command: "terminate" });
  await Promise.resolve();
  assert.equal(stops, 1);
  assert.equal(
    s.messages.some((m) => m.event === "terminated"),
    false,
  );
  resolve({ passed: false, cancelled: true });
  await stopping;
  assert.equal(s.messages.filter((m) => m.event === "terminated").length, 1);
  s.adapter.dispose();
});
test("DAP exposes every native stack frame and routes locals/evaluation to the selected frame", async () => {
  const s = setup(),
    calls = [],
    source = "inner(n : Integer) : Integer;\nbegin\n return n;\nend;";
  s.adapter.models = [
    {
      schema: "Demo",
      owner: "Probe",
      name: "inner",
      line: 10,
      file: "Probe.cls",
      variables: ["n"],
    },
  ];
  s.adapter.native = {
    request: async (command, args) => {
      calls.push({ command, args });
      if (command === "stack")
        return {
          frames: [
            {
              schema: "Demo",
              owner: "Probe",
              method: "inner",
              source,
              position: source.indexOf("return"),
              level: 0,
            },
            {
              schema: "Demo",
              owner: "Probe",
              method: "outer",
              source: "outer();\nvars\n caller : Integer;\nbegin\nend;",
              position: null,
              level: 1,
            },
          ],
        };
      if (command === "variables")
        return {
          variables: [
            {
              name: args.names[0],
              value: "40",
              type: "Integer",
              variablesReference: 0,
            },
          ],
        };
      throw Error(command);
    },
    stop() {},
  };
  await s.adapter.nativeMessage({
    event: "stopped",
    method: {
      schema: "Demo",
      owner: "Probe",
      method: "inner",
      source,
      position: 0,
    },
  });
  await s.adapter.handleMessage({
    seq: 1,
    command: "stackTrace",
    arguments: { threadId: 1 },
  });
  const stack = s.messages.find((m) => m.request_seq === 1).body;
  assert.equal(stack.totalFrames, 2);
  assert.equal(stack.stackFrames[0].line, 12);
  assert.equal(stack.stackFrames[1].name, "Probe::outer");
  assert.equal(stack.stackFrames[1].line, 0);
  assert.equal(stack.stackFrames[1].column, 0);
  await s.adapter.handleMessage({
    seq: 2,
    command: "scopes",
    arguments: { frameId: stack.stackFrames[1].id },
  });
  const reference = s.messages.find((m) => m.request_seq === 2).body.scopes[0]
    .variablesReference;
  await s.adapter.handleMessage({
    seq: 3,
    command: "variables",
    arguments: { variablesReference: reference },
  });
  assert.equal(calls.at(-1).args.level, 1);
  assert.ok(calls.at(-1).args.names.includes("caller"));
  await s.adapter.handleMessage({
    seq: 4,
    command: "evaluate",
    arguments: { frameId: stack.stackFrames[1].id, expression: "caller" },
  });
  assert.equal(calls.at(-1).args.level, 1);
  const nativeSource = stack.stackFrames[1].source.sourceReference;
  assert.ok(nativeSource > 0);
  await s.adapter.handleMessage({
    seq: 5,
    command: "source",
    arguments: { sourceReference: nativeSource },
  });
  assert.match(
    s.messages.find((m) => m.request_seq === 5).body.content,
    /outer/,
  );
  s.adapter.dispose();
});
test("DAP preserves child variable references and expands them rather than refetching locals", async () => {
  const s = setup(),
    calls = [];
  s.adapter.paused = true;
  s.adapter.frame = { variables: ["item"] };
  s.adapter.frames = [{ id: 1, level: 0, variables: ["item"] }];
  s.adapter.native = {
    request: async (command, args) => {
      calls.push({ command, args });
      return {
        variables: [
          {
            name: "name",
            value: "Bubbles",
            type: "String",
            variablesReference: 0,
          },
        ],
      };
    },
    stop() {},
  };
  s.adapter.variableHandles = new Map([[42, { nativeReference: 9 }]]);
  await s.adapter.handleMessage({
    seq: 1,
    command: "variables",
    arguments: { variablesReference: 42, start: 0, count: 25 },
  });
  assert.equal(calls[0].command, "expand");
  assert.equal(calls[0].args.reference, 9);
  assert.equal(s.messages[0].body.variables[0].value, "Bubbles");
  s.adapter.dispose();
});

test("object handles are invalidated on step and cannot alias a new paused object", async () => {
  const s = setup();
  s.adapter.paused = true;
  s.adapter.frame = {};
  s.adapter.frames = [{ id: 1, level: 0, variables: [] }];
  const old = s.adapter.mapVariables([
    { name: "self", value: "first", variablesReference: 1 },
  ])[0].variablesReference;
  s.adapter.native = { request: async () => ({}), stop() {} };
  await s.adapter.handleMessage({
    seq: 1,
    command: "next",
    arguments: { threadId: 1 },
  });
  assert.equal(s.adapter.variableHandles.has(old), false);
  s.adapter.paused = true;
  const fresh = s.adapter.mapVariables([
    { name: "self", value: "second", variablesReference: 1 },
  ])[0].variablesReference;
  assert.notEqual(old, fresh);
  await s.adapter.handleMessage({
    seq: 2,
    command: "variables",
    arguments: { variablesReference: old },
  });
  assert.equal(s.messages.find((m) => m.request_seq === 2).success, false);
  s.adapter.dispose();
});

test("application ready resolves its configured initializer source instead of the context CLS", async () => {
  const s = setup();
  s.adapter.applicationMode = true;
  s.adapter.selected = { file: "Context.cls" };
  s.adapter.models = [
    {
      schema: "Demo",
      owner: "DemoApp",
      name: "start",
      file: "App.cls",
      line: 20,
      variables: ["value"],
    },
  ];
  s.adapter.native = { request: async () => ({ positions: [] }), stop() {} };
  await s.adapter.nativeMessage({
    event: "ready",
    method: {
      schema: "Demo",
      owner: "DemoApp",
      method: "start",
      source: "start(value:String);\nbegin\nend;",
    },
  });
  assert.equal(s.adapter.selected.file, "App.cls");
  assert.equal(s.adapter.selected.name, "start");
  s.adapter.dispose();
});

test("native-only source snapshots keep their leading blank lines and empty sources", async () => {
  const s = setup(),
    source = "\nstart();\nbegin\n return;\nend;";
  s.adapter.native = {
    request: async () => ({
      frames: [
        {
          schema: "Demo",
          owner: "App",
          method: "start",
          source,
          position: source.indexOf("return"),
          level: 0,
        },
        {
          schema: "Demo",
          owner: "Root",
          method: "external",
          source: "",
          position: null,
          level: 1,
        },
      ],
    }),
    stop() {},
  };
  await s.adapter.nativeMessage({
    event: "stopped",
    method: { source: "unrelated()" },
  });
  await s.adapter.handleMessage({
    seq: 1,
    command: "stackTrace",
    arguments: { threadId: 1 },
  });
  const stack = s.messages.find((m) => m.request_seq === 1).body.stackFrames;
  assert.equal(stack[0].line, 4);
  await s.adapter.handleMessage({
    seq: 2,
    command: "source",
    arguments: { sourceReference: stack[1].source.sourceReference },
  });
  assert.equal(s.messages.find((m) => m.request_seq === 2).body.content, "");
  s.adapter.dispose();
});

test("ready cleanup tolerates a temporary file lock and retries on finish", async () => {
  const fs = require("node:fs"),
    original = fs.unlinkSync,
    s = setup();
  let attempts = 0;
  s.adapter.sessionFile = "locked-session.json";
  s.adapter.native = {
    request: async () => ({ positions: [] }),
    stop() {
      throw Error("Cleanup must not stop native execution");
    },
  };
  fs.unlinkSync = () => {
    if (++attempts === 1)
      throw Object.assign(Error("temporarily locked"), { code: "EBUSY" });
  };
  try {
    await s.adapter.nativeMessage({
      event: "ready",
      method: { source: "start();\nbegin\nend;" },
    });
    assert.equal(s.adapter.nativeSource, "start();\nbegin\nend;");
    assert.equal(s.adapter.sessionFile, "locked-session.json");
    await s.adapter.finish();
    assert.equal(attempts, 2);
    assert.equal(s.adapter.sessionFile, undefined);
  } finally {
    fs.unlinkSync = original;
    s.adapter.native = undefined;
    s.adapter.dispose();
  }
});
