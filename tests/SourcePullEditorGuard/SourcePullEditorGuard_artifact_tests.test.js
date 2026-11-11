"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { EventEmitter } = require("node:events"),
  os = require("node:os"),
  path = require("node:path");
const {
  SourcePullEditorGuard,
} = require("../../extension/src/SourcePullEditorGuard");
test("native class identity protects a virtual draft at a different local filename", () => {
  const events = new EventEmitter(),
    noop = () => ({ dispose() {} }),
    artifact = {
      schema: "Pets",
      name: "Fish",
      kind: "class",
      component: "source",
    };
  let pending = true;
  const stopped = [];
  const guard = new SourcePullEditorGuard({
    workspace: {
      textDocuments: [],
      onDidOpenTextDocument: noop,
      onDidChangeTextDocument: noop,
      onDidCloseTextDocument: noop,
    },
    destination: path.join(os.tmpdir(), "artifact-guard"),
    onInvalidated: (x) => stopped.push(x),
    pendingSources: {
      hasPending: () => false,
      hasPendingArtifact: (value) =>
        pending && value.schema === "Pets" && value.name === "Fish",
      onDidChange: (cb) => {
        events.on("draft", cb);
        return { dispose: () => events.off("draft", cb) };
      },
    },
  });
  assert.equal(guard.approve("schemas/Pets/types/Fish.cls", artifact), false);
  pending = false;
  assert.equal(guard.approve("schemas/Pets/types/Fish.cls", artifact), true);
  pending = true;
  events.emit("draft", {
    path: "C:/legacy/MyFish.cls",
    artifact,
    pending: true,
  });
  assert.equal(stopped.length, 1);
  guard.nativeClosed();
  guard.dispose();
});

test("an associated untitled source file vetoes its native target while plain Untitled remains unrelated", () => {
  const root = path.join(os.tmpdir(), "untitled-source-guard"),
    noop = () => ({ dispose() {} }),
    workspace = {
      textDocuments: [
        {
          uri: {
            scheme: "untitled",
            fsPath: path.join(root, "schemas/Pets.scm"),
          },
          isDirty: true,
        },
        { uri: { scheme: "untitled", fsPath: "Untitled-1" }, isDirty: true },
      ],
      onDidOpenTextDocument: noop,
      onDidChangeTextDocument: noop,
      onDidCloseTextDocument: noop,
    };
  const guard = new SourcePullEditorGuard({
    workspace,
    destination: root,
    onInvalidated: () => assert.fail("No active permit existed"),
  });
  assert.equal(guard.approve("schemas/Pets.scm"), false);
  assert.equal(guard.approve("schemas/Other.scm"), true);
  guard.complete("schemas/Other.scm");
  guard.dispose();
});

test("a clean file tab cannot hide an associated unsaved document for the same target", () => {
  const root = path.join(os.tmpdir(), "shared-source-target"),
    target = path.join(root, "schemas/Pets.scm"),
    noop = () => ({ dispose() {} });
  for (const reverse of [false, true]) {
    const dirty = {
        uri: { scheme: "untitled", fsPath: target },
        isDirty: true,
      },
      clean = { uri: { scheme: "file", fsPath: target }, isDirty: false };
    const guard = new SourcePullEditorGuard({
      workspace: {
        textDocuments: reverse ? [clean, dirty] : [dirty, clean],
        onDidOpenTextDocument: noop,
        onDidChangeTextDocument: noop,
        onDidCloseTextDocument: noop,
      },
      destination: root,
      onInvalidated: () => {},
    });
    assert.equal(guard.approve("schemas/Pets.scm"), false);
    guard.dispose();
  }
});
