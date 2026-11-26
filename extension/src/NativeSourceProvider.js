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
  constructor({ client, config, projectRoot = config?.workspaceRoots?.[0], validateContext = () => {} }) {
    this.client = client;
    this.validateContext = validateContext;
    this.config = clone(configDto(config));
    if (Object.hasOwn(config, 'workingJadeGitPolicy')) this.config.workingJadeGitPolicy = config.workingJadeGitPolicy;
    if (this.config.sourceFormat !== 'jox') throw Error('A JOX source provider requires its native format binding.');
    this.root = path.resolve(required(projectRoot, 'project context'));
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

  async request(command, body, token, output) {
    this.assertConnection();
    if (token?.isCancellationRequested) throw Object.assign(Error('Source operation cancelled.'), { cancelled: true });
    this.validateContext();
    const connection = this.connection;
    const request = this.client.request(command, body, output, undefined, connection);
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
      if (command === 'working.initialize' && (this.client.client !== connection || connection.closed)) {
        const completed = result.body.working?.workingMode === 'existing' ? 'Existing Working synchronization' : result.body.report?.workingMode === 'git-first' ? 'Git-first Working setup' : 'Working and source creation';
        return { ...clone(result.body), viewRefreshRequired: true,
          warning: `${completed} completed. The native connection changed; refresh Object Explorer when the project is open.` };
      }
      this.assertConnection(connection);
      return result.body;
    } finally { subscription?.dispose(); }
  }

  serializeSource(operation) {
    const result = (this.sourceOperation || Promise.resolve()).then(operation);
    this.sourceOperation = result.catch(() => {});
    return result;
  }

  prepare(token) { return this.serializeSource(() => this.prepareSource(token)); }

  async prepareSource(token) {
    if (token?.isCancellationRequested) throw Object.assign(Error('Source operation cancelled.'), { cancelled: true });
    this.validateContext();
    const capabilities = await this.capability();
    const snapshot = await this.request('source.semantic.prepare', { cwd: this.root, config: clone(this.config) }, token);
    return this.adoptSnapshot(snapshot, capabilities);
  }

  adoptSnapshot(snapshot, capabilities, retain = true) {
    if (snapshot.provider !== 'jox') throw Error('Invalid native provider binding.');
    required(snapshot.projectId, 'project binding');
    required(snapshot.generation, 'generation binding');
    hash(snapshot.snapshotHash, 'snapshot');
    const project = new URL(required(snapshot.projectRoot, 'project root'));
    if (project.protocol !== 'file:' || project.search || project.hash) throw Error('Invalid native project root URI.');
    const projectRoot = path.resolve(fileURLToPath(project));
    const context = path.relative(projectRoot, this.root);
    if (context === '..' || context.startsWith('..' + path.sep) || path.isAbsolute(context))
      throw Error('Native project root does not contain the selected project context.');
    if (!Array.isArray(snapshot.sourceRoots) || !snapshot.sourceRoots.length) throw Error('Missing native source root binding.');
    const sourceRoots = snapshot.sourceRoots.map(uri => {
      const value = new URL(uri);
      if (value.search || value.hash || value.protocol !== 'file:') throw Error('Invalid native source root URI.');
      return fileURLToPath(value);
    });
    if (retain) {
      this.sourceRoots = sourceRoots;
      this.projectRoot = projectRoot;
      this.snapshot = clone(snapshot);
      this.flags = Object.fromEntries(['catalogue', 'projectionRead', 'projectionEdit', 'deploymentFromSavedSnapshot', 'nativeTests', 'nativeScratch', 'nativeDebug', 'documentReopen', 'sync']
        .map(key => [key, capabilities[key] === true && snapshot.capabilities?.[key] === true]));
    }
    return clone(snapshot);
  }

  initialize({ destination, schemas, expectedWorkingIdentity }, token, output) {
    return this.serializeSource(async () => {
      if (token?.isCancellationRequested) throw Object.assign(Error('Source operation cancelled.'), { cancelled: true });
      this.validateContext();
      if (!path.isAbsolute(required(destination, 'source destination'))) throw Error('Choose an absolute source destination.');
      const capabilities = await this.capability();
      if (capabilities.initialization !== true) throw Error('Update the Jade CLI: this runtime does not support creating Working and extracting JOX sources.');
      const result = await this.request('working.initialize', { cwd: this.root, config: clone(this.config), destination,
        ...(schemas === undefined ? {} : { schemas: clone(schemas) }),
        ...(expectedWorkingIdentity === undefined ? {} : { expectedWorkingIdentity: required(expectedWorkingIdentity, 'reviewed Working target') }) }, token, output);
      if (!Array.isArray(result.sourceRoots) || result.sourceRoots.length !== 1 ||
          path.relative(path.resolve(destination), fileURLToPath(result.sourceRoots[0])) !== '')
        throw Error('Native initialization returned another source destination.');
      return this.adoptInitialization(result, capabilities);
    });
  }

  initializeCheckout({ expectedWorkingIdentity, overwriteWorkingChanges }, token, output) {
    return this.serializeSource(async () => {
      if (token?.isCancellationRequested) throw Object.assign(Error('Source operation cancelled.'), { cancelled: true });
      this.validateContext();
      const identity = required(expectedWorkingIdentity, 'reviewed Working target');
      if(this.config.workingMode==='existing'&&overwriteWorkingChanges!==true)throw Error('Confirm that saved source may overwrite Working-only changes before initial synchronization.');
      const capabilities = await this.capability();
      if (this.config.workingMode === 'existing') {
        if (capabilities.initialization !== true || capabilities.sync !== true || capabilities.reviewedWorkingSync !== true)
          throw Error('Update the Jade CLI: direct Working initialization and reviewed sync are unavailable.');
      } else if (capabilities.checkoutInitialization !== true) throw Error('Update the Jade CLI: Git-first Working setup is unavailable.');
      const result = await this.request('working.initialize', { cwd: this.root, config: clone(this.config), expectedWorkingIdentity: identity,...(this.config.workingMode==='existing'?{overwriteWorkingChanges:true}:{}) }, token, output);
      const modeConfirmed=this.config.workingMode==='existing'?result.working?.workingMode==='existing'&&result.sourceAuthority==='checkout'&&result.report?.extracted===false:result.report?.workingMode==='git-first';
      if (result.working?.identity !== identity || !path.isAbsolute(result.working?.root ?? '') || Object.hasOwn(result.working, 'sourceDatabasePath') ||
          !modeConfirmed || result.report.workingPrepared !== true || result.report.publicationEstablished !== true)
        throw Error('Native setup did not confirm the reviewed Working database and saved checkout baseline.');
      return this.adoptInitialization(result, capabilities);
    });
  }

  adoptInitialization(result, capabilities) {
    const retained = result.viewRefreshRequired !== true && this.client.client === this.connection && !this.connection.closed;
    this.adoptSnapshot({ ...result.sourceSnapshot, projectRoot: result.projectRoot, sourceRoots: result.sourceRoots, capabilities: result.capabilities }, capabilities, retained);
    if (!retained) this.snapshot = undefined;
    return clone(result);
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

  async query({ kind, parentId, search, qualifiedName, memberKind, includeInherited, offset = 0, limit = 100 }, token) {
    if (!['schema', 'type', 'member', 'test'].includes(kind)) throw Error('Unsupported native source query kind.');
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw Error('Native source query limit is outside its bounds.');
    let exact;
    if (qualifiedName !== undefined) {
      if (!qualifiedName || typeof qualifiedName !== 'object' || Array.isArray(qualifiedName) || Object.keys(qualifiedName).length !== 2 ||
          !['schema', 'type'].every(key => typeof qualifiedName[key] === 'string' && qualifiedName[key].length > 0 &&
            qualifiedName[key].length <= 1024 && !qualifiedName[key].includes('\0')))
        throw Error('Invalid exact qualified native type identity.');
      exact = { schema: qualifiedName.schema, type: qualifiedName.type };
    }
    const binding = this.binding();
    const body = { ...binding, kind, ...(exact ? { qualifiedName: exact } : {}), ...(parentId === undefined ? {} : { parentId: required(parentId, 'parent identity') }),
      ...(search === undefined ? {} : { search: String(search) }),
      ...(memberKind === undefined ? {} : { memberKind: required(memberKind, 'member kind') }),
      ...(includeInherited === undefined ? {} : { includeInherited: includeInherited === true }), offset, limit };
    const page = await this.request('source.semantic.query', body, token);
    this.assertBinding(page, binding);
    if (!Array.isArray(page.items) || page.items.length > limit || page.offset !== offset || page.limit !== limit ||
        !Number.isSafeInteger(page.total) || page.total < offset + page.items.length ||
        !(page.nextOffset === null || Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset && page.nextOffset <= page.total))
      throw Error('Invalid native source page bounds.');
    for (const item of page.items) {
      required(item.id, 'entity identity');
      if (exact && (item.qualifiedName?.schema !== exact.schema || item.qualifiedName?.type !== exact.type))
        throw Error('Native reply did not preserve the exact qualified type identity. Update the Jade CLI.');
    }
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
    let origin;
    for (const root of this.sourceRoots) {
      try { origin = contained(root, document.origin.uri, 'origin'); break; } catch { /* Try only the native-returned configured roots. */ }
    }
    if (!origin) throw Error('Native origin is outside its configured source roots.');
    const managed = path.join(this.projectRoot, '.jade');
    const relative = path.relative(managed, origin);
    if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      throw Error('Native origin cannot be a derived cache projection.');
    contained(path.join(managed, 'projections'), document.projection?.cacheUri, 'cache');
    if (typeof document.projection.text !== 'string' ||
        crypto.createHash('sha256').update(document.projection.text, 'utf8').digest('hex') !== hash(document.projection.contentHash, 'projection'))
      throw Error('Native projection text hash does not match.');
    if (document.documentBinding) {
      if (!this.flags?.documentReopen) throw Error("Native editor recovery capability is unavailable.");
      const binding = document.documentBinding;
      if (binding?.format !== 1 || !/^[a-f0-9]{32}$/.test(binding.key || ''))
        throw Error('Missing native open-document recovery binding.');
      const project = new URL(binding.projectUri);
      if (project.protocol !== 'file:' || project.search || project.hash || path.relative(this.projectRoot, fileURLToPath(project)) !== '')
        throw Error('The native editor recovery binding belongs to another project.');
    }
    if (!Array.isArray(document.supportedEdits)) throw Error('Missing native supported edit kinds.');
    if (document.supportedEdits.length && (!this.flags?.projectionEdit || document.projection.editKind !== 'projectionText' ||
        !document.supportedEdits.includes('projectionText')))
      throw Error('Native projection editing capability and edit kind do not agree.');
    return document;
  }

  retain(document) {
    const value = clone(document);
    this.documents.set(value, { document: clone(value), connection: this.connection });
    return value;
  }

  async read(entityId, token, opened, { editor = false } = {}) {
    const binding = this.binding();
    if (!this.flags.projectionRead) throw Error('This native provider does not support source projection reads.');
    const document = await this.request('source.semantic.read', { ...binding, entityId: required(entityId, 'entity identity'),
      ...(opened?.documentBinding ? { documentBinding: opened.documentBinding.key } : {}),
      ...(editor && this.flags.documentReopen ? { openDocument: true } : {}) }, token);
    this.validateDocument(document, binding);
    if (document.entityId !== entityId) throw Error('Invalid native document entity binding.');
    if (editor && this.flags.documentReopen && !document.documentBinding) throw Error('Missing native editor recovery binding.');
    return this.retain(document);
  }

  closeProject() {
    return this.serializeSource(async () => {
      const snapshot = this.snapshot, connection = this.connection;
      if (!snapshot || !connection || this.client.client !== connection || connection.closed) return;
      // Scope may already be closed in VS Code. Cleanup uses only the captured
      // authenticated channel; it neither rediscovers config nor spawns a client.
      const request = this.client.request('source.semantic.closeProject', {
        provider: snapshot.provider, projectId: snapshot.projectId
      }, undefined, undefined, connection);
      const result = await request.promise;
      if (result?.passed !== true || result.code !== 0)
        throw Error(result?.report?.error || 'The native source project could not be closed.');
      if (this.snapshot === snapshot) this.snapshot = undefined;
    });
  }

  async close(opened) {
    const retained = this.documents.get(opened);
    if (!retained?.document.documentBinding || !this.flags?.documentReopen) return;
    // Disposal/restart must never spawn another client to clean an old binding.
    if (retained.connection !== this.client.client || retained.connection.closed) return;
    const document = retained.document;
    await this.request('source.semantic.closeDocument', { ...this.binding(), documentId: document.documentId,
      entityId: document.entityId, documentBinding: document.documentBinding.key });
    this.documents.delete(opened);
  }

  async reopen(key, token) {
    if (!this.flags?.documentReopen || !/^[a-f0-9]{32}$/.test(key || ''))
      throw Error('This source editor cannot be restored by the native runtime. Keep unsaved text and reopen the saved member.');
    const binding = this.binding();
    const document = await this.request('source.semantic.reopen', { ...binding, documentBinding: key }, token);
    this.validateDocument(document, binding);
    if (document.documentBinding.key !== key) throw Error('The native runtime returned a different editor recovery binding.');
    return this.retain(document);
  }

  applyEdit(opened, replacementText, editKind, token) {
    return this.serializeSource(() => this.applySourceEdit(opened, replacementText, editKind, token));
  }

  async applySourceEdit(opened, replacementText, editKind, token) {
    const retained = this.documents.get(opened);
    if (!retained) throw Error('This document has no native editor binding.');
    this.assertConnection(retained.connection);
    const document = retained.document;
    if (!this.flags?.projectionEdit || editKind !== 'projectionText' || document.projection.editKind !== editKind || !document.supportedEdits.includes(editKind))
      throw Error('This source kind is read-only; native editing support is unavailable.');
    if (typeof replacementText !== 'string') throw Error('Native source replacement must be text.');
    const saved = await this.request('source.semantic.applyEdit', {
      provider: document.provider, projectId: document.projectId, documentId: document.documentId, entityId: document.entityId,
      baseRevision: clone(document.revision), editKind, replacementText,
      ...(document.documentBinding ? { documentBinding: document.documentBinding.key } : {})
    }, token);
    if (saved.saved !== true || saved.provider !== document.provider || saved.projectId !== document.projectId ||
        saved.documentId !== document.documentId || saved.entityId !== document.entityId || saved.origin?.uri !== document.origin.uri)
      throw Error('Invalid native saved document binding.');
    const next = { ...document, generation: saved.newRevision?.generation, revision: saved.newRevision,
      origin: saved.origin, projection: saved.projection,
      ...(saved.documentBinding ? { documentBinding: saved.documentBinding } : {}) };
    if (document.documentBinding && saved.documentBinding?.key !== document.documentBinding.key)
      throw Error('The saved document changed its native recovery binding.');
    this.validateDocument(next, { provider: document.provider, projectId: document.projectId, generation: saved.newRevision?.generation });
    const snapshot = saved.sourceSnapshot;
    if (!snapshot || snapshot.provider !== document.provider || snapshot.projectId !== document.projectId ||
        typeof snapshot.generation !== 'string' || !snapshot.generation || snapshot.generation !== next.revision.generation)
      throw Error('Invalid native saved source snapshot binding.');
    hash(snapshot.snapshotHash, 'saved snapshot');
    this.snapshot = clone(snapshot);
    return this.retain(next);
  }

  async execute(command, selection, options = {}) {
    const [entry] = await this.executeBatch(command, [{ selection, settings: options.settings }], options);
    if (entry.error) throw entry.error;
    return entry.result;
  }

  async requireSync({expectedWorkingIdentity} = {}) {
    const capabilities=await this.capability();
    if(expectedWorkingIdentity!==undefined){
      required(expectedWorkingIdentity,'reviewed Working identity');
      if(capabilities.reviewedWorkingSync!==true)throw Error('Update the Jade CLI: reviewed Working target enforcement for sync is unavailable.');
    }
    if(capabilities.sync!==true)throw Error('The bundled Jade CLI does not support JOX sync. Install a Jade Tools update with a runtime qualified for sync.');
  }

  async sync({token,output,beforeRequest,expectedWorkingIdentity} = {}) {
    if(token?.isCancellationRequested)return{passed:false,code:130,cancelled:true};
    await this.requireSync({expectedWorkingIdentity});
    const snapshot=await this.prepare(token);
    if(!this.flags.sync)throw Error('This Jade CLI does not support sync for the selected JOX project.');
    const connection=this.connection;
    if(this.config.workingJadeGitPolicy&&this.config.workingJadeGitPolicy!=='inherit')await require('./working-jadegit-policy').requireWorkingJadeGitPolicy(this.client,this.config);
    if(token?.isCancellationRequested)return{passed:false,code:130,cancelled:true};
    this.validateContext();this.assertConnection(connection);this.assertBinding(snapshot);
    if(snapshot.snapshotHash!==this.snapshot.snapshotHash)throw Error('The saved JOX snapshot changed. Retry sync.');
    await beforeRequest?.();
    if(token?.isCancellationRequested)return{passed:false,code:130,cancelled:true};
    this.validateContext();this.assertConnection(connection);this.assertBinding(snapshot);
    if(snapshot.snapshotHash!==this.snapshot.snapshotHash)throw Error('The saved JOX snapshot changed before sync. Retry sync.');
    const {provider,projectId,generation,snapshotHash}=snapshot;
    const result=await this.requestExecution('sync',{cwd:this.root,config:clone(this.config),
      ...(expectedWorkingIdentity===undefined?{}:{expectedWorkingIdentity}),sourceSnapshot:{provider,projectId,generation,snapshotHash}},{token,output},connection);
    if(expectedWorkingIdentity!==undefined&&result.passed===true&&result.code===0&&result.report?.reviewedWorkingIdentity!==expectedWorkingIdentity)
      throw Object.assign(Error('Native sync did not confirm the reviewed Working target.'),{result:{...result,passed:false,code:2}});
    return result;
  }

  async executeBatch(command, operations, { token, output } = {}) {
    if (!['build', 'test', 'workspace.run'].includes(command)) throw Error('Unsupported semantic execution command.');
    if (!Array.isArray(operations) || !operations.length) throw Error('Select native source operations before execution.');
    if (token?.isCancellationRequested) return operations.map(() => ({ result: { passed: false, code: 130, cancelled: true } }));
    // One preparation binds saved content for the complete project run. Each
    // native request still executes independently and reports its own outcome.
    const snapshot = await this.prepare(token);
    if (!this.flags.deploymentFromSavedSnapshot || command === 'test' && !this.flags.nativeTests || command === 'workspace.run' && !this.flags.nativeScratch)
      throw Error('This Jade CLI does not yet support executing saved JOX source.');
    const results = [];
    let stopped;
    for (const { selection, settings = {} } of operations) {
      if (stopped) {
        if (stopped.cancelled) results.push({ result: { passed: false, code: 130, cancelled: true } });
        else results.push({ error: Object.assign(Error('Not executed because the previous native operation did not confirm completion and cleanup. ' + stopped.error.message),
          { result: stopped.result || { passed: false, code: 2, report: { error: stopped.error.message } } }) });
        continue;
      }
      try {
        const result = await this.executePrepared(command, selection, { token, output, settings }, snapshot);
        results.push({ result });
        if (result.cancelled) stopped = { cancelled: true };
        else if (command === 'test' && (result.report?.tests_completed !== true || result.report?.cleanup_complete !== true))
          stopped = { result, error: Error(result.report?.error || 'Native test completion and cleanup were not confirmed.') };
      } catch (error) { results.push({ error }); stopped = { error, result: error.result }; }
    }
    return results;
  }

  async executePrepared(command, selection, { token, output, settings }, snapshot) {
    if (token?.isCancellationRequested) return { passed: false, code: 130, cancelled: true };
    this.assertBinding(snapshot);
    if (snapshot.snapshotHash !== this.snapshot.snapshotHash) throw Error('The native source snapshot changed during this project run.');
    if (!Array.isArray(selection?.entityIds) || !selection.entityIds.length || selection.entityIds.some(id => typeof id !== 'string' || !id))
      throw Error('Select a native source entity before execution.');
    if (token?.isCancellationRequested) return { passed: false, code: 130, cancelled: true };
    if (this.config.workingJadeGitPolicy && this.config.workingJadeGitPolicy !== 'inherit')
      await require('./working-jadegit-policy').requireWorkingJadeGitPolicy(this.client, this.config);
    this.validateContext();
    if (token?.isCancellationRequested) return { passed: false, code: 130, cancelled: true };
    const connection = this.connection;
    const { methods, schema, ...arguments_ } = settings;
    if (Object.hasOwn(arguments_, 'config')) throw Error('Native project configuration cannot be replaced by execution arguments.');
    return this.requestExecution(command, { ...arguments_, cwd: this.root, config: { ...clone(this.config),
      ...(schema !== undefined ? { schema } : settings.testIdentity ? { schema: settings.testIdentity.schema } : {}), ...(methods === undefined ? {} : { methods }) },
      sourceSnapshot: { provider: snapshot.provider, projectId: snapshot.projectId, generation: snapshot.generation, snapshotHash: snapshot.snapshotHash },
      semanticSelection: clone(selection) }, { token, output }, connection);
  }

  async requestExecution(command, body, { token, output }, connection) {
    const request = this.client.request(command, body, output, undefined, connection);
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
