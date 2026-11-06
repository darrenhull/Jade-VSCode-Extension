const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { NativeDebugger } = require("../extension/src/debug-transport");
test(
  "native application launch uses configured initializer, string parameter and finalizer",
  {
    skip: process.env.JADE_DEBUG_APPLICATION_CONNECTED !== "1",
    timeout: 45000,
  },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_APPLICATION_CONFIG ||
            path.join(base, "inspector/build/policy-config.json"),
        ),
      ),
      directory = path.join(base, "evidence/debug-application-launch");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "session.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...working,
        workingWrites: true,
        schema: "SJetSchema",
        launchMode: "application",
        application: "SJetSchema",
        applicationParameter: "from-native-launch",
        owner: "SJetSchema",
        method: "probeInitialize",
        abi: path.join(base, "extension/native/debugger-abi.json"),
      }),
    );
    const client = new NativeDebugger(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        file,
      ),
      events = [];
    client.on("message", (m) => {
      events.push(m);
      fs.writeFileSync(
        path.join(directory, "events.json"),
        JSON.stringify(events, null, 2),
      );
    });
    const next = (name) =>
      new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            client.off("message", listener);
            client.off("failure", failure);
            client.off("close", closed);
          },
          failure = (e) => {
            cleanup();
            reject(e);
          },
          closed = () => failure(Error("Closed before " + name)),
          listener = (m) => {
            if (m.event === "error") failure(Error(m.message));
            else if (m.event === name) {
              cleanup();
              resolve(m);
            }
          },
          timer = setTimeout(() => failure(Error("No " + name)), 15000);
        client.on("message", listener);
        client.once("failure", failure);
        client.once("close", closed);
      });
    try {
      let stopped = await next("stopped");
      for (
        let i = 0;
        i < 30 && stopped.method.method !== "probeInitialize";
        i++
      ) {
        const stop = next("stopped");
        await client.request("resume", { mode: 0 });
        stopped = await stop;
      }
      assert.equal(stopped.method.method, "probeInitialize");
      const locals = await client.request("variables", {
        names: ["value", "self"],
      });
      assert.equal(
        locals.variables.find((v) => v.name === "value").value,
        "from-native-launch",
      );
      let finalized = false;
      for (let i = 0; i < 30; i++) {
        const stop = next("stopped");
        await client.request("resume", { mode: 0 });
        stopped = await stop;
        if (stopped.method.method === "probeFinalize") {
          finalized = true;
          const values = await client.request("variables", { names: ["self"] });
          const fields = await client.request("expand", {
            reference: values.variables.find((v) => v.name === "self")
              .variablesReference,
          });
          assert.equal(
            fields.variables.find((v) => v.name === "nativeLaunchParameter")
              .value,
            "from-native-launch",
          );
          break;
        }
      }
      assert.equal(finalized, true);
      const exited = next("exited");
      await client.request("resume", { mode: 2 });
      assert.equal((await exited).exitCode, 0);
    } finally {
      const closed = new Promise((resolve) => client.once("close", resolve));
      client.stop();
      if (client.state !== "closed") await closed;
    }
  },
);
