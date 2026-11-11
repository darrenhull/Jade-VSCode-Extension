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
