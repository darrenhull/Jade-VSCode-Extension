"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    report = path.resolve(root, "../host-report.json");
  try {
    const source = `schemaDefinition\nImpactPets subschemaOf RootSchema partialDefinition;
typeHeaders
ImpactFish subclassOf Object transient;
typeDefinitions
ImpactFish completeDefinition
(
attributeDefinitions
 name: String[30];
jadeMethodDefinitions
 feed();
 swim();
)
typeSources
ImpactFish (
jadeMethodSources
feed
{
feed();
begin
 self.swim(); self.swim();
end;
}
swim
{
swim();
begin
 self.name := "Bubbles";
end;
}
)`;
    const file = path.join(root, "ImpactFish.cls");
    fs.writeFileSync(file, source);
    const child = source
      .replaceAll("ImpactFish", "ImpactSmallFish")
      .replace("subclassOf Object", "subclassOf ImpactFish")
      .replace(" name: String[30];", "")
      .replace("self.swim(); self.swim();", "inheritMethod();");
    fs.mkdirSync(path.join(root, "unrelated"), { recursive: true });
    fs.writeFileSync(path.join(root, "unrelated", "Child.cls"), child);
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    const extension = vscode.extensions.getExtension(
      "jade-local-tools.jade-native-runner-cpp-preview",
    );
    await extension.activate();
    await vscode.commands.executeCommand("jadeNative.refreshClassView");
    const feedPosition = doc.positionAt(source.indexOf("feed\n{"));
    const prepared = await vscode.commands.executeCommand(
      "vscode.prepareCallHierarchy",
      doc.uri,
      feedPosition,
    );
    assert.equal(prepared[0].name, "feed");
    const outgoing = await vscode.commands.executeCommand(
      "vscode.provideOutgoingCalls",
      prepared[0],
    );
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].to.name, "swim");
    assert.equal(outgoing[0].fromRanges.length, 2);
    const incoming = await vscode.commands.executeCommand(
      "vscode.provideIncomingCalls",
      outgoing[0].to,
    );
    assert.ok(
      incoming.some(
        (call) => call.from.name === "feed" && call.fromRanges.length === 2,
      ),
    );
    const implementations = await vscode.commands.executeCommand(
      "vscode.executeImplementationProvider",
      doc.uri,
      doc.positionAt(source.indexOf("swim\n{")),
    );
    assert.equal(implementations.length, 1);
    assert.match(implementations[0].uri.fsPath, /Child.cls$/);
    const references = await vscode.commands.executeCommand(
      "vscode.executeReferenceProvider",
      doc.uri,
      doc.positionAt(source.indexOf("name: String")),
    );
    assert.ok(
      references.some(
        (reference) =>
          reference.range.start.line ===
          source.split("\n").findIndex((line) => line.includes("self.name :=")),
      ),
    );
    // Edit only the open buffer: the hierarchy must update without a save/load/database.
    const edit = new vscode.WorkspaceEdit(),
      at = doc.getText().indexOf("self.swim(); self.swim();");
    edit.replace(
      doc.uri,
      new vscode.Range(
        doc.positionAt(at),
        doc.positionAt(at + "self.swim(); self.swim();".length),
      ),
      "self.swim();",
    );
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    const refreshed = await vscode.commands.executeCommand(
      "vscode.provideOutgoingCalls",
      prepared[0],
    );
    assert.equal(refreshed[0].fromRanges.length, 1);
    const inheritedCall = await vscode.commands.executeCommand(
      "vscode.provideIncomingCalls",
      prepared[0],
    );
    assert.ok(
      inheritedCall.some((call) =>
        call.from.detail.startsWith("ImpactPets::ImpactSmallFish"),
      ),
    );
    if (process.env.JADE_IMPACT_UI_HOLD === "1") {
      const editor = await vscode.window.showTextDocument(doc);
      editor.selection = new vscode.Selection(feedPosition, feedPosition);
      await vscode.commands.executeCommand("editor.showCallHierarchy");
      await new Promise((resolve) => setTimeout(resolve, 90000));
    }
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          passed: true,
          version: extension.packageJSON.version,
          nativeCallHierarchy: true,
          incomingOutgoing: true,
          multipleCallSites: true,
          implementations: true,
          propertyReferences: true,
          unsavedEdits: true,
          noDatabase: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    fs.writeFileSync(
      report,
      JSON.stringify({ passed: false, error: error.stack }, null, 2),
    );
    throw error;
  }
}
module.exports = { run };
