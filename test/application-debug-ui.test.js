"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  applicationCatalog,
  registerApplicationDebug,
} = require("../extension/src/application-debug-ui");
function entry(schema, name, type = "S", startup = "start") {
  return {
    file: `/${schema}.ddx`,
    extension: ".ddx",
    text: `<schema name="${schema}"><Application name="${name}"><applicationType>${type}</applicationType><initializeMethod>${startup}</initializeMethod></Application></schema>`,
  };
}
test("application choices come only from native DDX Application declarations and preserve schema identity", () => {
  const records = applicationCatalog({
    entries: [
      entry("One", "Runner"),
      entry("Two", "Runner"),
      { extension: ".cls", text: "Runner subclassOf Application;" },
    ],
  });
  assert.deepEqual(
    records.map((r) => r.schema + "::" + r.name),
    ["One::Runner", "Two::Runner"],
  );
  assert.equal(records[0].startup, "start");
  assert.equal(records[0].type, "S");
  assert.throws(
    () =>
      applicationCatalog({
        entries: [
          entry("One", "Runner"),
          entry("One", "Runner", "N", "different"),
        ],
      }),
    /Conflicting/,
  );
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-app-ui-"));
  for (const schema of ["One", "Two"]) {
    fs.mkdirSync(path.join(root, schema));
    fs.writeFileSync(
      path.join(root, schema + ".scm"),
      `jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema completeDefinition;`,
    );
    fs.writeFileSync(
      path.join(root, schema, "Context.cls"),
      `jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\nContext subclassOf Object;\ntypeDefinitions\nContext completeDefinition\n()\ntypeSources`,
    );
    fs.writeFileSync(
      path.join(root, schema, "app.ddx"),
      entry(schema, "Runner").text,
    );
  }
  return root;
}
function setup(root, { argument = false } = {}) {
  const commands = new Map(),
    launches = [],
    errors = [],
    picks = [],
    prompts = [],
    folder = { uri: { fsPath: root } };
  const vscode = {
    window: {
      activeTextEditor: {
        document: {
          uri: {
            scheme: "file",
            fsPath: path.join(root, "One", "Context.cls"),
          },
          getText: () =>
            fs.readFileSync(path.join(root, "One", "Context.cls"), "utf8"),
        },
      },
      showQuickPick: async (items, options) => {
        picks.push({ items, options });
        return options.title === "Jade startup parameter"
          ? argument
            ? items[1]
            : items[0]
          : items.find((i) => i.application?.schema === "Two") || items[0];
      },
      showInputBox: async (options) => {
        prompts.push(options);
        return "";
      },
      showErrorMessage: async (message) => errors.push(message),
    },
    workspace: { getWorkspaceFolder: () => folder },
    commands: {
      registerCommand: (name, fn) => {
        commands.set(name, fn);
        return { dispose() {} };
      },
    },
    debug: {
      startDebugging: async (folder, launch) => {
        launches.push({ folder, launch });
        return true;
      },
    },
  };
  registerApplicationDebug(vscode, { subscriptions: [] });
  return { commands, launches, errors, picks, prompts, vscode };
}
test("application launch uses selected stored name and matching schema CLS without changing any source", async () => {
  const root = fixture();
  try {
    const before = fs.readFileSync(path.join(root, "Two", "app.ddx"), "utf8"),
      s = setup(root);
    await s.commands.get("jadeNative.debugApplication")();
    const c = s.launches[0].launch;
    assert.equal(c.application, "Runner");
    assert.equal(c.schema, "Two");
    assert.equal(c.launchMode, "application");
    assert.equal(c.program, path.join(root, "Two", "Context.cls"));
    assert.equal(c.applicationParameter, undefined);
    assert.equal(
      fs.readFileSync(path.join(root, "Two", "app.ddx"), "utf8"),
      before,
    );
    assert.equal(s.errors.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("explicit empty startup String remains distinct from no parameter", async () => {
  const root = fixture();
  try {
    const s = setup(root, { argument: true });
    await s.commands.get("jadeNative.debugApplication")();
    assert.equal(s.launches[0].launch.applicationParameter, "");
    assert.equal(s.prompts.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("an application schema can use CLS context inherited from its superschema", async () => {
  const root = fixture();
  try {
    fs.writeFileSync(
      path.join(root, "Two.scm"),
      'jadeVersionNumber "25.0.02";\nschemaDefinition\nTwo subschemaOf One completeDefinition;',
    );
    fs.unlinkSync(path.join(root, "Two", "Context.cls"));
    const s = setup(root);
    await s.commands.get("jadeNative.debugApplication")();
    assert.equal(s.errors.length, 0);
    assert.equal(s.launches[0].launch.schema, "Two");
    assert.equal(
      s.launches[0].launch.program,
      path.join(root, "One", "Context.cls"),
    );
  } finally {
    if (
      path.dirname(root) === path.resolve(os.tmpdir()) &&
      path.basename(root).startsWith("jade-app-ui-")
    )
      fs.rmSync(root, { recursive: true, force: true });
  }
});
test("all SDK non-GUI application kinds are selectable with accurate labels", async () => {
  const root = fixture();
  try {
    for (const [type, label] of [
      ["S", "Non-GUI"],
      ["N", "Non-GUI web"],
      ["T", "Non-GUI REST"],
    ]) {
      fs.writeFileSync(
        path.join(root, "Two", "app.ddx"),
        entry("Two", "Runner", type).text,
      );
      const s = setup(root);
      await s.commands.get("jadeNative.debugApplication")();
      assert.equal(s.errors.length, 0);
      assert.ok(
        s.picks[0].items.some((item) => item.description.includes(label)),
      );
    }
  } finally {
    if (
      path.dirname(root) === path.resolve(os.tmpdir()) &&
      path.basename(root).startsWith("jade-app-ui-")
    )
      fs.rmSync(root, { recursive: true, force: true });
  }
});
test("application debugging gives actionable missing context and missing app errors", async () => {
  const root = fixture();
  try {
    const s = setup(root);
    s.vscode.window.activeTextEditor = undefined;
    await s.commands.get("jadeNative.debugApplication")();
    assert.match(s.errors[0], /CLS/i);
    assert.equal(s.launches.length, 0);
    const t = setup(root);
    for (const schema of ["One", "Two"])
      fs.unlinkSync(path.join(root, schema, "app.ddx"));
    await t.commands.get("jadeNative.debugApplication")();
    assert.match(t.errors[0], /DDX/);
    assert.equal(t.launches.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("native non-GUI fixtures do not need guessed XML startup text and GUI choices fail clearly", async () => {
  const native = fs.readFileSync(
      path.join(__dirname, "../inspector/application-probe.ddx"),
      "utf8",
    ),
    records = applicationCatalog({
      entries: [
        { extension: ".ddx", file: "application-probe.ddx", text: native },
      ],
    });
  assert.equal(records[0].type, "S");
  assert.equal(records[0].startup, "");
  const root = fixture();
  try {
    fs.writeFileSync(
      path.join(root, "Two", "app.ddx"),
      entry("Two", "Runner", "G").text,
    );
    const s = setup(root);
    await s.commands.get("jadeNative.debugApplication")();
    assert.equal(s.launches.length, 0);
    assert.match(s.errors[0], /GUI message-loop/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
