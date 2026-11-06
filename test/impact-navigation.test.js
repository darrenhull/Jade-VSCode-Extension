"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { LanguageModel } = require("../extension/src/language-model"),
  { parseSource, sourcePosition } = require("../extension/src/source_symbols");
const {
  registerImpactNavigation,
} = require("../extension/src/impact-navigation");
test("call hierarchy survives VS Code DTO conversion without extension-specific item fields", async () => {
  const model = parseSource(
    "schemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\njadeMethodDefinitions\nfeed();\nswim();\n)\ntypeSources\nFish (\njadeMethodSources\nfeed\n{\nfeed();\nbegin\nself.swim();\nend;\n}\nswim\n{\nswim();\nbegin\nend;\n}\n)",
    "file:///Fish.cls",
  );
  const project = new LanguageModel();
  project.update(model);
  class Item {
    constructor(kind, name, detail, uri, range, selectionRange) {
      Object.assign(this, { kind, name, detail, uri, range, selectionRange });
    }
  }
  const disposable = { dispose() {} },
    vscode = {
      SymbolKind: { Method: 6 },
      Uri: { parse: (uri) => ({ toString: () => uri }) },
      Range: class {
        constructor(a, b, c, d) {
          this.start = { line: a, character: b };
          this.end = { line: c, character: d };
        }
      },
      CallHierarchyItem: Item,
      CallHierarchyIncomingCall: class {
        constructor(from, fromRanges) {
          Object.assign(this, { from, fromRanges });
        }
      },
      CallHierarchyOutgoingCall: class {
        constructor(to, fromRanges) {
          Object.assign(this, { to, fromRanges });
        }
      },
      languages: {
        registerCallHierarchyProvider: () => disposable,
        registerReferenceProvider: () => disposable,
        registerImplementationProvider: () => disposable,
      },
      commands: { registerCommand: () => disposable },
    };
  const document = { offsetAt: () => model.text.indexOf("swim\n{") };
  const provider = registerImpactNavigation(
    vscode,
    { subscriptions: [] },
    { index: { project }, ready: async () => true, model: () => model },
  );
  const prepared = await provider.prepareCallHierarchy(
    document,
    sourcePosition(model, document.offsetAt()),
  );
  // The public VS Code CallHierarchyItem fields survive protocol transport.
  const converted = new Item(
    prepared.kind,
    prepared.name,
    prepared.detail,
    prepared.uri,
    prepared.range,
    prepared.selectionRange,
  );
  const incoming = await provider.provideCallHierarchyIncomingCalls(converted);
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].from.name, "feed");
});
