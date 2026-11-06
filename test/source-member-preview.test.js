"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  {
    createSourceMemberPreviews,
  } = require("../extension/src/source-member-preview");
function text(schema = "Pets", name = "Fish", value = "one") {
  return `schemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${name} subclassOf Object transient;\ntypeDefinitions\n${name} completeDefinition\n(\nattributeDefinitions\nname: String[50];\njadeMethodDefinitions\ngetName() : String;\n)\ntypeSources\n${name} (\njadeMethodSources\ngetName\n{\ngetName() : String;\nbegin\nreturn "${value}";\nend;\n}\n)`;
}
function setup({ onOriginal } = {}) {
  const panels = [],
    original = [],
    files = new Map([
      ["first", text()],
      ["second", text("Other", "Fish", "two")],
    ]);
  let reads = 0,
    read = async (file) => {
      reads++;
      return { text: files.get(file) };
    };
  const vscode = {
    ViewColumn: { Active: 1 },
    Uri: { file: (file) => ({ fsPath: file, toString: () => file }) },
    window: {
      createWebviewPanel: (type, title, column) => {
        let receive, dispose, state;
        const panel = {
          type,
          title,
          column,
          active: true,
          messages: [],
          webview: {
            cspSource: "vscode:",
            asWebviewUri: (u) => u,
            onDidReceiveMessage: (fn) => {
              receive = fn;
              queueMicrotask(() => fn({ command: "ready" }));
              return { dispose() {} };
            },
            postMessage: async (message) => {
              panel.messages.push(message);
              if (message.command === "member")
                queueMicrotask(() =>
                  receive({ command: "rendered", revision: message.revision }),
                );
              return true;
            },
          },
          onDidDispose: (fn) => (dispose = fn),
          onDidChangeViewState: (fn) => {
            state = fn;
            return { dispose() {} };
          },
          reveal() {
            panel.active = true;
            state?.({ webviewPanel: panel });
          },
          dispose() {
            panel.active = false;
            dispose?.();
          },
          receive: (message) => receive(message),
        };
        panels.push(panel);
        return panel;
      },
    },
  };
  const controller = createSourceMemberPreviews(
    vscode,
    { extensionPath: "/extension" },
    {
      readSource: (file) => read(file),
      onOriginal: onOriginal || ((row) => original.push(row)),
    },
  );
  return {
    controller,
    panels,
    files,
    original,
    get reads() {
      return reads;
    },
    setRead: (fn) => (read = fn),
  };
}
const method = {
    schema: "Pets",
    owner: "Fish",
    file: "first",
    name: "getName",
    kind: "method",
  },
  property = { ...method, name: "name", kind: "property" };
test("members of one schema-qualified class share one active-column panel and repeated clicks only reveal", async () => {
  const s = setup();
  try {
    await s.controller.open(method);
    const record = s.controller.records.get("Pets::Fish");
    assert.equal(record.panel.type, "jadeSourceMember");
    assert.equal(record.panel.column, 1);
    assert.equal(record.panel.title, "Pets::Fish");
    assert.match(record.content.text, /return "one"/);
    assert.doesNotMatch(record.content.text, /typeHeaders/);
    await s.controller.open(property);
    assert.equal(s.panels.length, 1);
    assert.match(record.content.text, /name:\s*String/);
    assert.doesNotMatch(record.content.text, /return/);
    const reads = s.reads;
    await s.controller.open(property);
    assert.equal(s.reads, reads);
  } finally {
    s.controller.dispose();
  }
});
test("same short class names in different schemas stay in separate tabs and interleaved edits refresh only their own panels", async () => {
  const s = setup();
  try {
    await s.controller.open(method);
    await s.controller.open({ ...method, schema: "Other", file: "second" });
    assert.equal(s.panels.length, 2);
    s.files.set("first", text("Pets", "Fish", "edited one"));
    s.files.set("second", text("Other", "Fish", "edited two"));
    await s.controller.refresh(["first", "second"]);
    assert.match(
      s.controller.records.get("Pets::Fish").content.text,
      /edited one/,
    );
    assert.match(
      s.controller.records.get("Other::Fish").content.text,
      /edited two/,
    );
    await s.controller.open(property);
    assert.match(
      s.controller.records.get("Other::Fish").content.text,
      /edited two/,
    );
    s.controller.records
      .get("Other::Fish")
      .panel.receive({ command: "openOriginal" });
    await Promise.resolve();
    assert.equal(s.original.at(-1).schema, "Other");
  } finally {
    s.controller.dispose();
  }
});
test("late method reads cannot replace a newer property selection and closing cancels pending work", async () => {
  const s = setup();
  try {
    let finish;
    s.setRead(
      (file) =>
        new Promise(
          (resolve) => (finish = () => resolve({ text: s.files.get(file) })),
        ),
    );
    const old = s.controller.open(method);
    await Promise.resolve();
    s.setRead(async (file) => ({ text: s.files.get(file) }));
    await s.controller.open(property);
    finish();
    await old;
    assert.equal(s.controller.records.get("Pets::Fish").row.name, "name");
    assert.doesNotMatch(
      s.controller.records.get("Pets::Fish").content.text,
      /return/,
    );
    s.panels[0].dispose();
    assert.equal(s.controller.records.size, 0);
    await s.controller.open(method);
    assert.equal(s.panels.length, 2);
    assert.match(s.controller.records.get("Pets::Fish").content.text, /return/);
  } finally {
    s.controller.dispose();
  }
});
test("source read failures show a focused unavailable message rather than leaving an empty loading panel", async () => {
  const s = setup();
  try {
    s.setRead(async () => {
      throw Error("File no longer exists");
    });
    await s.controller.open(method);
    const record = s.controller.records.get("Pets::Fish");
    assert.equal(record.content.missing, true);
    assert.match(record.content.text, /File no longer exists/);
    assert.equal(record.lastRenderedRevision, record.revision);
  } finally {
    s.controller.dispose();
  }
});
test("opening unavailable original source reports the error without losing the focused preview", async () => {
  const s = setup({ onOriginal: async () => { throw Error("File no longer exists"); } });
  try {
    await s.controller.open(method);
    const record = s.controller.records.get("Pets::Fish"), content = record.content;
    record.panel.receive({ command: "openOriginal" });
    await new Promise(setImmediate);
    const message = record.panel.messages.at(-1);
    assert.equal(message.command, "error");
    assert.equal(message.revision, record.revision);
    assert.match(message.message, /Could not open original source: File no longer exists/);
    assert.equal(s.controller.records.get("Pets::Fish"), record);
    assert.equal(record.content, content);
  } finally {
    s.controller.dispose();
  }
});
test("preview displays navigation errors only for the currently rendered member", () => {
  const nodes = new Map(), sent = [];
  let receive;
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: "", replaceChildren() {}, append() {} });
    return nodes.get(id);
  };
  require("node:vm").runInNewContext(
    require("node:fs").readFileSync(require.resolve("../extension/media/source-member.js"), "utf8"),
    {
      acquireVsCodeApi: () => ({ postMessage: (message) => sent.push(message) }),
      document: { getElementById: node, createElement: () => ({}) },
      window: { addEventListener: (_, listener) => { receive = listener; } },
    },
  );
  const member = { schema: "Pets", owner: "Fish", member: "getName", kind: "method", file: "first", text: "return name;" };
  receive({ data: { command: "member", revision: 2, content: member } });
  receive({ data: { command: "error", revision: 1, message: "Old member error" } });
  assert.doesNotMatch(node("status").textContent, /Old member/);
  receive({ data: { command: "error", revision: 2, message: "Original file missing" } });
  assert.equal(node("status").textContent, "Original file missing");
  assert.equal(node("member-name").textContent, "getName");
  receive({ data: { command: "member", revision: 3, content: member } });
  assert.match(node("status").textContent, /Read-only preview/);
});
test("closing a panel during a pending source read cannot change its reopened replacement", async () => {
  const s = setup();
  try {
    let finish;
    s.setRead(
      (file) =>
        new Promise(
          (resolve) => (finish = () => resolve({ text: s.files.get(file) })),
        ),
    );
    const old = s.controller.open(method);
    await Promise.resolve();
    s.panels[0].dispose();
    s.setRead(async (file) => ({ text: s.files.get(file) }));
    await s.controller.open(property);
    finish();
    await old;
    assert.equal(s.controller.records.size, 1);
    assert.equal(s.controller.records.get("Pets::Fish").row.name, "name");
    assert.doesNotMatch(
      s.controller.records.get("Pets::Fish").content.text,
      /return/,
    );
  } finally {
    s.controller.dispose();
  }
});
