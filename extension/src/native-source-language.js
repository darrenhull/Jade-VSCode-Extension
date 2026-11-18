'use strict';
// Render native context/ranges. No XML, CLS parser, language graph or file scan.
function registerNativeSourceLanguage(vscode, context, workspace) {
  const selector = { language: 'jade-nz', scheme: 'jade-source' };
  const range = value => new vscode.Range(value.start.line, value.start.character, value.end.line, value.end.character);
  const binding = document => workspace.record(document.uri).document;
  const contains = (value, point) => value &&
    (point.line > value.start.line || point.line === value.start.line && point.character >= value.start.character) &&
    (point.line < value.end.line || point.line === value.end.line && point.character < value.end.character);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document) {
        const native = binding(document);
        // Native context belongs to the opened revision. Dirty edits do not
        // cause a speculative JS reparse or background revision replacement.
        return [...(native.context?.parameters || []), ...(native.context?.symbols || [])].map(symbol => ({
          label: symbol.name, detail: symbol.signature || symbol.kind, insertText: symbol.insertText || symbol.name,
          documentation: symbol.documentation
        }));
      }
    }, '.'),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        if (document.isDirty) return;
        const native = binding(document);
        const symbol = [...(native.context?.symbols || []), ...(native.context?.parameters || [])]
          .find(value => contains(value.range || value.selectionRange, position));
        if (!symbol) return;
        const text = new vscode.MarkdownString(); text.isTrusted = false; text.supportHtml = false;
        text.appendCodeblock(symbol.signature || symbol.name, 'jade-nz');
        if (symbol.documentation) text.appendText('\n' + symbol.documentation);
        return new vscode.Hover(text, range(symbol.range || symbol.selectionRange));
      }
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position, token) {
        const { project, document: native } = workspace.record(document.uri);
        const reference = native.context?.references?.find(value => contains(value.range, position));
        if (!reference?.entityId || document.isDirty) return;
        const uri = await project.files.open(reference.entityId, token);
        const target = project.files.binding(uri).projection.selectionRange;
        return target ? new vscode.Location(uri, range(target)) : undefined;
      }
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        if (document.isDirty) return;
        return (binding(document).members || []).filter(member => member.range && member.selectionRange).map(member =>
          new vscode.DocumentSymbol(member.name, member.signature || member.kind,
            vscode.SymbolKind[member.kind === 'method' ? 'Method' : member.kind === 'constant' ? 'Constant' : 'Property'],
            range(member.range), range(member.selectionRange)));
      }
    })
  );
  return { binding };
}
module.exports = { registerNativeSourceLanguage };
