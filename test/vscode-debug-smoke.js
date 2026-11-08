"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    report = path.resolve(root, "../host-report.json"),
    messages = [];
  let tracker;
  const progress = (stage) =>
    fs.writeFileSync(
      path.resolve(root, "../debug-host-progress.json"),
      JSON.stringify({ stage, messages: messages.slice(-40) }, null, 2),
    );
  async function stopSession(session) {
    progress("before stopDebugging " + session.name);
    let timer;
    try {
      await Promise.race([
        vscode.debug.stopDebugging(session),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(
                  "VS Code stopDebugging timed out after native termination",
                ),
              ),
            20000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    progress("after stopDebugging " + session.name);
  }
  try {
    const extension = vscode.extensions.getExtension(
      "jade-local-tools.jade-native-runner-cpp-preview",
    );
    const api = await extension.activate();
    const settings = vscode.workspace.getConfiguration(
      "jadeNative",
      vscode.workspace.workspaceFolders[0].uri,
    );
    await settings.update(
      "installPath",
      "C:/Jade2025",
      vscode.ConfigurationTarget.WorkspaceFolder,
    );
    if (process.env.JADE_TEST_SEED)
      await settings.update(
        "databasePath",
        process.env.JADE_TEST_SEED,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    if (process.env.JADE_TEST_INI)
      await settings.update(
        "iniPath",
        process.env.JADE_TEST_INI,
        vscode.ConfigurationTarget.WorkspaceFolder,
      );
    const file = path.join(root, "VsCodeDebugProbe.cls"),
      doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    const sharedProof = process.env.JADE_SHARED_CONNECTION_PROOF === '1';
    async function connectInspectionAndCapture(name) {
      await vscode.commands.executeCommand('jadeNative.connectObjects');
      assert.ok(api.objectExplorer.session.client, 'Inspection opens its native reader without manual handoff');
      await api.objectExplorer.session.client.ready;
      await vscode.commands.executeCommand('jadeNative.objects.focus');
      await new Promise(resolve => setTimeout(resolve, 400));
      const client = await require('./creation-ui-capture.cjs').connectPrivateDebugger(Number(process.env.JADE_SHARED_CONNECTION_DEBUG_PORT));
      try {
        const targets = await client.request('Target.getTargets');
        const page = targets.targetInfos.find(target => target.type === 'page' && target.url.startsWith('vscode-file://'));
        assert.ok(page, 'Private Code renderer must be found');
        const attached = await client.request('Target.attachToTarget', {targetId:page.targetId,flatten:true});
        const image = await client.request('Page.captureScreenshot', {format:'png',captureBeyondViewport:false}, attached.sessionId);
        const directory = process.env.JADE_SHARED_CONNECTION_SCREENSHOTS;
        fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(image.data,'base64'));
      } finally {client.close();}
    }
    if (sharedProof) await connectInspectionAndCapture('inspection-before-debug');
    const lines = doc.getText().split("\n"),
      returnLine = lines.findIndex((l) => l.includes("return answer;")),
      firstLine = lines.findIndex((l) => l.includes("answer := 40;")),
      secondLine = lines.findIndex((l) => l.includes("answer := answer"));
    tracker = vscode.debug.registerDebugAdapterTrackerFactory(
      "jade-native-experimental",
      {
        createDebugAdapterTracker: () => ({
          onDidSendMessage: (m) => {
            messages.push(m);
            progress("adapter " + (m.event || m.command));
          },
        }),
      },
    );
    const editor = vscode.window.activeTextEditor;
    editor.selection = new vscode.Selection(returnLine, 0, returnLine, 0);
    await vscode.commands.executeCommand(
      "editor.debug.action.toggleBreakpoint",
    );
    assert.ok(
      vscode.debug.breakpoints.some(
        (b) =>
          b instanceof vscode.SourceBreakpoint &&
          b.location.uri.toString() === doc.uri.toString() &&
          b.location.range.start.line === returnLine,
      ),
      "Editor gutter/F9 breakpoint toggle must work for Jade",
    );
    async function wait(match) {
      for (let i = 0; i < 1200; i++) {
        const m = messages.find(match);
        if (m) return m;
        const error = messages.find(
          (m) => m.type === "response" && m.success === false,
        );
        if (error) throw Error(JSON.stringify(error));
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error(
        "Debug event timed out: " + JSON.stringify(messages.slice(-10)),
      );
    }
    const started = await vscode.debug.startDebugging(
      vscode.workspace.workspaceFolders[0],
      {
        type: "jade-native-experimental",
        request: "launch",
        name: "Native debug host check",
        program: file,
        method: "calculate",
      },
    );
    assert.equal(started, true);
    await wait((m) => m.event === "stopped");
    const session = vscode.debug.activeDebugSession;
    assert.ok(session);
    if (sharedProof) {
      assert.equal(api.objectExplorer.session.client, undefined, 'Debug launch releases its inspection lease automatically');
      await assert.rejects(api.objectExplorer.session.connect(), /operation|wait/i);
      assert.equal(vscode.debug.activeDebugSession, session, 'An inspection attempt must not terminate a paused debugger');
    }

    let stack = await session.customRequest("stackTrace", { threadId: 1 });
    assert.equal(
      stack.stackFrames[0].line,
      firstLine + 1,
      JSON.stringify(stack),
    );
    assert.equal(
      path.resolve(stack.stackFrames[0].source.path).toLowerCase(),
      file.toLowerCase(),
    );
    const locals = async () =>
      session.customRequest("variables", { variablesReference: 1 });
    let values = await locals();
    assert.equal(values.variables.find((v) => v.name === "answer").value, "0");
    let count = messages.filter((m) => m.event === "stopped").length;
    await session.customRequest("next", { threadId: 1 });
    await wait(
      (m) =>
        m.event === "stopped" &&
        messages.filter((x) => x.event === "stopped").length > count,
    );
    stack = await session.customRequest("stackTrace", { threadId: 1 });
    assert.equal(stack.stackFrames[0].line, secondLine + 1);
    values = await locals();
    assert.equal(values.variables.find((v) => v.name === "answer").value, "40");
    count = messages.filter((m) => m.event === "stopped").length;
    await session.customRequest("continue", { threadId: 1 });
    await wait(
      (m) =>
        m.event === "stopped" &&
        messages.filter((x) => x.event === "stopped").length > count,
    );
    values = await locals();
    assert.equal(values.variables.find((v) => v.name === "answer").value, "42");
    stack = await session.customRequest("stackTrace", { threadId: 1 });
    assert.equal(stack.stackFrames[0].line, returnLine + 1);
    vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
    await session.customRequest("continue", { threadId: 1 });
    await wait((m) => m.event === "terminated");
    assert.ok(
      messages.some((m) => m.event === "exited" && m.body.exitCode === 0),
    );
    await stopSession(session);
    const before = messages.filter((m) => m.event === "stopped").length;
    assert.equal(
      await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], {
        type: "jade-native-experimental",
        request: "launch",
        name: "Native string debug check",
        program: file,
        method: "greeting",
      }),
      true,
    );
    await wait(
      (m) =>
        m.event === "stopped" &&
        messages.filter((x) => x.event === "stopped").length > before,
    );
    const greetingSession = vscode.debug.activeDebugSession;
    const stops = messages.filter((m) => m.event === "stopped").length;
    await greetingSession.customRequest("next", { threadId: 1 });
    await wait(
      (m) =>
        m.event === "stopped" &&
        messages.filter((x) => x.event === "stopped").length > stops,
    );
    const greetingLocals = await greetingSession.customRequest("variables", {
      variablesReference: 1,
    });
    assert.equal(
      greetingLocals.variables.find((v) => v.name === "message").value,
      "Hello from native Jade",
    );
    const ended = messages.filter((m) => m.event === "terminated").length;
    await greetingSession.customRequest("continue", { threadId: 1 });
    await wait(
      (m) =>
        m.event === "terminated" &&
        messages.filter((x) => x.event === "terminated").length > ended,
    );
    assert.ok(
      messages.some(
        (m) =>
          m.event === "output" &&
          m.body.output.includes("Hello from native Jade"),
      ),
    );

    await stopSession(greetingSession);
    const stackFile = path.join(root, "VsCodeStackProbe.cls");
    fs.writeFileSync(stackFile, STACK_SOURCE);
    const stackDocument = await vscode.workspace.openTextDocument(stackFile);
    await vscode.window.showTextDocument(stackDocument);
    let stopCount = messages.filter((m) => m.event === "stopped").length;
    assert.equal(
      await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], {
        type: "jade-native-experimental",
        request: "launch",
        name: "Native stack and objects check",
        program: stackFile,
        method: "entry",
      }),
      true,
    );
    await wait(
      (m) =>
        m.event === "stopped" &&
        messages.filter((x) => x.event === "stopped").length > stopCount,
    );
    const stackSession = vscode.debug.activeDebugSession;
    let nested;
    for (let i = 0; i < 60; i++) {
      nested = await stackSession.customRequest("stackTrace", { threadId: 1 });
      if (nested.stackFrames[0].name === "VsCodeStackProbe::inner") break;
      stopCount = messages.filter((m) => m.event === "stopped").length;
      await stackSession.customRequest("stepIn", { threadId: 1 });
      await wait(
        (m) =>
          m.event === "stopped" &&
          messages.filter((x) => x.event === "stopped").length > stopCount,
      );
    }
    assert.deepEqual(
      nested.stackFrames.map((f) => f.name),
      ["VsCodeStackProbe::inner", "VsCodeStackProbe::entry"],
    );
    assert.equal(
      nested.stackFrames[1].line,
      STACK_SOURCE.split("\n").findIndex((line) =>
        line.includes("return child.inner"),
      ) + 1,
      "Native caller line must identify the suspended call.",
    );
    const selectedLocals = async (frame) => {
      const scope = await stackSession.customRequest("scopes", {
        frameId: frame.id,
      });
      return stackSession.customRequest("variables", {
        variablesReference: scope.scopes[0].variablesReference,
      });
    };
    const innerLocals = await selectedLocals(nested.stackFrames[0]);
    const callerLocals = await selectedLocals(nested.stackFrames[1]);
    assert.equal(innerLocals.variables.find((v) => v.name === "n").value, "40");
    assert.equal(
      callerLocals.variables.find((v) => v.name === "callerValue").value,
      "99",
    );
    const innerSelf = innerLocals.variables.find((v) => v.name === "self");
    assert.ok(innerSelf.variablesReference > 0);
    const child = await stackSession.customRequest("variables", {
      variablesReference: innerSelf.variablesReference,
    });
    assert.equal(child.variables.find((v) => v.name === "name").value, "Young");
    const parent = child.variables.find((v) => v.name === "parent");
    assert.ok(parent.variablesReference > 0);
    const expandedParent = await stackSession.customRequest("variables", {
      variablesReference: parent.variablesReference,
    });
    assert.equal(
      expandedParent.variables.find((v) => v.name === "name").value,
      "Parent",
    );
    assert.equal(
      expandedParent.variables.find((v) => v.name === "child")
        .variablesReference,
      innerSelf.variablesReference,
    );
    const objects = child.variables.find((v) => v.name === "objects");
    assert.equal(objects.indexedVariables, 2);
    const objectEntries = await stackSession.customRequest("variables", {
      variablesReference: objects.variablesReference,
      filter: "indexed",
      start: 0,
      count: 2,
    });
    assert.equal(
      objectEntries.variables[1].variablesReference,
      innerSelf.variablesReference,
    );
    const strings = child.variables.find((v) => v.name === "strings");
    const stringEntries = await stackSession.customRequest("variables", {
      variablesReference: strings.variablesReference,
      filter: "indexed",
      start: 1,
      count: 1,
    });
    assert.deepEqual(
      stringEntries.variables.map((v) => v.value),
      ["second"],
    );
    const byName = child.variables.find((v) => v.name === "byName");
    const dictionary = await stackSession.customRequest("variables", {
      variablesReference: byName.variablesReference,
      filter: "indexed",
      start: 0,
      count: 2,
    });
    assert.deepEqual(
      dictionary.variables.map((v) => v.name),
      ["[Parent]", "[Young]"],
    );
    if (process.env.JADE_DEBUG_UI_HOLD) {
      fs.writeFileSync(
        path.resolve(root, "../debug-paused.json"),
        JSON.stringify(
          {
            workspace: root,
            frames: nested.stackFrames,
            inner: innerLocals.variables,
            caller: callerLocals.variables,
            child: child.variables,
            parent: expandedParent.variables,
          },
          null,
          2,
        ),
      );
      await vscode.commands.executeCommand("workbench.view.debug");
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(
            120000,
            Math.max(1000, Number(process.env.JADE_DEBUG_UI_HOLD) || 60000),
          ),
        ),
      );
    }
    const terminatedCount = messages.filter(
      (m) => m.event === "terminated",
    ).length;
    await stackSession.customRequest("continue", { threadId: 1 });
    await wait(
      (m) =>
        m.event === "terminated" &&
        messages.filter((x) => x.event === "terminated").length >
          terminatedCount,
    );
    if (sharedProof) {
      await stopSession(stackSession);
      await connectInspectionAndCapture('inspection-after-debug');
      await api.objectExplorer.releaseForOperation();
    }
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          sharedInspectionDebugHandoff: sharedProof,
          pausedDebuggerProtected: sharedProof,
          lazyInspectionAfterDebug: sharedProof,
          callerSourcePositions: true,
          nativeCollectionsAndKeys: true,
          fullNativeStack: true,
          selectedCallerLocals: true,
          expandableObjects: true,
          cyclicReferences: true,
          passed: true,
          version: extension.packageJSON.version,
          breakpoint: true,
          editorBreakpointToggle: true,
          stepOver: true,
          locals: [0, 40, 42],
          stringInspectionAndReturn: true,
          sourceLinesCorrect: true,
          noPython: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    fs.writeFileSync(
      report,
      JSON.stringify(
        { passed: false, error: error.stack, messages: messages.slice(-20) },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    tracker?.dispose();
    await vscode.debug.stopDebugging();
  }
}
const STACK_SOURCE = `jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
VsCodeStackProbe subclassOf Object transient;
VsCodeStackProbeByName subclassOf MemberKeyDictionary transient;
membershipDefinitions
VsCodeStackProbeByName of VsCodeStackProbe;
typeDefinitions
VsCodeStackProbe completeDefinition
(
attributeDefinitions
 name: String[50];
 birthDate: Date;
referenceDefinitions
 child: VsCodeStackProbe;
 parent: VsCodeStackProbe;
 objects: ObjectArray;
 strings: StringArray;
 members: ObjectSet;
 byName: VsCodeStackProbeByName;
jadeMethodDefinitions
 entry() : Integer updating;
 inner(n : Integer) : Integer;
)
VsCodeStackProbeByName completeDefinition
(
)
memberKeyDefinitions
VsCodeStackProbeByName completeDefinition
(
 name;
)
typeSources
VsCodeStackProbe (
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
module.exports = { run };
