"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const {
  createPullProgress,
  preparePullSources,
} = require("../extension/src/pull-progress");
const turn = () => new Promise((resolve) => setImmediate(resolve));
test("pull progress reports observed classes and elapsed time without inventing a percentage, then closes its watcher", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-pull-progress-")),
    reports = [];
  let closed = false,
    now = 1000;
  try {
    fs.mkdirSync(path.join(root, "Types"));
    fs.writeFileSync(path.join(root, "Types", "One.cls"), "native");
    fs.writeFileSync(path.join(root, "Types", "Two.cls"), "native");
    fs.writeFileSync(path.join(root, "other.scm"), "native");
    const watcher = new EventEmitter();
    watcher.close = () => (closed = true);
    const progress = createPullProgress(
      { report: (value) => reports.push(value) },
      {
        directory: root,
        now: () => now,
        watch: () => watcher,
        intervalMs: 100000,
      },
    );
    await progress.refresh();
    now = 66000;
    await progress.refresh();
    assert.match(reports.at(-1).message, /2 class files observed/);
    assert.match(reports.at(-1).message, /1:05 elapsed/);
    assert.ok(reports.every((report) => report.increment === undefined));
    progress.dispose();
    assert.equal(closed, true);
    const count = reports.length;
    await progress.refresh();
    assert.equal(reports.length, count);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("pull preparation cancellation waits for worker termination and disposes the cancellation handler", async () => {
  let abort,
    terminated = false,
    finish,
    disposed = false;
  class Worker extends EventEmitter {
    constructor() {
      super();
    }
    terminate() {
      terminated = true;
      return new Promise(
        (resolve) =>
          (finish = () => {
            this.emit("exit", 1);
            resolve(1);
          }),
      );
    }
  }
  const operation = preparePullSources(
    {},
    {
      WorkerClass: Worker,
      token: {
        isCancellationRequested: false,
        onCancellationRequested: (fn) => {
          abort = fn;
          return { dispose: () => (disposed = true) };
        },
      },
    },
  );
  let completed = false;
  operation.catch(() => (completed = true));
  abort();
  await turn();
  assert.equal(terminated, true);
  assert.equal(completed, false);
  finish();
  await assert.rejects(operation, /cancelled/i);
  assert.equal(disposed, true);
});
test("failed preparation never creates or changes the workspace destination", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-pull-prepare-"));
  try {
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace);
    fs.writeFileSync(
      path.join(workspace, "local.cls"),
      "unsaved source on disk",
    );
    await assert.rejects(
      preparePullSources({
        rawDirectory: path.join(root, "missing"),
        organizedDirectory: path.join(root, "organized"),
        destination: workspace,
      }),
      /ENOENT/,
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, "local.cls"), "utf8"),
      "unsaved source on disk",
    );
    assert.deepEqual(fs.readdirSync(workspace), ["local.cls"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("real worker preparation preserves native bytes and reports local conflicts without writing working source", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-pull-worker-"));
  try {
    const raw = path.join(root, "raw"),
      destination = path.join(root, "workspace");
    fs.mkdirSync(path.join(raw, "Pets", "Types"), { recursive: true });
    const native = Buffer.from(
      'jadeVersionNumber "25.0.02";\r\nschemaDefinition\r\nPets subschemaOf RootSchema partialDefinition;\r\ntypeHeaders\r\nFish subclassOf Object transient;\r\ntypeDefinitions\r\nFish completeDefinition\r\n(\r\nattributeDefinitions\r\nname: String[40];\r\n)\r\ntypeSources\r\n',
    );
    fs.writeFileSync(path.join(raw, "Pets.scm"), "native aggregate");
    fs.writeFileSync(
      path.join(raw, "Pets", "schemaDefinitions.sec"),
      'jadeVersionNumber "25.0.02";\r\nschemaDefinition\r\nPets subschemaOf RootSchema completeDefinition;\r\n',
    );
    fs.writeFileSync(path.join(raw, "Pets", "Types", "Fish.cls"), native);
    fs.writeFileSync(
      path.join(raw, "extract-manifest.json"),
      JSON.stringify({
        files: [
          { path: "Pets.scm" },
          { path: "Pets/schemaDefinitions.sec" },
          { path: "Pets/Types/Fish.cls" },
        ],
      }),
    );
    const local = path.join(
      destination,
      "schemas",
      "Pets",
      "types",
      "Fish.cls",
    );
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, "local source edits");
    const phases = [];
    const result = await preparePullSources(
      {
        rawDirectory: raw,
        organizedDirectory: path.join(root, "organized"),
        destination,
      },
      { report: (value) => phases.push(value) },
    );
    assert.equal(result.plan.conflicts.length, 1);
    assert.equal(fs.readFileSync(local, "utf8"), "local source edits");
    assert.deepEqual(
      fs.readFileSync(
        path.join(result.organized.directory, "schemas/Pets/types/Fish.cls"),
      ),
      native,
    );
    assert.ok(phases.some((value) => /Comparing/.test(value)));
    assert.deepEqual(
      fs.readFileSync(path.join(raw, "Pets", "Types", "Fish.cls")),
      native,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
