"use strict";
const { ImpactModel } = require("./impact-model");
const { sourcePosition } = require("./source_symbols");
function registerImpactNavigation(vscode, context, language) {
  const selector = { language: "jade-nz", scheme: "file" };
  let project, impact;
  function graph() {
    if (project !== language.index.project) {
      project = language.index.project;
      impact = new ImpactModel(project);
    }
    return impact;
  }
  function range(model, start, end) {
    const a = sourcePosition(model, start),
      b = sourcePosition(model, end);
    return new vscode.Range(a.line, a.character, b.line, b.character);
  }
  function item(symbol) {
    if (!symbol?.model) return;
    const result = new vscode.CallHierarchyItem(
      vscode.SymbolKind.Method,
      symbol.name,
      `${symbol.schema}::${symbol.owner} · workspace source`,
      vscode.Uri.parse(symbol.model.uri),
      range(symbol.model, symbol.start, symbol.end),
      range(
        symbol.model,
        symbol.selection,
        symbol.selection + symbol.name.length,
      ),
    );
    return result;
  }
  function current(value, token) {
    const model = graph();
    if (!model.refresh(token)) return;
    // VS Code transfers only the public CallHierarchyItem fields to its UI.
    return model.symbols.find(
      (symbol) =>
        symbol.kind === "method" &&
        symbol.model?.uri === value?.uri?.toString() &&
        symbol.name === value.name &&
        `${symbol.schema}::${symbol.owner} · workspace source` === value.detail,
    );
  }
  const provider = {
    async prepareCallHierarchy(document, position, token) {
      if (!(await language.ready(document, token))) return;
      graph();
      const model = language.model(document),
        offset = document.offsetAt(position),
        symbol = project.referenceAt(model, offset)?.symbol;
      if (symbol?.kind === "method") return item(symbol);
      const owner = project.context(model, offset),
        method = owner.owner?.members.find(
          (m) => m.name === owner.method?.name && m.kind === "method",
        );
      return item(method);
    },
    async provideCallHierarchyIncomingCalls(value, token) {
      if (!(await language.ready(undefined, token))) return [];
      if (!(await graph().ready(language.index.read, token))) return [];
      const symbol = current(value, token);
      if (!symbol) return [];
      return graph()
        .incoming(symbol, token)
        .map(
          (edge) =>
            new vscode.CallHierarchyIncomingCall(
              item(edge.symbol),
              edge.sites.map((site) => range(site.model, site.start, site.end)),
            ),
        );
    },
    async provideCallHierarchyOutgoingCalls(value, token) {
      if (!(await language.ready(undefined, token))) return [];
      if (!(await graph().ready(language.index.read, token))) return [];
      const symbol = current(value, token);
      if (!symbol) return [];
      return graph()
        .outgoing(symbol, token)
        .map(
          (edge) =>
            new vscode.CallHierarchyOutgoingCall(
              item(edge.symbol),
              edge.sites.map((site) => range(site.model, site.start, site.end)),
            ),
        );
    },
  };
  context.subscriptions.push(
    vscode.languages.registerCallHierarchyProvider(selector, provider),
    vscode.languages.registerReferenceProvider(selector, {
      async provideReferences(document, position, options, token) {
        if (!(await language.ready(document, token))) return [];
        const model = language.model(document),
          symbol = language.index.project.referenceAt(
            model,
            document.offsetAt(position),
          )?.symbol;
        if (!symbol) return [];
        return (
          await graph().referencesAsync(
            symbol,
            options.includeDeclaration,
            language.index.read,
            token,
          )
        ).map(
          (site) =>
            new vscode.Location(
              vscode.Uri.parse(site.model.uri),
              range(site.model, site.start, site.end),
            ),
        );
      },
    }),
    vscode.languages.registerImplementationProvider(selector, {
      async provideImplementation(document, position, token) {
        if (!(await language.ready(document, token))) return [];
        const model = language.model(document),
          symbol = language.index.project.referenceAt(
            model,
            document.offsetAt(position),
          )?.symbol;
        if (!symbol) return [];
        return graph()
          .implementations(symbol, token)
          .map(
            (target) =>
              new vscode.Location(
                vscode.Uri.parse(target.model.uri),
                range(
                  target.model,
                  target.selection,
                  target.selection + target.name.length,
                ),
              ),
          );
      },
    }),
    vscode.commands.registerCommand(
      "jadeNative.showCallHierarchy",
      async (row) => {
        if (row?.file)
          await vscode.commands.executeCommand(
            "jadeNative.showClassMember",
            row,
          );
        await vscode.commands.executeCommand("editor.showCallHierarchy");
      },
    ),
    vscode.commands.registerCommand(
      "jadeNative.showReferences",
      async (row) => {
        if (row?.file)
          await vscode.commands.executeCommand(
            "jadeNative.showClassMember",
            row,
          );
        await vscode.commands.executeCommand(
          "editor.action.referenceSearch.trigger",
        );
      },
    ),
  );
  return provider;
}
module.exports = { registerImpactNavigation };
