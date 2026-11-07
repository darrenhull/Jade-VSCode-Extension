'use strict';
const { MethodDocumentBinding } = require('./method-document-binding');

/** Supported custom text editor: VS Code owns saving, hot exit and undo/redo. */
class ClassWorkspaceEditorProvider {
  constructor(vscode, createView) { this.vscode = vscode; this.createView = createView; this.views = new Set(); }

  async resolveCustomTextEditor(document, panel) {
    const vscode = this.vscode;
    const binding = new MethodDocumentBinding(document, async (start, end, text, version) => {
      if (document.isClosed || document.version !== version) return false;
      if (vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) === false) throw new Error('The original source filesystem is read-only.');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(document.positionAt(start), document.positionAt(end)), text);
      return vscode.workspace.applyEdit(edit);
    });
    const disposables = [];
    const session = { document, panel, binding, services: this.services(document, binding, panel) };
    this.views.add(session);
    let closed = false;
    session.isClosed = () => closed;
    const close = () => {
      if (closed) return;
      closed = true; this.views.delete(session); binding.dispose();
      for (const item of disposables.splice(0)) item.dispose();
    };
    disposables.push(panel.onDidDispose(close));
    disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === document) binding.changed(event.contentChanges);
    }));
    try {
      if (vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) === false) binding.readOnlyReason = 'The original source filesystem is read-only.';
      else if (vscode.workspace.fs.stat) {
        try {
          const stat = await vscode.workspace.fs.stat(document.uri);
          if (stat.permissions & (vscode.FilePermission?.Readonly || 1)) binding.readOnlyReason = 'The original source file is read-only.';
        } catch (error) { binding.readOnlyReason = 'Original source access could not be verified: ' + error.message; }
      }
      if (closed) return;
      const view = await this.createView(session);
      if (view?.dispose) { if (closed) view.dispose(); else disposables.push(view); }
    } catch (error) {
      close();
      throw error;
    }
  }

  services(document, binding, panel) {
    const vscode = this.vscode;
    const position = offset => document.positionAt(binding.toDocumentOffset(offset));
    const requireActive=()=>{if(document.isClosed||panel?.active!==true)throw new Error('Select this class workspace before undo, redo or source navigation.');};
    const range = value => value ? { start: Math.max(0, document.offsetAt(value.start) - binding.snapshot().start), end: Math.min(binding.snapshot().text.length, document.offsetAt(value.end) - binding.snapshot().start) } : undefined;
    return {
      save: () => document.save(),
      undo: () => {requireActive();return vscode.commands.executeCommand('undo');},
      redo: () => {requireActive();return vscode.commands.executeCommand('redo');},
      openOriginal: () => vscode.window.showTextDocument(document, { preview: false, selection: new vscode.Range(position(0), position(0)) }),
      async completions(offset, trigger) {
        const selected = binding.snapshot();
        const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position(offset), trigger);
        if (document.version !== selected.version || binding.snapshot()?.member !== selected.member || binding.snapshot()?.owner !== selected.owner) return { items: [], incomplete: true };
        return { items: (result?.items || []).slice(0, 100).map(item => ({
          label: typeof item.label === 'string' ? item.label : item.label.label,
          detail: item.detail,
          insertText: typeof item.insertText === 'string' ? item.insertText : item.insertText?.value,
          kind: item.kind,
          range: range(item.range?.replacing || item.range),
          // Additional edits/commands must remain with the original provider; do not silently lose them.
          complex: Boolean(item.additionalTextEdits?.length || item.command || (item.insertText && typeof item.insertText !== 'string')),
        })), incomplete: Boolean(result?.isIncomplete) };
      },
      async definition(offset) {
        requireActive();
        const selected = binding.snapshot();
        const locations = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, position(offset));
        if (panel?.active!==true || document.isClosed || document.version !== selected.version || binding.snapshot()?.member !== selected.member || binding.snapshot()?.owner !== selected.owner) return false;
        const first = locations?.[0];
        if (!first) return false;
        const uri = first.targetUri || first.uri, targetRange = first.targetSelectionRange || first.range;
        await vscode.window.showTextDocument(uri, { preview: true, selection: targetRange });
        return true;
      },
      diagnostics() {
        const selected = binding.snapshot();
        if (!selected?.available) return [];
        return vscode.languages.getDiagnostics(document.uri).filter(item => document.offsetAt(item.range.end) >= selected.start && document.offsetAt(item.range.start) <= selected.end).slice(0, 200).map(item => ({ ...range(item.range), message: item.message, severity: item.severity, source: item.source, code: typeof item.code === 'object' ? item.code.value : item.code }));
      },
      onDiagnostics(listener) {
        return vscode.languages.onDidChangeDiagnostics(event => {
          if (event.uris.some(uri => uri.toString() === document.uri.toString())) listener();
        });
      },
    };
  }

  dispose() { for (const session of this.views) session.panel.dispose(); this.views.clear(); }
}
module.exports = { ClassWorkspaceEditorProvider };
