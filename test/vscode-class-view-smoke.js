"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vscode = require("vscode");
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath,
    report = path.resolve(root, "../host-report.json");
  let controller;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function wait(predicate, label) {
    for (let n = 0; n < 100; n++) {
      if (predicate()) return;
      await delay(50);
    }
    throw Error("Timed out: " + label);
  }
  async function bounded(promise, label) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("Timed out: " + label)), 20000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const tabs = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs),
    previewTabs = () =>
      tabs().filter(
        (tab) =>
          tab.input instanceof vscode.TabInputWebview &&
          tab.input.viewType.endsWith("jadeSourceMember"),
      );
  function assertNoGeneratedTextTabs() {
    assert.deepEqual(
      tabs()
        .filter(
          (tab) =>
            tab.input instanceof vscode.TabInputText &&
            ["jade-member", "untitled"].includes(tab.input.uri.scheme),
        )
        .map((tab) => tab.input.uri.toString()),
      [],
    );
  }
  try {
    const file = path.join(root, "ViewerFish.cls"),
      text = `jadeVersionNumber "25.0.02";
schemaDefinition
ViewerPets subschemaOf RootSchema partialDefinition;
typeHeaders
ViewerFish subclassOf Object transient;
typeDefinitions
ViewerFish completeDefinition
(
constantDefinitions
 MaxLength: Integer = 100;
attributeDefinitions
 name: String[50];
referenceDefinitions
 tank: Object;
jadeMethodDefinitions
 getName() : String;
)
typeSources
ViewerFish (
jadeMethodSources
getName
{
getName() : String;
begin
 return self.name;
end;
}
)`;
    fs.writeFileSync(file, text);
    const gridDirectory = path.join(root, "grid");
    fs.mkdirSync(gridDirectory, { recursive: true });
    for (let index = 0; index < 205; index++) {
      const name = "Grid" + String(index).padStart(3, "0");
      fs.writeFileSync(
        path.join(gridDirectory, name + ".cls"),
        text
          .replaceAll("ViewerPets", "GridSchema")
          .replaceAll("ViewerFish", name),
      );
    }

    fs.writeFileSync(
      path.join(root, "ViewerBird.cls"),
      text
        .replaceAll("ViewerFish", "ViewerBird")
        .replace("return self.name;", 'return "Bird preview";'),
    );
    fs.writeFileSync(
      path.join(root, "AlternateFish.cls"),
      text
        .replaceAll("ViewerPets", "ViewerOtherPets")
        .replace("return self.name;", 'return "Other schema preview";'),
    );
    fs.writeFileSync(
      path.join(root, "EmptySchema.scm"),
      'jadeVersionNumber "25.0.02";\nschemaDefinition\nEmptySchema subschemaOf RootSchema completeDefinition;\n',
    );
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    const initialGroups = vscode.window.tabGroups.all.length;
    const extension = vscode.extensions.getExtension(
        "jade-local-tools.jade-native-runner-cpp-preview",
      ),
      api = await extension.activate();
    await vscode.commands.executeCommand("jadeNative.refreshClassView");
    controller = api.classView.previewController;
    assert.ok(controller?.records instanceof Map);
    const provider = api.classView.provider,
      schemas = await provider.getChildren(),
      schema = schemas.find((row) => row.name === "ViewerPets"),
      otherSchema = schemas.find((row) => row.name === "ViewerOtherPets");
    assert.ok(schema);
    assert.ok(otherSchema);
    const empty = schemas.find((row) => row.name === "EmptySchema");
    assert.ok(empty);
    const emptyFiles = await provider.getChildren(empty);
    assert.equal(emptyFiles[0].label, "Schema & resources");
    assert.equal(
      (await provider.getChildren(emptyFiles[0]))[0].name,
      "Schema definition",
    );
    const classes = await provider.getChildren(schema),
      cls = classes.find((row) => row.name === "ViewerFish"),
      bird = classes.find((row) => row.name === "ViewerBird"),
      otherFish = (await provider.getChildren(otherSchema)).find(
        (row) => row.name === "ViewerFish",
      ),
      groups = await provider.getChildren(cls);
    assert.deepEqual(groups.map((group) => group.label).sort(), [
      "Constants",
      "Inheritance",
      "Methods",
      "Properties",
      "References",
    ]);
    async function member(owner, group) {
      const children = await provider.getChildren(owner),
        section = children.find((row) => row.label === group);
      return (await provider.getChildren(section))[0];
    }
    const method = await member(cls, "Methods"),
      property = await member(cls, "Properties");
    assert.equal(provider.getParent(method).label, "Methods");
    await api.classView.view.reveal(method, {
      select: true,
      focus: false,
      expand: true,
    });
    async function preview(row) {
      const item = provider.getTreeItem(row);
      assert.equal(item.command.command, "jadeNative.previewClassMember");
      const result = await bounded(
        vscode.commands.executeCommand(
          item.command.command,
          ...item.command.arguments,
        ),
        "preview command rendered",
      );
      const record = controller.records.get(row.schema + "::" + row.owner);
      assert.ok(record, "Per-class panel record must exist");
      await bounded(record.rendered, "webview render ACK");
      assert.equal(
        record.lastRenderedRevision,
        record.revision,
        "Actual webview must acknowledge rendered content",
      );
      assert.equal(record.panel.title, row.schema + "::" + row.owner);
      assert.equal(result.readOnly, true);
      assertNoGeneratedTextTabs();
      assert.equal(
        vscode.window.tabGroups.all.length,
        initialGroups,
        "Member previews must reuse the active column",
      );
      return { record, result };
    }
    let selected = await preview(method),
      first = selected.record;
    await wait(() => previewTabs().length === 1, "first class tab");
    assert.match(first.content.text, /return self.name/);
    assert.doesNotMatch(first.content.text, /typeHeaders/);
    const firstPanel = first.panel;
    await vscode.commands.executeCommand("jadeNative.openOriginalSource");
    assert.equal(
      vscode.window.activeTextEditor.document.uri.toString(),
      doc.uri.toString(),
    );
    assert.equal(
      vscode.window.activeTextEditor.selection.start.line,
      text.split("\n").findIndex((line) => line === "getName"),
    );
    selected = await preview(property);
    assert.equal(selected.record.panel, firstPanel);
    assert.equal(selected.result.reused, true);
    assert.match(first.content.text, /name:\s*String\[50\]/);
    assert.doesNotMatch(first.content.text, /return self.name|typeHeaders/);
    await preview(property);
    assert.equal(previewTabs().length, 1);
    assert.equal(controller.records.size, 1);
    await vscode.commands.executeCommand("jadeNative.openOriginalSource");
    assert.equal(
      vscode.window.activeTextEditor.document.uri.toString(),
      doc.uri.toString(),
    );
    assert.equal(
      vscode.window.activeTextEditor.selection.start.line,
      text.split("\n").findIndex((line) => line.trim() === "name: String[50];"),
    );
    await preview(method);
    assert.equal(first.panel, firstPanel);
    assert.equal(previewTabs().length, 1);
    const offset = doc.getText().indexOf("return self.name"),
      edit = new vscode.WorkspaceEdit();
    edit.replace(
      doc.uri,
      new vscode.Range(
        doc.positionAt(offset),
        doc.positionAt(offset + "return self.name".length),
      ),
      'return "Unsaved viewer change"',
    );
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    await wait(
      () => first.content.text.includes("Unsaved viewer change"),
      "live unsaved preview",
    );
    await bounded(first.rendered, "unsaved webview render ACK");
    assert.equal(first.lastRenderedRevision, first.revision);
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /Unsaved viewer change/);
    const firstText = first.content.text;
    const birdMethod = await member(bird, "Methods"),
      birdView = await preview(birdMethod);
    await wait(() => previewTabs().length === 2, "second class tab");
    assert.notEqual(birdView.record.panel, firstPanel);
    assert.equal(first.content.text, firstText);
    assert.match(birdView.record.content.text, /Bird preview/);
    const birdText = birdView.record.content.text;
    const otherMethod = await member(otherFish, "Methods"),
      otherView = await preview(otherMethod);
    await wait(
      () => previewTabs().length === 3,
      "same named class in another schema tab",
    );
    assert.notEqual(otherView.record.panel, firstPanel);
    assert.equal(first.content.text, firstText);
    assert.equal(birdView.record.content.text, birdText);
    assert.match(otherView.record.content.text, /Other schema preview/);
    await preview(await member(otherFish, "Properties"));
    assert.equal(first.content.text, firstText);
    assert.equal(birdView.record.content.text, birdText);
    birdView.record.panel.dispose();
    await wait(
      () =>
        !controller.records.has("ViewerPets::ViewerBird") &&
        previewTabs().length === 2,
      "disposed class panel cleanup",
    );
    const reopened = await preview(birdMethod);
    assert.equal(reopened.result.reused, false);
    assert.notEqual(reopened.record.panel, birdView.record.panel);
    await wait(
      () => previewTabs().length === 3,
      "closed class reopens as one fresh tab",
    );
    assert.equal(first.content.text, firstText);
    await preview(method);
    await vscode.commands.executeCommand("jadeNative.openOriginalSource");
    assert.equal(
      vscode.window.activeTextEditor.document.uri.toString(),
      doc.uri.toString(),
    );
    const outline = await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      doc.uri,
    );
    assert.deepEqual(outline[0].children.map((row) => row.name).sort(), [
      "Constants",
      "Methods",
      "Properties",
      "References",
    ]);
    if (process.env.JADE_CLASS_UI_HOLD === "1") {
      await preview(method);
      await vscode.commands.executeCommand("jadeNative.classes.focus");
      await delay(60000);
    }
    const labels = previewTabs()
      .map((tab) => tab.label)
      .sort();
    assert.deepEqual(labels, [
      "ViewerOtherPets::ViewerFish",
      "ViewerPets::ViewerBird",
      "ViewerPets::ViewerFish",
    ]);
    for (const record of [...controller.records.values()])
      record.panel.dispose();
    await wait(
      () => controller.records.size === 0 && previewTabs().length === 0,
      "all class preview tabs cleaned up",
    );
    assertNoGeneratedTextTabs();
    await vscode.commands.executeCommand("jadeNative.browseSourceClasses");
    const catalogue = api.classView.catalogue;
    assert.ok(
      catalogue,
      "Source search must expose persistent catalogue controller",
    );
    const cataloguePanel = catalogue.panel;
    await catalogue.setFilter({ query: "", schema: "GridSchema", offset: 0 });
    await wait(
      () => catalogue.renderedRevision === catalogue.snapshot().revision,
      "catalogue native DOM rendering",
    );
    assert.equal(catalogue.snapshot().page.total, 205);
    assert.equal(catalogue.snapshot().page.items.length, 100);
    assert.equal(catalogue.renderedRows, 100);
    await catalogue.setFilter({ query: "", schema: "GridSchema", offset: 100 });
    await wait(
      () => catalogue.renderedRevision === catalogue.snapshot().revision,
      "catalogue second page DOM",
    );
    assert.equal(catalogue.snapshot().page.offset, 100);
    assert.equal(catalogue.renderedRows, 100);
    await catalogue.setFilter({
      query: "Grid204",
      schema: "GridSchema",
      offset: 0,
    });
    await wait(
      () => catalogue.renderedRevision === catalogue.snapshot().revision,
      "catalogue full metadata search DOM",
    );
    assert.equal(catalogue.snapshot().page.total, 1);
    assert.equal(catalogue.snapshot().suggestions.length, 1);
    assert.equal(catalogue.renderedRows, 1);
    const found = catalogue.snapshot().page.items[0];
    await catalogue.open(found.browserId);
    await wait(
      () => api.classView.view.selection.some((row) => row.name === "Grid204"),
      "catalogue class selection reveals source tree",
    );
    await vscode.commands.executeCommand("jadeNative.browseSourceClasses");
    assert.equal(catalogue.panel, cataloguePanel);
    assert.equal(vscode.window.tabGroups.all.length, initialGroups);
    assert.equal(
      tabs().filter(
        (tab) =>
          tab.input instanceof vscode.TabInputWebview &&
          tab.input.viewType.endsWith("jadeClassCatalogue"),
      ).length,
      1,
    );
    assertNoGeneratedTextTabs();
    catalogue.panel.dispose();
    await wait(() => !catalogue.panel, "catalogue disposed");
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          passed: true,
          version: extension.packageJSON.version,
          schemaClassTree: true,
          groupedMembers: true,
          defaultMethodPreview: true,
          defaultPropertyPreview: true,
          sameClassStableTab: true,
          repeatedMemberNoExtraTab: true,
          differentClassesSeparateTabs: true,
          sameNameDifferentSchemasSeparateTabs: true,
          hiddenTabsPreserveContent: true,
          actualWebviewRenderAcknowledged: true,
          noEditorSplits: true,
          noGeneratedTextTabs: true,
          closeReopenCleanup: true,
          explicitOriginalSource: true,
          sourceSelection: true,
          liveUnsavedPreview: true,
          originalSourceNavigation: true,
          groupedOutline: true,
          classTabs: labels,
          persistentClassCatalogue: true,
          tablePaged100: true,
          fullMetadataAutocomplete: true,
          catalogueOpensTreeClass: true,
          catalogueActualDOMRendering: true,
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
  } finally {
    if (controller)
      for (const record of [...controller.records.values()])
        record.panel.dispose();
  }
}
module.exports = { run };
