"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn } = require("node:child_process");
const { CliWorkingSession } = require("../../extension/src/cli-client");
test(
  "public native capability doctor accepts an empty project with a stale build program without opening a database",
  { skip: process.env.JADE_SOURCE_PULL_DOCTOR !== "1" },
  async () => {
    const entry = process.env.JADE_SOURCE_PULL_DOCTOR_EXE,
      installPath = process.env.JADE_SOURCE_PULL_DOCTOR_INSTALL;
    if (!entry || !installPath)
      throw Error("Explicit verified CLI and installed runtime paths required");
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "jade-source-doctor-empty-"),
      ),
      workspace = path.join(root, "workspace"),
      database = path.join(root, "database-must-not-open"),
      iniPath = path.join(root, "read-only-probe.ini");
    fs.mkdirSync(workspace);
    fs.mkdirSync(database);
    fs.writeFileSync(iniPath, "[JadeServer]\nServer=singleUser\n");
    fs.writeFileSync(
      path.join(workspace, "jade.json"),
      JSON.stringify({
        installPath,
        databasePath: database,
        iniPath,
        server: "singleUser",
        schema: "UnbuiltSchema",
        program: "missing-unbuilt-class.cls",
      }),
    );
    const env = {
        JADE_TOOLS_STATE_DIRECTORY: path.join(root, "broker"),
        JADE_TOOLS_CONNECTIONS_FILE: path.join(root, "connections.json"),
      },
      session = new CliWorkingSession({
        entry,
        spawn: (exe, args, options) =>
          spawn(exe, args, { ...options, env: { ...options.env, ...env } }),
      });
    let pid;
    try {
      const capabilities = await session.sourceCapabilities(
        {
          installPath,
          databasePath: database,
          iniPath,
          server: "singleUser",
          workspaceRoots: [workspace],
        },
        { cwd: workspace },
      );
      assert.equal(capabilities.sourceExtraction.protocol, 1);
      assert.deepEqual(fs.readdirSync(database), []);
      assert.equal(
        fs.existsSync(path.join(workspace, "missing-unbuilt-class.cls")),
        false,
      );
    } finally {
      try {
        pid = (await session.request("status").promise).brokerPID;
        await session.request("shutdown").promise;
      } finally {
        await session.dispose();
      }
      if (pid) {
        for (let i = 0; i < 100; i++) {
          try {
            process.kill(pid, 0);
          } catch (error) {
            if (error.code === "ESRCH") {
              pid = undefined;
              break;
            }
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(
          pid,
          undefined,
          "Owned doctor broker must close before cleanup",
        );
      }
      assert.equal(
        path.dirname(fs.realpathSync(root)).toLowerCase(),
        fs.realpathSync(os.tmpdir()).toLowerCase(),
      );
      assert.match(path.basename(root), /^jade-source-doctor-empty-/);
      fs.rmSync(root, { recursive: true });
    }
  },
);
