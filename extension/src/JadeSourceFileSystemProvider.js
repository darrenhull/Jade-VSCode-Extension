'use strict';
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

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
  }

  async open(entityId, token) {
    if (this.entities.has(entityId)) return this.entities.get(entityId);
    if (this.opening.has(entityId)) return this.opening.get(entityId);
    const operation = (async () => {
      const document = await this.provider.read(entityId, token);
      const uri = this.vscode.Uri.from({ scheme: 'jade-source', path: '/' + crypto.randomUUID() + '.jade' });
      const now = Date.now();
      this.documents.set(uri.toString(), { uri, document, ctime: now, mtime: now, saving: false });
      this.entities.set(entityId, uri);
      return uri;
    })();
    this.opening.set(entityId, operation);
    try { return await operation; }
    finally { if (this.opening.get(entityId) === operation) this.opening.delete(entityId); }
  }

  record(uri) {
    const value = this.documents.get(uri.toString());
    if (!value) throw this.vscode.FileSystemError.FileNotFound('No owned native source document was found.');
    return value;
  }

  binding(uri) { return structuredClone(this.record(uri).document); }

  stat(uri) {
    const value = this.record(uri);
    return { type: this.vscode.FileType.File, ctime: value.ctime, mtime: value.mtime,
      size: Buffer.byteLength(value.document.projection.text, 'utf8'),
      ...(this.provider.flags?.projectionEdit && value.document.supportedEdits.length ? {} : { permissions: this.vscode.FilePermission.Readonly }) };
  }

  readFile(uri) { return Buffer.from(this.record(uri).document.projection.text, 'utf8'); }

  async writeFile(uri, content, options) {
    const value = this.record(uri);
    if (!this.provider.flags?.projectionEdit || !value.document.supportedEdits.length)
      throw this.vscode.FileSystemError.NoPermissions('This source kind is read-only; native editing support is unavailable.');
    if (value.saving) throw this.vscode.FileSystemError.Unavailable('A save is already pending for this source document.');
    if (!options?.overwrite) throw this.vscode.FileSystemError.FileExists(uri);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
    value.saving = true;
    try {
      const document = await this.provider.applyEdit(value.document, text, value.document.supportedEdits[0]);
      value.document = document;
      value.mtime = Math.max(Date.now(), value.mtime + 1);
      this.changes.fire([{ type: this.vscode.FileChangeType.Changed, uri: value.uri }]);
    } finally { value.saving = false; }
  }

  close(uri) {
    const value = this.documents.get(uri.toString());
    if (!value || value.saving) return;
    this.documents.delete(uri.toString());
    this.entities.delete(value.document.entityId);
  }

  watch() { return { dispose() {} }; }
  readDirectory() { throw this.vscode.FileSystemError.NoPermissions('Native source directory browsing is not supported through editor URIs.'); }
  createDirectory() { throw this.vscode.FileSystemError.NoPermissions('Creating derived source documents is not supported.'); }
  delete() { throw this.vscode.FileSystemError.NoPermissions('Deleting derived source documents is not supported.'); }
  rename() { throw this.vscode.FileSystemError.NoPermissions('Renaming derived source documents is not supported.'); }
  dispose() { this.documents.clear(); this.entities.clear(); this.changes.dispose(); }
}

module.exports = { JadeSourceFileSystemProvider };
