'use strict';
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const { pathToFileURL } = require('node:url');

// This is open-editor state, not another source index. Saves are acknowledged by
// the native provider against the exact revision originally opened in the tab.
class JadeSourceFileSystemProvider {
  constructor(vscode, provider) {
    this.vscode = vscode;
    this.provider = provider;
    this.documents = new Map();
    this.entities = new Map();
    this.opening = new Map();
    this.changes = new vscode.EventEmitter();
    this.onDidChangeFile = this.changes.event;
    this.saves = new vscode.EventEmitter();
    this.onDidFinishSave = this.saves.event;
  }

  async open(entityId, token) {
    if (this.entities.has(entityId)) return this.entities.get(entityId);
    if (this.opening.has(entityId)) return this.opening.get(entityId);
    const operation = (async () => {
      const document = await this.provider.read(entityId, token, undefined, { editor: true });
      const recovery = document.documentBinding;
      const uri = this.vscode.Uri.from({ scheme: 'jade-source', path: '/.jade/projections/' + (recovery?.key || crypto.randomUUID()) + '.jade',
        ...(recovery ? { query: new URLSearchParams({ project: pathToFileURL(this.provider.root).toString(), binding: document.projectId }).toString() } : {}) });
      const now = Date.now();
      this.documents.set(uri.toString(), { uri, document, ctime: now, mtime: now, saving: false });
      this.entities.set(entityId, uri);
      return uri;
    })();
    this.opening.set(entityId, operation);
    try { return await operation; }
    finally { if (this.opening.get(entityId) === operation) this.opening.delete(entityId); }
  }

  async recover(uri, token) {
    if (this.documents.has(uri.toString())) return;
    const identity = 'recovery:' + uri.toString();
    if (this.opening.has(identity)) return this.opening.get(identity);
    const operation = (async () => {
      const match = /^\/\.jade\/projections\/([a-f0-9]{32})\.jade$/.exec(uri.path);
      const query = new URLSearchParams(uri.query || '');
      if (!match || query.get('binding') !== this.provider.snapshot?.projectId ||
          query.get('project') !== pathToFileURL(this.provider.root).toString())
        throw this.vscode.FileSystemError.Unavailable('This restored source editor has no matching native project binding. Keep its unsaved text.');
      const document = await this.provider.reopen(match[1], token);
      const now = Date.now();
      this.documents.set(uri.toString(), { uri, document, ctime: now, mtime: now, saving: false });
      this.entities.set(document.entityId, uri);
    })();
    this.opening.set(identity, operation);
    try { return await operation; }
    finally { if (this.opening.get(identity) === operation) this.opening.delete(identity); }
  }

  record(uri) {
    const value = this.documents.get(uri.toString());
    if (!value) throw this.vscode.FileSystemError.FileNotFound('No owned native source document was found.');
    return value;
  }

  binding(uri) { return structuredClone(this.record(uri).document); }

  editable(document) {
    return this.provider.flags?.projectionEdit && document.projection.editKind === 'projectionText' && document.supportedEdits.includes('projectionText');
  }

  stat(uri) {
    const value = this.record(uri);
    return { type: this.vscode.FileType.File, ctime: value.ctime, mtime: value.mtime,
      size: Buffer.byteLength(value.document.projection.text, 'utf8'),
      ...(this.editable(value.document) ? {} : { permissions: this.vscode.FilePermission.Readonly }) };
  }

  readFile(uri) { return Buffer.from(this.record(uri).document.projection.text, 'utf8'); }

  async writeFile(uri, content, options) {
    const value = this.record(uri);
    if (!this.editable(value.document))
      throw this.vscode.FileSystemError.NoPermissions('This source kind is read-only; native editing support is unavailable.');
    if (value.saving) throw this.vscode.FileSystemError.Unavailable('A save is already pending for this source document.');
    if (!options?.overwrite) throw this.vscode.FileSystemError.FileExists(uri);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
    value.saving = true;
    let saved = false;
    try {
      const document = await this.provider.applyEdit(value.document, text, value.document.projection.editKind);
      value.document = document;
      saved = true;
      value.mtime = Math.max(Date.now(), value.mtime + 1);
      this.changes.fire([{ type: this.vscode.FileChangeType.Changed, uri: value.uri }]);
    } finally { value.saving = false; this.saves.fire({ uri, saved }); }
  }

  close(uri) {
    const value = this.documents.get(uri.toString());
    if (!value || value.saving) return;
    this.documents.delete(uri.toString());
    this.entities.delete(value.document.entityId);
    return this.provider.close?.(value.document);
  }

  async refresh(uri, { currentState } = {}) {
    if (typeof currentState !== 'function') throw Error('Current editor state is required before refreshing a source document.');
    const value = this.record(uri);
    const before = currentState(), original = value.document;
    if (before.dirty || value.saving) return false;
    const document = await this.provider.read(value.document.entityId, undefined, value.document);
    const after = currentState();
    if (after.dirty || value.saving || this.documents.get(uri.toString()) !== value || value.document !== original ||
        before.version !== after.version || before.document !== after.document) return false;
    const changed = document.projection.text !== value.document.projection.text;
    value.document = document;
    if (changed) {
      value.mtime = Math.max(Date.now(), value.mtime + 1);
      this.changes.fire([{ type: this.vscode.FileChangeType.Changed, uri: value.uri }]);
    }
    return true;
  }

  watch() { return { dispose() {} }; }
  readDirectory() { throw this.vscode.FileSystemError.NoPermissions('Native source directory browsing is not supported through editor URIs.'); }
  createDirectory() { throw this.vscode.FileSystemError.NoPermissions('Creating derived source documents is not supported.'); }
  delete() { throw this.vscode.FileSystemError.NoPermissions('Deleting derived source documents is not supported.'); }
  rename() { throw this.vscode.FileSystemError.NoPermissions('Renaming derived source documents is not supported.'); }
  dispose() { this.documents.clear(); this.entities.clear(); this.changes.dispose(); this.saves.dispose(); }
}

module.exports = { JadeSourceFileSystemProvider };
