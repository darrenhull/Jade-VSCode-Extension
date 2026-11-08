"use strict";
const test = require("node:test"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const { CliWorkingSession } = require("../../extension/src/cli-client");
const {
  CliInspectionTransport,
} = require("../../extension/src/CliInspectionTransport");
const fixtureFile = process.env.JADE_SHARED_ADAPTER_FIXTURE,
  entry = process.env.JADE_SHARED_ADAPTER_CLI;
test(
  "actual native adapter reuses inspection/build/test A-B-A and safely hands off Scratch/reorganisation",
  {
    skip:
      !fixtureFile || !entry || !process.env.JADE_TOOLS_STATE_DIRECTORY
        ? "Requires an explicit disposable native shared-adapter fixture, candidate CLI and private broker state."
        : false,
    timeout: 180000,
  },
  async (t) => {
    const config = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
    const seedRoot = fs.realpathSync(
      path.dirname(path.resolve(config.databasePath)),
    );
    assert.match(path.basename(seedRoot), /^jade-cli-integration-seed-/);
    const insideSeed = (value) => {
      const relative = path.relative(seedRoot, path.resolve(value));
      return (
        relative !== "" &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative)
      );
    };
    assert.ok(
      insideSeed(process.env.JADE_TOOLS_STATE_DIRECTORY),
      "Dedicated broker state must be inside the disposable fixture",
    );
    for (const file of config.files)
      assert.ok(
        insideSeed(fs.realpathSync(file)),
        "Only disposable fixture source may be edited",
      );
    const client = new CliWorkingSession({ entry: entry });
    const records = [];
    let source, working;
    const original = new Map(
      config.files.map((file) => [file, fs.readFileSync(file)]),
    );
    function record(name, start, result, output = "") {
      const row = {
        name,
        ms: Date.now() - start,
        code: result?.code,
        passed: result?.passed,
        epoch: result?.connectionEpoch,
        report: result?.report,
        output,
      };
      records.push(row);
      t.diagnostic(
        JSON.stringify({
          name: row.name,
          ms: row.ms,
          code: row.code,
          passed: row.passed,
          epoch: row.epoch,
          loadMilliseconds: row.report?.native_load_milliseconds,
          reconnectMilliseconds: row.report?.native_reconnect_milliseconds,
          executionMilliseconds: row.report?.elapsedMilliseconds,
          nativeTestMilliseconds: output.match(/Native run:\s*(\d+)/)?.[1],
        }),
      );
    }
    async function operation(command, cfg = config, body = {}) {
      let output = "";
      const start = Date.now(),
        result = await client.request(
          command,
          { config: cfg, ...body },
          (text) => (output += text),
        ).promise;
      record(command, start, result, output);
      assert.equal(result.passed, true, result.report?.error || output);
      assert.equal(result.code, 0);
      return result;
    }
    async function catalog(transport, label) {
      const start = Date.now();
      let body;
      try {
        body = await transport.request("catalog", { includeSystem: false });
      } catch (error) {
        assert.match(error.message, /changed|refresh/);
        body = await transport.request("catalog", { includeSystem: false });
      }
      record(label, start, body);
      return body;
    }
    try {
      let start = Date.now();
      source = new CliInspectionTransport(client, { config, target: "source" });
      record("source-open", start, await source.ready);
      await catalog(source, "source-first");
      start = Date.now();
      working = new CliInspectionTransport(client, {
        config,
        target: "working",
      });
      record("working-open", start, await working.ready);
      const first = await catalog(working, "working-first");
      assert.notEqual(first.connectionEpoch, source.connectionEpoch);
      await operation("build", { ...config, projectBuild: true });
      const built = await catalog(working, "after-build");
      for (const owner of [
        "SharedConnectionTestsA",
        "SharedConnectionTestsB",
        "SharedConnectionTestsA",
      ]) {
        const tested = await operation("test", {
          ...config,
          program: config.files.find(
            (file) => path.basename(file) === owner + ".cls",
          ),
          methods: "nativeValue",
        });
        assert.equal(tested.report.tests_selected, 1);
        assert.equal(tested.report.tests_completed, true);
        assert.deepEqual(tested.report.results, [
          { owner, method: "nativeValue", status: "passed" },
        ]);
        assert.equal(
          (await catalog(working, "after-" + owner)).connectionEpoch,
          built.connectionEpoch,
        );
      }
      const file = config.files.find(
        (file) => path.basename(file) === "SharedConnectionPet.cls",
      );
      let text = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        text.replace("return 1;", "return 1; // adapter method edit"),
      );
      await operation("build");
      assert.equal(
        (await catalog(working, "after-method-edit")).connectionEpoch,
        built.connectionEpoch,
      );
      for (let i = 1; i <= 2; i++) {
        const token = "Adapter scratch " + i;
        const result = await operation("workspace.run", config, {
          sourceText: 'begin\n write "' + token + '";\nend;',
          source: "jade-workspace:shared-adapter-proof",
        });
        assert.ok(
          JSON.stringify(result).includes(token),
          "Scratch output must include its independently executed token",
        );
        await catalog(working, "after-scratch-" + i);
      }
      text = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        text.replace(
          "jadeMethodDefinitions",
          "attributeDefinitions\nadapterTag: String[20];\njadeMethodDefinitions",
        ),
      );
      const before = working.connectionEpoch;
      await operation("build");
      const structural = await catalog(working, "after-structural-edit");
      assert.notEqual(structural.connectionEpoch, before);
      const sourceNow = await catalog(
        source,
        "source-before-working-disconnect",
      );
      await working.stop({ disconnect: true });
      working = undefined;
      assert.equal(
        (await catalog(source, "source-after-working-disconnect"))
          .connectionEpoch,
        sourceNow.connectionEpoch,
      );
      await source.stop();
      source = undefined;
      await CliInspectionTransport.disconnectTarget(client, {
        config,
        target: "source",
      });
    } finally {
      for (const [file, bytes] of original) fs.writeFileSync(file, bytes);
      await working?.stop().catch(() => {});
      await source?.stop().catch(() => {});
      await client.release().catch(() => {});
      client.dispose();
      execFileSync(entry, ["shutdown", "--json"], {
        env: process.env,
        windowsHide: true,
        timeout: 30000,
      });
    }
  },
);
