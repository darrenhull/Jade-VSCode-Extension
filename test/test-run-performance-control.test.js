"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
    testingHarness,
  } = require("./helpers/testing-harness"),
  { registerTesting } = require("../extension/src/testing"),
  { SourceIndex } = require("../extension/src/workspace-index");
function source(schema, owner) {
  return (
    `schemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf JadeTestCase transient;\ntypeDefinitions\n${owner} completeDefinition\n(\n)\ntypeSources\n${owner} (\njadeMethodSources\n` +
    Array.from(
      { length: 4 },
      (_, n) => `check${n}\n{\ncheck${n}() unitTest;\nbegin\nend;\n}\n`,
    ).join("") +
    ")\n"
  );
}
function fixture() {
  const h = testingHarness(),
    profiles = new Map(),
    calls = { run: [], debug: [] };
  let reads = 0;
  const files = new Map([
      ["file:///C:/source/A/Tests.cls", source("SchemaA", "Tests")],
      ["file:///C:/source/B/Tests.cls", source("SchemaB", "Tests")],
      ["file:///C:/source/A/Other.cls", source("SchemaA", "Other")],
    ]),
    index = new SourceIndex({
      list: async () => [...files.keys()],
      read: async (uri) => {
        reads++;
        return files.get(uri);
      },
    });
  const dispose = () => ({ dispose() {} });
  h.controller.createRunProfile = (name, kind, handler) => {
    profiles.set(kind, handler);
    return dispose();
  };
  const api = {
    ...h.api,
    TestRunProfileKind: { Run: 1, Debug: 2 },
    window: {
      showErrorMessage: (message) => {
        throw Error(message);
      },
    },
    workspace: {
      textDocuments: [],
      createFileSystemWatcher: () => ({
        dispose() {},
        onDidCreate: dispose,
        onDidChange: dispose,
        onDidDelete: dispose,
      }),
      onDidOpenTextDocument: dispose,
      onDidChangeTextDocument: dispose,
    },
  };
  api.Uri.parse = (value) => api.Uri.file(value.replace("file:///", ""));
  const answer = (methods) => ({
      passed: true,
      report: {
        tests_completed: true,
        cleanup_complete: true,
        results: methods.map((method) => ({ method, status: "passed" })),
      },
    }),
    manager = registerTesting(
      api,
      { subscriptions: [] },
      async (uri, methods) => {
        calls.run.push({ uri: uri.toString(), methods });
        return answer(methods);
      },
      index,
      async (uri, method) => {
        calls.debug.push({ uri: uri.toString(), method });
        return answer([method]);
      },
    );
  return {
    h,
    profiles,
    calls,
    manager,
    index,
    get reads() {
      return reads;
    },
    api,
  };
}
test("Run Test Explorer batches 12 selected methods into 3 schema-qualified class calls and preserves every result", async () => {
  const f = fixture();
  try {
    await f.manager.discover();
    await f.profiles.get(1)(new f.api.TestRunRequest());
    assert.equal(f.calls.run.length, 3);
    assert.equal(
      f.calls.run.reduce((count, call) => count + call.methods.length, 0),
      12,
    );
    assert.equal(new Set(f.calls.run.map((call) => call.uri)).size, 3);
    assert.equal(
      f.h.runs[0].states.filter((state) => state.status === "passed").length,
      12,
    );
    assert.equal(f.h.runs[0].ended, true);
    const reads = f.reads;
    await f.profiles.get(1)(new f.api.TestRunRequest());
    assert.equal(
      f.reads,
      reads,
      "Warm test discovery does not reread the source index on every run.",
    );
  } finally {
    f.index.dispose();
  }
});
test("Debug Test Explorer launches each selected method separately, so 12 tests incur 12 debug setup paths", async () => {
  const f = fixture();
  try {
    await f.manager.discover();
    await f.profiles.get(2)(new f.api.TestRunRequest());
    assert.equal(f.calls.debug.length, 12);
    assert.equal(f.calls.run.length, 0);
    assert.equal(
      f.h.runs[0].states.filter((state) => state.status === "passed").length,
      12,
    );
    assert.equal(f.h.runs[0].ended, true);
  } finally {
    f.index.dispose();
  }
});
