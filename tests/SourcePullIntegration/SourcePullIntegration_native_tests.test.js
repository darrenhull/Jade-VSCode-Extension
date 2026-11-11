"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn, execFileSync } = require("node:child_process");
const { CliWorkingSession } = require("../../extension/src/cli-client");
const {
  SourcePullEditorGuard,
} = require("../../extension/src/SourcePullEditorGuard");
const enabled = process.env.JADE_SOURCE_PULL_NATIVE === "1";
function fixtureConfig() {
  const file = process.env.JADE_SOURCE_PULL_NATIVE_CONFIG;
  if (!file) throw Error("Explicit owned fixture config required");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const databasePath = fs.realpathSync(raw.databasePath),
    seed = path.dirname(databasePath),
    temporary = fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(seed).toLowerCase(), temporary.toLowerCase());
  assert.match(path.basename(seed), /^jade-cli-stream-seed-[a-f0-9]+$/);
  assert.equal(path.basename(databasePath), "system");
  // Never forward the fixture's historical sourceDatabasePath or Working fields.
  return Object.fromEntries(
    ["installPath", "databasePath", "iniPath", "server", "characterSet"].map(
      (key) => [key, raw[key]],
    ),
  );
}
async function waitExit(pid) {
  if (!pid) return;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Owned broker still running; preserve artifacts.");
}
test(
  "actual extension client invokes public native streaming and preserves repeat/local/dirty outcomes",
  { skip: !enabled },
  async () => {
    const entry = process.env.JADE_SOURCE_PULL_NATIVE_EXE;
    if (!entry || !fs.existsSync(entry))
      throw Error("Explicit private portable CLI executable required");
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "jade-extension-source-client-"),
      ),
      workspace = path.join(root, "workspace"),
      state = path.join(root, "broker");
    fs.mkdirSync(workspace);
    const env = {
      JADE_TOOLS_STATE_DIRECTORY: state,
      JADE_TOOLS_CONNECTIONS_FILE: path.join(root, "connections.json"),
    };
    const session = new CliWorkingSession({
      entry,
      spawn: (exe, args, options) =>
        spawn(exe, args, { ...options, env: { ...options.env, ...env } }),
    });
    const config = {
      ...fixtureConfig(),
      workspaceRoots: [workspace],
      storagePath: path.join(root, "storage"),
    };
    const selected = {
      schema: "SJetSchema",
      name: "ExplorerDemoPet",
      kind: "class",
      path: "schemas/SJetSchema/types/ExplorerDemoPet.cls",
    };
    const proof = {
      nativeJadeExecuted: true,
      scope: "classes",
      authoritative: false,
      version: "current",
      outcomes: [],
    };
    let ownedBroker;
    async function pull(selection, dirty = false) {
      const documents = dirty
        ? [
            {
              uri: {
                scheme: "file",
                fsPath: path.join(workspace, selection.path),
              },
              isDirty: true,
            },
          ]
        : [];
      const noop = () => ({ dispose() {} });
      let operation;
      const guard = new SourcePullEditorGuard({
        workspace: {
          textDocuments: documents,
          onDidOpenTextDocument: noop,
          onDidChangeTextDocument: noop,
          onDidCloseTextDocument: noop,
        },
        destination: workspace,
        onInvalidated: () => operation?.stop(),
      });
      const events = [];
      operation = session.startSourceExtraction(
        config,
        { destination: workspace, selection: [selection], version: "current" },
        {
          onPermit: (event) => guard.approve(event.path),
          onFile: (event) => {
            guard.complete(event.path);
            events.push(event.outcome);
          },
        },
      );
      try {
        const result = await operation.completion;
        if (!result.indeterminate) guard.nativeClosed();
        proof.outcomes.push({
          events,
          code: result.code,
          status: result.status,
          counts: result.counts,
        });
        return result;
      } finally {
        guard.dispose();
      }
    }
    try {
      const capability = (await session.sourceCapabilities(config))
        .sourceExtraction;
      assert.equal(capability.protocol, 1);
      assert.deepEqual(capability.versions, ["current"]);
      assert.equal(capability.fullSchema, false);
      const first = await pull(selected);
      assert.equal(first.passed, true, JSON.stringify(first));
      assert.equal(first.counts.added, 1);
      assert.equal(first.version, "current");
      assert.equal(first.authoritative, false);
      const target = path.join(workspace, selected.path),
        bytes = fs.readFileSync(target),
        mtime = fs.statSync(target).mtimeMs;
      assert.match(bytes.toString("utf8"), /ExplorerDemoPet/);
      const repeated = await pull(selected);
      assert.equal(repeated.counts.unchanged, 1, JSON.stringify(repeated));
      assert.equal(fs.statSync(target).mtimeMs, mtime);
      assert.ok(fs.readFileSync(target).equals(bytes));
      fs.appendFileSync(target, "\n// preserved local edit\n");
      const edited = fs.readFileSync(target);
      const local = await pull(selected);
      assert.equal(local.counts.keptLocal, 1, JSON.stringify(local));
      assert.ok(fs.readFileSync(target).equals(edited));
      const dirty = { ...selected, path: "fresh/ExplorerDemoPet.cls" },
        veto = await pull(dirty, true);
      assert.equal(veto.passed, false);
      assert.equal(veto.counts.rejected, 1, JSON.stringify(veto));
      assert.equal(fs.existsSync(path.join(workspace, dirty.path)), false);
      proof.bytes = bytes.length;
      proof.unchangedMtime = true;
      proof.localEditPreserved = true;
      proof.dirtyVeto = true;
      fs.mkdirSync(path.resolve(__dirname, "../../build"), { recursive: true });
      fs.writeFileSync(
        path.resolve(__dirname, "../../build/source-pull-native-client.json"),
        JSON.stringify(proof, null, 2) + "\n",
      );
    } finally {
      try {
        const status = await session.request("status").promise;
        ownedBroker = status.brokerPID;
        await session.request("shutdown").promise;
      } finally {
        await session.dispose();
      }
      await waitExit(ownedBroker);
      assert.equal(
        path.dirname(fs.realpathSync(root)).toLowerCase(),
        fs.realpathSync(os.tmpdir()).toLowerCase(),
      );
      assert.match(path.basename(root), /^jade-extension-source-client-/);
      fs.rmSync(root, { recursive: true });
    }
  },
);
