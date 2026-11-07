'use strict';
const { parseSource } = require('./source_symbols');

/** A method is a range in its original TextDocument, never a second document. */
class MethodDocumentBinding {
  constructor(document, applyEdit) {
    this.document = document;
    this.applyEdit = applyEdit;
    this.listeners = new Set();
  }

  select(owner, member) {
    const method = this.find(owner, member);
    this.selection = { owner, member, available: Boolean(method), start: method?.bodyStart, end: method ? method.end - 1 : undefined };
    return this.snapshot();
  }

  find(owner, member, model = parseSource(this.document.getText(), this.document.fileName)) {
    return model.classes.find(item => item.name === owner)?.members.find(item => item.name === member && item.bodyStart !== undefined && this.document.getText()[item.end - 1] === '}');
  }

  snapshot() {
    const selected = this.selection;
    return selected ? { ...selected, version: this.document.version, uri: this.document.uri.toString(), text: selected.available ? this.document.getText().slice(selected.start, selected.end) : '', dirty: Boolean(this.document.isDirty), readOnly: Boolean(this.readOnlyReason), reason: this.readOnlyReason || (!selected.available ? 'Method source is unavailable or no longer matches this declaration. Open Original Source to inspect it.' : undefined) } : undefined;
  }

  onDidChange(listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  changed(contentChanges) {
    const selected = this.selection;
    if (!selected) return;
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
    if (!incomplete) {
      const method = this.find(selected.owner, selected.member, model);
      if (method) Object.assign(selected, { available: true, start: method.bodyStart, end: method.end - 1 });
      // Only a complete parse can confirm a deletion. An unfinished method stays anchored.
      else if (!model.classes.find(item => item.name === selected.owner)?.members.some(item => item.name === selected.member && item.bodyStart !== undefined)) selected.available = false;
    }
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  async edit({ version, start, end, text, owner, member }) {
    const state = this.snapshot();
    if (!state?.available) throw new Error('The selected method source is no longer available.');
    if (state.readOnly) throw new Error(state.reason);
    if (version !== this.document.version) throw new Error('Source changed; refresh the method before editing.');
    if ((owner !== undefined && owner !== state.owner) || (member !== undefined && member !== state.member)) throw new Error('The selected method changed before the edit was applied.');
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > state.text.length || typeof text !== 'string') throw new Error('Invalid method edit range.');
    if (!await this.applyEdit(state.start + start, state.start + end, text, version)) throw new Error('The source document rejected the edit.');
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
