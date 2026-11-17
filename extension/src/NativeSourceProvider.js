'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { configDto } = require('./cli-client');

const clone = value => structuredClone(value);
const required = (value, label) => {
  if (typeof value !== 'string' || !value.length) throw Error('Missing native ' + label + '.');
  return value;
};
const hash = (value, label) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Invalid native ' + label + ' hash.');
  return value;
};
function contained(root, uri, label) {
  let target;
  try { target = fileURLToPath(uri); } catch { throw Error('Invalid native ' + label + ' URI.'); }
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
    throw Error('Native ' + label + ' is outside its configured binding.');
  return target;
}

// Retains transport/document bindings only. The native provider owns the semantic
// graph, saved snapshot, source formats, dependency selection and edit semantics.
class NativeSourceProvider {
  constructor({ client, config }) {
    this.client = client;
    this.config = clone(configDto(config));
    if (this.config.sourceFormat !== 'jox' || this.config.workspaceRoots?.length !== 1)
      throw Error('A JOX source provider requires one configured project root.');
    this.root = path.resolve(required(this.config.workspaceRoots[0], 'project root'));
    this.documents = new WeakMap();
  }

  async capability() {
    const connection = this.client.connect();
    if (this.connection !== connection) {
      this.connection = connection;
      this.snapshot = undefined;
      this.probe = undefined;
    }
    if (!this.probe) {
      const probe = (async () => {
        const capabilities = await this.client.sourceCapabilities(this.config);
        this.assertConnection(connection);
        const semantic = capabilities?.sourceSemantic;
        const provider = semantic?.format === 1 && semantic.providers?.find(value => value.id === 'jox');
        if (!provider?.catalogue) throw Error('Update the Jade CLI: this runtime does not support JOX source browsing.');
        return clone(provider);
      })();
      this.probe = probe;
      void probe.catch(() => { if (this.probe === probe) this.probe = undefined; });
    }
    return this.probe;
  }

  assertConnection(connection = this.connection) {
    if (!connection || this.client.client !== connection || connection.closed)
      throw Error('The native source connection changed. Prepare the project again.');
  }

  async request(command, body, token) {
    this.assertConnection();
    if (token?.isCancellationRequested) throw Object.assign(Error('Source operation cancelled.'), { cancelled: true });
    const connection = this.connection;
    const request = this.client.request(command, body, undefined, undefined, connection);
    const cancel = () => {
      try { void this.client.request('cancel', { operationId: request.id }, undefined, undefined, connection).promise.catch(() => {}); }
      catch { /* The original request still owns the terminal connection result. */ }
    };
    const subscription = token?.onCancellationRequested(cancel);
    if (token?.isCancellationRequested) cancel();
    try {
      const result = await request.promise;
      if (result?.passed !== true || result.code !== 0 || !result.body || typeof result.body !== 'object')
        throw Object.assign(Error(result?.report?.error || 'Native source operation failed.'), { result });
      this.assertConnection(connection);
      return result.body;
    } finally { subscription?.dispose(); }
  }

  async prepare(token) {
    const capabilities = await this.capability();
    const snapshot = await this.request('source.semantic.prepare', { config: clone(this.config) }, token);
    if (snapshot.provider !== 'jox') throw Error('Invalid native provider binding.');
    required(snapshot.projectId, 'project binding');
    required(snapshot.generation, 'generation binding');
    hash(snapshot.snapshotHash, 'snapshot');
    this.snapshot = clone(snapshot);
    this.flags = Object.fromEntries(['catalogue', 'projectionRead', 'projectionEdit', 'deploymentFromSavedSnapshot', 'nativeTests']
      .map(key => [key, capabilities[key] === true && snapshot.capabilities?.[key] === true]));
    return clone(snapshot);
  }

  binding() {
    this.assertConnection();
    if (!this.snapshot) throw Error('Prepare the native source project first.');
    const { provider, projectId, generation } = this.snapshot;
    return { provider, projectId, generation };
  }

  assertBinding(value, expected = this.binding()) {
    for (const key of ['provider', 'projectId', 'generation'])
      if (value[key] !== expected[key]) throw Error('Invalid native source ' + key + ' binding.');
  }

  async query({ kind, parentId, search, offset = 0, limit = 100 }, token) {
    if (!['schema', 'type', 'member', 'test'].includes(kind)) throw Error('Unsupported native source query kind.');
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw Error('Native source query limit is outside its bounds.');
    const binding = this.binding();
    const body = { ...binding, kind, ...(parentId === undefined ? {} : { parentId: required(parentId, 'parent identity') }),
      ...(search === undefined ? {} : { search: String(search) }), offset, limit };
    const page = await this.request('source.semantic.query', body, token);
    this.assertBinding(page, binding);
    if (!Array.isArray(page.items) || page.items.length > limit || page.offset !== offset || page.limit !== limit ||
        !Number.isSafeInteger(page.total) || page.total < offset + page.items.length ||
        !(page.nextOffset === null || Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset && page.nextOffset <= page.total))
      throw Error('Invalid native source page bounds.');
    for (const item of page.items) required(item.id, 'entity identity');
    return clone(page);
  }

  validateDocument(document, binding) {
    this.assertBinding(document, binding);
    required(document.documentId, 'document identity');
    required(document.entityId, 'entity identity');
    const revision = document.revision;
    if (revision?.generation !== binding.generation) throw Error('Invalid native document generation binding.');
    hash(revision.originByteHash, 'origin');
    hash(revision.memberHash, 'member');
    if (document.origin?.format !== 'jox' || document.origin.originByteHash !== revision.originByteHash)
      throw Error('Invalid native origin hash binding.');
    const origin = contained(this.root, document.origin.uri, 'origin');
    const managed = path.join(this.root, '.jade');
    const relative = path.relative(managed, origin);
    if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      throw Error('Native origin cannot be a derived cache projection.');
    contained(path.join(managed, 'projections'), document.projection?.cacheUri, 'cache');
    if (typeof document.projection.text !== 'string' ||
        crypto.createHash('sha256').update(document.projection.text, 'utf8').digest('hex') !== hash(document.projection.contentHash, 'projection'))
      throw Error('Native projection text hash does not match.');
    if (!Array.isArray(document.supportedEdits)) throw Error('Missing native supported edit kinds.');
    return document;
  }

  retain(document) {
    const value = clone(document);
    this.documents.set(value, { document: clone(value), connection: this.connection });
    return value;
  }

  async read(entityId, token) {
    const binding = this.binding();
    if (!this.flags.projectionRead) throw Error('This native provider does not support source projection reads.');
    const document = await this.request('source.semantic.read', { ...binding, entityId: required(entityId, 'entity identity') }, token);
    this.validateDocument(document, binding);
    if (document.entityId !== entityId) throw Error('Invalid native document entity binding.');
    return this.retain(document);
  }

  async applyEdit(opened, replacementText, editKind, token) {
    const retained = this.documents.get(opened);
    if (!retained) throw Error('This document has no native editor binding.');
    this.assertConnection(retained.connection);
    const document = retained.document;
    if (!this.flags?.projectionEdit || !document.supportedEdits.includes(editKind))
      throw Error('This source kind is read-only; native editing support is unavailable.');
    if (typeof replacementText !== 'string') throw Error('Native source replacement must be text.');
    const saved = await this.request('source.semantic.applyEdit', {
      provider: document.provider, projectId: document.projectId, documentId: document.documentId, entityId: document.entityId,
      baseRevision: clone(document.revision), editKind, replacementText
    }, token);
    if (saved.saved !== true || saved.provider !== document.provider || saved.projectId !== document.projectId ||
        saved.documentId !== document.documentId || saved.entityId !== document.entityId || saved.origin?.uri !== document.origin.uri)
      throw Error('Invalid native saved document binding.');
    const next = { ...document, generation: saved.newRevision?.generation, revision: saved.newRevision,
      origin: saved.origin, projection: saved.projection };
    this.validateDocument(next, { provider: document.provider, projectId: document.projectId, generation: saved.newRevision?.generation });
    return this.retain(next);
  }

  async execute(command, selection, { token, output, settings = {} } = {}) {
    if (!['build', 'test', 'workspace.run'].includes(command)) throw Error('Unsupported semantic execution command.');
    // One native prepare observes saved Git changes. There is no browser graph
    // comparison, legacy baseline check or second source-index preparation.
    const snapshot = await this.prepare(token);
    if (!this.flags.deploymentFromSavedSnapshot || command !== 'build' && !this.flags.nativeTests)
      throw Error('This Jade CLI does not yet support executing saved JOX source.');
    if (!Array.isArray(selection?.entityIds) || !selection.entityIds.length || selection.entityIds.some(id => typeof id !== 'string' || !id))
      throw Error('Select a native source entity before execution.');
    if (token?.isCancellationRequested) return { passed: false, code: 130, cancelled: true };
    const connection = this.connection;
    const { methods, ...arguments_ } = settings;
    if (Object.hasOwn(arguments_, 'config')) throw Error('Native project configuration cannot be replaced by execution arguments.');
    const request = this.client.request(command, { ...arguments_, config: { ...clone(this.config), ...(methods === undefined ? {} : { methods }) },
      sourceSnapshot: { provider: snapshot.provider, projectId: snapshot.projectId, generation: snapshot.generation, snapshotHash: snapshot.snapshotHash },
      semanticSelection: clone(selection) }, output, undefined, connection);
    const cancel = () => {
      try { void this.client.request('cancel', { operationId: request.id }, undefined, undefined, connection).promise.catch(() => {}); }
      catch { /* Preserve the terminal result from this captured request. */ }
    };
    const subscription = token?.onCancellationRequested(cancel);
    if (token?.isCancellationRequested) cancel();
    try {
      const result = await request.promise;
      if (typeof result?.passed !== 'boolean' || !Number.isInteger(result.code)) throw Error('Incomplete native execution result.');
      return result;
    } finally { subscription?.dispose(); }
  }
}

module.exports = { NativeSourceProvider };
