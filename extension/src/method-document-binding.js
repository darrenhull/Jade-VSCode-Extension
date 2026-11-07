'use strict';
const { parseSource } = require('./source_symbols');
const { classSections } = require('./class-view-model');
const declarationKind = kind => kind === 'property' || kind === 'reference';
const supportedKinds = new Set(['method','typeMethod','property','reference']);

/** Focused member source is a range in its original TextDocument. */
class MethodDocumentBinding {
  constructor(document, applyEdit) {
    this.document = document;
    this.applyEdit = applyEdit;
    this.listeners = new Set();
  }

  select(owner, member, kind = 'method') {
    const found = this.find(owner, member, undefined, kind);
    this.selection = { owner, member, kind, available: Boolean(found), start: found ? declarationKind(kind) ? found.start : found.bodyStart : undefined, end: found ? declarationKind(kind) ? found.end : found.end - 1 : undefined };
    return this.snapshot();
  }

  declarations(owner, kind, model) {
    const text = this.document.getText();
    return classSections(text, this.document.fileName, model).find(item => item.name === owner)?.groups.flatMap(group => group.items).filter(item => {
      if (item.kind !== kind || text[item.end - 1] !== ';') return false;
      const code = model.code.slice(item.start, item.end);
      return !/\n\s*[A-Za-z_]\w*\s*:/.test(code) && !/^\s*(?:attributeDefinitions|referenceDefinitions|jadeMethodDefinitions|constantDefinitions|typeSources)\s*$/m.test(code);
    }) || [];
  }

  find(owner, member, model = parseSource(this.document.getText(), this.document.fileName), kind = this.selection?.kind || 'method') {
    if (!supportedKinds.has(kind)) return undefined;
    if (declarationKind(kind)) {
      const matches = this.declarations(owner, kind, model).filter(item => item.name === member);
      return matches.length === 1 ? matches[0] : undefined;
    }
    return model.classes.find(item => item.name === owner)?.members.find(item => item.name === member && item.bodyStart !== undefined && this.document.getText()[item.end - 1] === '}');
  }

  snapshot() {
    const selected = this.selection;
    return selected ? { ...selected, version: this.document.version, uri: this.document.uri.toString(), text: selected.available ? this.document.getText().slice(selected.start, selected.end) : '', lineEnding: this.document.eol === 2 ? '\r\n' : this.document.eol === 1 ? '\n' : this.document.getText().includes('\r\n') ? '\r\n' : '\n', dirty: Boolean(this.document.isDirty), readOnly: Boolean(this.readOnlyReason), reason: this.readOnlyReason || (!selected.available ? 'Member source is unavailable, ambiguous or incomplete. Open Original Source to inspect it.' : undefined) } : undefined;
  }

  onDidChange(listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  changed(contentChanges) {
    const selected = this.selection;
    if (!selected) return;
    const ownChange = this.pendingEdit && contentChanges.some(change => change.rangeOffset === this.pendingEdit.start && change.rangeLength === this.pendingEdit.end - this.pendingEdit.start && change.text === this.pendingEdit.text);
    const touched = selected.available && contentChanges.some(change => change.rangeOffset <= selected.end && change.rangeOffset + change.rangeLength >= selected.start);
    if (selected.available) {
      // VS Code reports all ranges against the previous document revision.
      for (const change of [...contentChanges].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
        const from = change.rangeOffset, to = from + change.rangeLength, delta = change.text.length - change.rangeLength;
        if (to <= selected.start && from < selected.start) { selected.start += delta; selected.end += delta; }
        else if (from <= selected.end) {
          selected.start = from < selected.start ? from + change.text.length : selected.start;
          selected.end = to <= selected.end ? selected.end + delta : from + change.text.length;
        }
      }
    }
    const text = this.document.getText(), model = parseSource(text, this.document.fileName);
    const incomplete = model.excluded?.some(item => !item.closed && item.start <= selected.end && (item.kind !== 'comment' || text.startsWith('/*', item.start)));
    if (declarationKind(selected.kind)) {
      const declarations = this.declarations(selected.owner, selected.kind, model);
      if (ownChange) {
        selected.available = true; selected.editedDeclaration = true;
        const current = declarations.filter(item => item.start >= selected.start && item.end <= selected.end);
        if (current.length === 1) selected.displayName = current[0].name;
      } else if (!incomplete) {
        const current = this.find(selected.owner, selected.displayName || selected.member, model, selected.kind) || this.find(selected.owner, selected.member, model, selected.kind);
        if (current && current.end <= selected.end) Object.assign(selected, { available: true, start: current.start, end: current.end, displayName: current.name });
        else if (!current) {
          const renamed = declarations.some(item => item.start >= selected.start && item.end <= selected.end);
          if (!model.classes.some(item => item.name === selected.owner) || touched && (!text.slice(selected.start, selected.end).trim() || renamed && !selected.editedDeclaration)) selected.available = false;
        }
      }
    } else if (!incomplete) {
      const method = this.find(selected.owner, selected.member, model);
      if (method) Object.assign(selected, { available: true, start: method.bodyStart, end: method.end - 1 });
      // Only a complete parse can confirm a deletion. An unfinished method stays anchored.
      else if (!model.classes.find(item => item.name === selected.owner)?.members.some(item => item.name === selected.member && item.bodyStart !== undefined)) selected.available = false;
    }
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  async edit({ version, start, end, text, owner, member, kind }) {
    const state = this.snapshot();
    if (!state?.available) throw new Error('The selected member source is no longer available.');
    if (state.readOnly) throw new Error(state.reason);
    if (version !== this.document.version) throw new Error('Source changed; refresh the method before editing.');
    if ((owner !== undefined && owner !== state.owner) || (member !== undefined && member !== state.member)) throw new Error('The selected method changed before the edit was applied.');
    if (kind !== undefined && kind !== state.kind) throw new Error('The selected member kind changed before the edit was applied.');
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > state.text.length || typeof text !== 'string') throw new Error('Invalid method edit range.');
    const pending = { start: state.start + start, end: state.start + end, text };
    this.pendingEdit = pending;
    try { if (!await this.applyEdit(pending.start, pending.end, text, version)) throw new Error('The source document rejected the edit.'); }
    finally { if (this.pendingEdit === pending) this.pendingEdit = undefined; }
    return this.snapshot();
  }

  toDocumentOffset(offset) {
    const state = this.snapshot();
    if (!state?.available || !Number.isInteger(offset) || offset < 0 || offset > state.text.length) throw new Error('Invalid method position.');
    return state.start + offset;
  }

  dispose() { this.listeners.clear(); }
}
module.exports = { MethodDocumentBinding };
