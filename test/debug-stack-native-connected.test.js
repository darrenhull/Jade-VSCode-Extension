"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { nativeProcess } = require("../extension/src/working-database"),
  { NativeDebugger } = require("../extension/src/debug-transport");
const source = `jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
DebugStackProbe subclassOf Object transient;
DebugStackProbeByName subclassOf MemberKeyDictionary transient;
membershipDefinitions
DebugStackProbeByName of DebugStackProbe;
typeDefinitions
DebugStackProbe completeDefinition
(
attributeDefinitions
 name: String[50];
 birthDate: Date;
referenceDefinitions
 child: DebugStackProbe;
 parent: DebugStackProbe;
 objects: ObjectArray;
 strings: StringArray;
 members: ObjectSet;
 byName: DebugStackProbeByName;
jadeMethodDefinitions
 entry() : Integer updating;
 inner(n : Integer) : Integer;
)
DebugStackProbeByName completeDefinition
(
)
memberKeyDefinitions
DebugStackProbeByName completeDefinition
(
 name;
)
typeSources
DebugStackProbe (
jadeMethodSources
entry
{
entry() : Integer updating;
vars
 callerValue : Integer;
begin
 self.name := "Parent";
 create self.child transient;
 self.child.name := "Young";
 self.child.birthDate := "2026:11:05".asDate;
 self.child.parent := self;
 create self.child.objects transient;
 self.child.objects.add(self);
 self.child.objects.add(self.child);
 create self.child.strings transient;
 self.child.strings.add("first");
 self.child.strings.add("second");
 create self.child.members transient;
 self.child.members.add(self);
 self.child.members.add(self.child);
 create self.child.byName transient;
 self.child.byName.add(self);
 self.child.byName.add(self.child);
 callerValue := 99;
 return child.inner(40);
epilog
 delete self.child.byName;
 delete self.child.members;
 delete self.child.objects;
 delete self.child.strings;
 delete self.child;
end;
}
inner
{
inner(n : Integer) : Integer;
vars
 innerValue : Integer;
begin
 innerValue := n + 2;
 return innerValue;
end;
}
)`;
test(
  "native nested call stack exposes caller locals and expandable cyclic transient objects",
  { skip: process.env.JADE_DEBUG_CONNECTED !== "1", timeout: 90000 },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          process.env.JADE_DEBUG_DATABASE_CONFIG ||
            process.env.JADE_TEST_CONFIG,
        ),
      ),
      directory = path.join(base, "evidence/debug-stack-feature");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "DebugStackProbe.cls");
    fs.writeFileSync(file, source);
    let output = "";
    const loaded = await nativeProcess(
      path.join(working.installPath, "bin/jadloadb.exe"),
      [
        "path=" + working.databasePath,
        "ini=" + working.iniPath,
        "server=singleUser",
        "schemaFile=" + file,
        "targetSchema=SJetSchema",
        "loadStyle=currentSchemaVersion",
        "dontSaveSources=false",
        "replayableReorg=true",
      ],
      working,
      (text) => (output += text),
    );
    assert.equal(loaded.success, true, output);
    const session = path.join(directory, "session.json");
    fs.writeFileSync(
      session,
      JSON.stringify({
        ...working,
        schema: "SJetSchema",
        owner: "DebugStackProbe",
        method: "entry",
        abi: path.join(base, "extension/native/debugger-abi.json"),
      }),
    );
    const client = new NativeDebugger(
        path.join(base, "extension/native/jade-debug-helper.exe"),
        session,
      ),
      events = [];
    client.on("message", (m) => events.push(m));
    client.on("output", (text) => (output += text));
    const next = (name) =>
      new Promise((resolve, reject) => {
        const failure = (error) => {
          client.off("message", listener);
          reject(error);
        };
        const listener = (m) => {
          if (m.event === "error") {
            client.off("message", listener);
            client.off("failure", failure);
            reject(Error(m.message));
          }
          if (m.event === name) {
            client.off("message", listener);
            client.off("failure", failure);
            resolve(m);
          }
        };
        client.on("message", listener);
        client.once("failure", failure);
      });
    try {
      let stop = await next("stopped");
      for (let i = 0; i < 60 && stop.method.method !== "inner"; i++) {
        const stopped = next("stopped");
        await client.request("resume", { mode: 0 });
        stop = await stopped;
      }
      assert.equal(stop.method.method, "inner");
      const stack = await client.request("stack");
      fs.writeFileSync(
        path.join(directory, "stack.json"),
        JSON.stringify(stack, null, 2),
      );
      assert.deepEqual(
        stack.frames.map((f) => f.method),
        ["inner", "entry"],
      );
      assert.equal(
        stack.frames[1].source.slice(0, stack.frames[1].position).split("\n")
          .length,
        stack.frames[1].source
          .slice(0, stack.frames[1].source.indexOf("return child.inner"))
          .split("\n").length,
        "Jade must report the actual suspended caller source line.",
      );
      const locals = await client.request("variables", {
        level: 0,
        names: ["n", "innerValue", "self"],
      });
      assert.equal(locals.variables.find((v) => v.name === "n").value, "40");
      const caller = await client.request("variables", {
        level: 1,
        names: ["callerValue", "self"],
      });
      assert.equal(
        caller.variables.find((v) => v.name === "callerValue").value,
        "99",
      );
      const receiver = locals.variables.find((v) => v.name === "self");
      assert.ok(receiver.variablesReference > 0);
      const expanded = await client.request("expand", {
        reference: receiver.variablesReference,
      });
      assert.equal(
        expanded.variables.find((v) => v.name === "name").value,
        "Young",
      );
      assert.match(
        expanded.variables.find((v) => v.name === "birthDate").value,
        /2026/,
      );
      const parent = expanded.variables.find((v) => v.name === "parent");
      assert.ok(parent.variablesReference > 0);
      const ancestor = await client.request("expand", {
        reference: parent.variablesReference,
      });
      assert.equal(
        ancestor.variables.find((v) => v.name === "name").value,
        "Parent",
      );
      assert.equal(
        ancestor.variables.find((v) => v.name === "child").variablesReference,
        receiver.variablesReference,
        "cycles reuse handles: " +
          JSON.stringify({ receiver, expanded, ancestor }),
      );
      assert.equal(
        expanded.variables.find((v) => v.name === "child").value,
        "null",
      );
      assert.equal(
        expanded.variables.find((v) => v.name === "child").variablesReference,
        0,
      );
      const page = await client.request("expand", {
        reference: receiver.variablesReference,
        start: 4,
        count: 1,
      });
      assert.equal(page.variables.length, 1);
      assert.equal(page.variables[0].name, "name");
      const objects = expanded.variables.find((v) => v.name === "objects");
      assert.equal(objects.indexedVariables, 2);
      const objectItems = await client.request("expand", {
        reference: objects.variablesReference,
        filter: "indexed",
        start: 0,
        count: 2,
      });
      assert.equal(objectItems.variables.length, 2);
      assert.equal(
        objectItems.variables[1].variablesReference,
        receiver.variablesReference,
      );
      const strings = expanded.variables.find((v) => v.name === "strings");
      assert.equal(strings.indexedVariables, 2);
      const stringItems = await client.request("expand", {
        reference: strings.variablesReference,
        filter: "indexed",
        start: 1,
        count: 1,
      });
      assert.deepEqual(
        stringItems.variables.map((v) => v.value),
        ["second"],
      );
      const members = expanded.variables.find((v) => v.name === "members");
      assert.equal(members.indexedVariables, 2);
      const memberItems = await client.request("expand", {
        reference: members.variablesReference,
        filter: "indexed",
        start: 0,
        count: 2,
      });
      assert.equal(memberItems.variables.length, 2);
      assert.ok(
        memberItems.variables.some(
          (v) => v.variablesReference === receiver.variablesReference,
        ),
      );
      const byName = expanded.variables.find((v) => v.name === "byName");
      assert.equal(byName.indexedVariables, 2);
      const keyedItems = await client.request("expand", {
        reference: byName.variablesReference,
        filter: "indexed",
        start: 0,
        count: 2,
      });
      assert.deepEqual(
        keyedItems.variables.map((v) => v.key),
        ["Parent", "Young"],
      );
      const stoppedAgain = next("stopped");
      await client.request("resume", { mode: 0 });
      await stoppedAgain;
      await assert.rejects(
        client.request("expand", { reference: receiver.variablesReference }),
        /stale/,
      );
      const done = next("exited");
      await client.request("resume", { mode: 2 });
      assert.equal((await done).result.value, "42");
      await new Promise((resolve) => {
        if (client.state === "closed") resolve();
        else client.once("close", resolve);
      });
    } finally {
      client.stop();
      if (client.state !== "closed")
        await new Promise((resolve) => client.once("close", resolve));
      fs.writeFileSync(path.join(directory, "output.txt"), output);
      fs.writeFileSync(
        path.join(directory, "events.json"),
        JSON.stringify(events, null, 2),
      );
    }
  },
);
module.exports = { source };
