'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { fileURLToPath } = require('node:url');
const { configDto } = require('./cli-client');
const { isManagedProjectPath } = require('./source-index-scope');
const { NativeSourceProvider } = require('./NativeSourceProvider');
const { JadeSourceFileSystemProvider } = require('./JadeSourceFileSystemProvider');

function sourceContains(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function physicalSourcePath(file) {
  let current = path.resolve(file);
  const missing = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(current), ...missing); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    const parent = path.dirname(current);
    if (parent === current) throw Error('The dirty source path has no existing filesystem ancestor.');
    missing.unshift(path.basename(current)); current = parent;
  }
}

// Project handles and open documents only. Native owns the single source model.
class NativeSourceWorkspace {
  constructor({ vscode, client, configFor, watchSources = true }) {
    this.vscode = vscode;
    this.client = client;
    this.configFor = configFor;
    this.watchSources = watchSources;
    this.projects = new Map();
    this.events = new vscode.EventEmitter();
    this.forwarding = new Map();
    this.executing = false;
    this.sourceListeners = new Set();
    this.pendingChanges = new Map();
    this.changing = new Map();
    this.disposed = false;
    this.reportError = error => console.error(error.message);
  }

  folders() { return (this.vscode.workspace.workspaceFolders || []).filter(folder => folder.uri.scheme === 'file'); }

  project(folder, { allowColdConfiguration = false } = {}) {
    if (this.disposed) throw Error('The native source workspace is closed.');
    const current = this.folders().find(value => value.uri.toString() === folder?.uri.toString());
    if (!current) throw Error('The selected Jade project is no longer open.');
    const config = this.projectConfiguration(current);
    const key = current.uri.toString();
    let project = this.projects.get(key);
    if(project?.retiring)throw Error('The previous Jade project session is still closing. Retry after cleanup.');
    if(project?.retirementError)throw Error('The previous Jade project session could not be released: '+project.retirementError.message,{cause:project.retirementError});
    if(project?.releaseAttempt)delete project.releaseAttempt;
    if(project?.ownedClient?.disposed){project.ownedClient=this.client.fork();project.provider.client=project.ownedClient;delete project.releaseAttempt;delete project.provider.connection;delete project.provider.snapshot;delete project.provider.probe;}
    if (!project) {
      const provider = new NativeSourceProvider({ client: this.client, config, projectRoot: current.uri.fsPath,
        validateContext: () => { if (this.project(current) !== project) throw Error('The selected source project changed.'); } });
      project = { folder: current, provider, files: new JadeSourceFileSystemProvider(this.vscode, provider) };
      this.projects.set(key, project);
      this.forwarding.set(project,this.projectListeners(project));
    } else if (!isDeepStrictEqual(project.provider.config,config)) {
      const cold = allowColdConfiguration && this.canReconfigure(project);
      if (!cold) throw Error('Jade project settings changed. Close its source editors and reload the window before continuing.');
      // Explicit setup only; retain the same Explorer row and never reset a model.
      project.provider.config = config;
    }
    return project;
  }

  projectConfiguration(folder,configuration=this.configFor(folder)) {
    const supplied = { ...configuration, sourceFormat: 'jox' };
    const config = configDto(supplied);
    if (Object.hasOwn(supplied, 'workingJadeGitPolicy')) config.workingJadeGitPolicy = supplied.workingJadeGitPolicy;
    return config;
  }

  async probeCapability(project) {
    const probe=new NativeSourceProvider({client:this.client,config:project.provider.config,projectRoot:project.provider.root});
    const capability=await probe.capability();
    if(this.project(project.folder)!==project)throw Error('The source project changed during capability discovery.');
    return capability;
  }

  canReconfigure(project, { allowExecuting = false, allowStoredProjections = false } = {}) {
      let cold = (!this.executing || allowExecuting) && !this.pendingChanges.has(project) && !this.changing.has(project) &&
        !project.provider.connection && !project.provider.probe && !project.provider.sourceOperation &&
        !project.provider.snapshot && !project.provider.sourceRoots?.length && !project.watchers?.size &&
        !project.files.documents.size && !project.files.entities.size && !project.files.opening.size;
      if (cold) {
        // Restored tabs may precede files.recover(), and native open bindings may
        // exist on disk even when this process has not populated its editor maps.
        cold = !(this.vscode.workspace.textDocuments || []).some(document => {
          if (document.uri.scheme !== 'jade-source') return false;
          const selected = new URLSearchParams(document.uri.query || '').get('project');
          if (!selected) return true;
          try { return path.relative(project.provider.root, fileURLToPath(selected)) === ''; }
          catch { return true; }
        });
        if(!allowStoredProjections){try { fs.lstatSync(path.join(project.provider.root, '.jade', 'projections')); cold = false; }
        catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }}
      }

    return cold;
  }

  projectListeners(project) {
    const listeners=[];
    try{
      listeners.push(project.files.onDidChangeFile(changes=>this.events.fire(changes)));
      listeners.push(project.files.onDidFinishSave(({saved})=>{if(saved||this.pendingChanges.has(project))this.scheduleRefresh(project,saved);}));
      return listeners;
    }catch(error){for(const listener of listeners)listener.dispose();throw error;}
  }

  createSourceWatcher(project,root) {
    const watcher=this.vscode.workspace.createFileSystemWatcher(new this.vscode.RelativePattern(this.vscode.Uri.file(root),'**/*.[jJ][oO][xX]'));
    try{
      const changed=uri=>{if(uri.scheme==='file'&&!isManagedProjectPath(uri.fsPath))this.scheduleRefresh(project);};
      watcher.onDidChange(changed);watcher.onDidCreate(changed);watcher.onDidDelete(changed);
      return watcher;
    }catch(error){watcher.dispose();throw error;}
  }

  adoptProject(folder, owner, expectedPrevious) {
    const key=folder.uri.toString(),current=this.projects.get(key),candidate=owner.projects.get(key);
    if(!this.folders().some(value=>value.uri.toString()===key))throw Error('The selected Jade project is no longer open.');
    if(current!==expectedPrevious||current&&!this.canReconfigure(current,{allowExecuting:true,allowStoredProjections:true}))throw Error('The source project changed during Working setup.');
    if(!candidate||!isDeepStrictEqual(candidate.provider.config,this.projectConfiguration(folder)))throw Error('The accepted Working configuration changed during setup.');
    if(owner.changing.has(candidate))throw Error('The temporary source project is still refreshing. Retry setup.');
    let listeners;const watchers=new Map();
    try{
      listeners=this.projectListeners(candidate);
      if(this.watchSources&&this.vscode.workspace.createFileSystemWatcher&&this.vscode.RelativePattern)
        for(const root of new Set(candidate.provider.sourceRoots||[]))watchers.set(root,this.createSourceWatcher(candidate,root));
    }catch(error){for(const listener of listeners||[])listener.dispose();for(const watcher of watchers.values())watcher.dispose();throw error;}
    for(const watcher of candidate.watchers?.values()||[])watcher.dispose();candidate.watchers=watchers;
    const pending=owner.pendingChanges.get(candidate);if(pending){clearTimeout(pending.timer);owner.pendingChanges.delete(candidate);}
    for(const listener of owner.forwarding.get(candidate)||[])listener.dispose();
    owner.forwarding.delete(candidate);owner.projects.delete(key);
    if(current){for(const listener of this.forwarding.get(current)||[])listener.dispose();this.forwarding.delete(current);void this.releaseProject(current).catch(error=>this.reportError(error));current.files.dispose();}
    candidate.provider.validateContext=()=>{if(this.project(folder)!==candidate)throw Error('The selected source project changed.');};
    this.projects.set(key,candidate);
    this.forwarding.set(candidate,listeners);
    if(pending)this.scheduleRefresh(candidate,!pending.needsPrepare);
    return candidate;
  }

  async prepare(folder, token) {
    const project = this.project(folder);
    await project.provider.prepare(token);
    this.project(folder);
    this.observeSources(project);
    return project;
  }

  async refresh(folder, token, { prepared = false } = {}) {
    const project = prepared ? this.project(folder) : await this.prepare(folder, token);
    const errors = [];
    for (const value of project.files.documents.values()) {
      const currentState = () => {
        const document = (this.vscode.workspace.textDocuments || []).find(item => item.uri.toString() === value.uri.toString());
        return { document, dirty: document?.isDirty === true, version: document?.version };
      };
      try { await project.files.refresh(value.uri, { currentState }); }
      catch (error) { errors.push(error); }
    }
    const listeners = await Promise.allSettled([...this.sourceListeners].map(listener => Promise.resolve().then(() => listener(project))));
    for (const result of listeners) if (result.status === 'rejected') errors.push(result.reason);
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, errors.map(error => error.message).join('\n'));
    return project;
  }

  onDidChangeSource(listener) { this.sourceListeners.add(listener); return { dispose: () => this.sourceListeners.delete(listener) }; }

  observeSources(project) {
    if (!this.watchSources || !this.vscode.workspace.createFileSystemWatcher || !this.vscode.RelativePattern) return;
    const roots = new Set(project.provider.sourceRoots), watchers = project.watchers ||= new Map();
    for (const [root, watcher] of watchers) if (!roots.has(root)) { watcher.dispose(); watchers.delete(root); }
    for (const root of roots) if (!watchers.has(root)) {
      const watcher=this.createSourceWatcher(project,root);
      watchers.set(root, watcher);
    }
  }

  scheduleRefresh(project, prepared = false) {
    if (this.disposed || !this.folders().some(folder => folder.uri.toString() === project.folder.uri.toString())) return;
    const pending = this.pendingChanges.get(project) || { needsPrepare: false };
    pending.needsPrepare ||= !prepared;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => { void this.flushChanges(project).catch(error => { if (!this.disposed) this.reportError(error); }); }, 100);
    this.pendingChanges.set(project, pending);
  }

  async flushChanges(project) {
    if (this.changing.has(project)) return this.changing.get(project).promise;
    const pending = this.pendingChanges.get(project);
    if (!pending) return;
    clearTimeout(pending.timer);
    if (this.executing || [...project.files.documents.values()].some(value => value.saving)) return;
    this.pendingChanges.delete(project);
    if (this.disposed) return;
    const source = this.vscode.CancellationTokenSource ? new this.vscode.CancellationTokenSource() : undefined;
    const operation = this.refresh(project.folder, source?.token, { prepared: !pending.needsPrepare });
    this.changing.set(project, { source, promise: operation });
    try { return await operation; }
    finally {
      source?.dispose(); this.changing.delete(project);
      if (this.pendingChanges.has(project)) this.scheduleRefresh(project, !this.pendingChanges.get(project).needsPrepare);
    }
  }

  releaseProject(project){
    if(project.releaseAttempt)return project.releaseAttempt;
    project.retiring=true;
    const closing=(async()=>{
      const failures=[];
      try{await project.provider.closeProject();}catch(error){failures.push(error);}
      try{await project.ownedClient?.dispose();}catch(error){failures.push(error);}
      if(failures.length===1)throw failures[0];
      if(failures.length)throw new AggregateError(failures,'Native source model and owned session release failed.');
    })();
    project.releaseAttempt=closing;
    void closing.then(()=>{project.retiring=false;},error=>{project.retiring=false;project.retirementError=error;});
    return closing;
  }

  retireClosedProjects() {
    const open = new Set(this.folders().map(folder => folder.uri.toString()));
    for (const project of this.projects.values()) if (!open.has(project.folder.uri.toString())) {
      const pending = this.pendingChanges.get(project); if (pending) clearTimeout(pending.timer);
      this.pendingChanges.delete(project); this.changing.get(project)?.source?.cancel();
      for (const watcher of project.watchers?.values() || []) watcher.dispose();
      project.watchers?.clear();
      void this.releaseProject(project).catch(error => this.reportError(error));
    }
  }

  projectForUri(uri) {
    if (uri?.scheme === 'jade-source') {
      for (const project of this.projects.values()) {
        if (project.files.documents.has(uri.toString())) return this.project(project.folder);
      }
      const query = new URLSearchParams(uri.query || '');
      const selected = query.get('project');
      if (selected) {
        let root;
        try { root = fileURLToPath(selected); } catch { throw Error('Invalid source editor project URI.'); }
        const folder = this.folders().find(value => path.relative(value.uri.fsPath, root) === '');
        if (folder) return this.project(folder);
      }
      throw Error('The native source editor has no open project binding.');
    }
    const folder = uri && this.vscode.workspace.getWorkspaceFolder(uri);
    if (folder) return this.project(folder);
    if (this.folders().length === 1) return this.project(this.folders()[0]);
    throw Error('Choose the Jade project before this operation.');
  }

  async recover(uri) {
    const project = this.projectForUri(uri);
    if (!project.files.documents.has(uri.toString())) {
      if (!project.provider.snapshot) {
        const operation = project.recoveryPreparation ||= this.prepare(project.folder);
        try { await operation; }
        finally { if (project.recoveryPreparation === operation) project.recoveryPreparation = undefined; }
      }
      await project.files.recover(uri);
    }
    return project;
  }

  record(uri) {
    const project = this.projectForUri(uri);
    return { project, document: project.files.binding(uri) };
  }

  async findClass(name, schema, projectRoot) {
    const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    const folders = this.folders().filter(folder => !projectRoot || folder.uri.toString() === projectRoot || key(folder.uri.fsPath) === key(projectRoot));
    if (folders.length !== 1) throw Error('Choose the originating Jade project before opening source.');
    const project = this.project(folders[0]);
    if (!project.provider.snapshot) await this.prepare(project.folder);
    const page = await project.provider.query({ kind: 'type', qualifiedName: { schema, type: name }, offset: 0, limit: 100 });
    const matches = page.items.filter(entity => entity.qualifiedName?.type === name && entity.qualifiedName?.schema === schema);
    if (matches.length > 1) throw Error('Several native declarations share this display name. Select the exact declaration in Object Explorer.');
    return matches.length ? { project, entity: matches[0], generation: page.generation } : undefined;
  }

  async sourceContext({ projectRoot, schema, className }) {
    const row = await this.findClass(className, schema, projectRoot);
    if (!row) return { available: false, reason: 'No matching saved source was returned by the native provider.' };
    const uri = await row.project.files.open(row.entity.id);
    return { available: true, file: uri.toString(), dirty: (this.vscode.workspace.textDocuments || [])
      .some(document => document.uri.toString() === uri.toString() && document.isDirty) };
  }

  async open(project, entityId, token, options = {}) {
    this.project(project.folder);
    const uri = await project.files.open(entityId, token);
    const document = await this.vscode.workspace.openTextDocument(uri);
    await this.vscode.languages.setTextDocumentLanguage(document, 'jade-nz');
    const binding = project.files.binding(uri);
    const range = binding.projection.selectionRange;
    await this.vscode.window.showTextDocument(document, { ...options, preview: false,
      ...(range ? { selection: new this.vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character) } : {}) });
    return uri;
  }

  async saveDirty(project, token) {
    for (const document of this.vscode.workspace.textDocuments || []) {
      if (document.uri.scheme === 'jade-source' && project.files.documents.has(document.uri.toString()) && document.isDirty && !await document.save())
        throw Error('Save the source document before executing saved JOX changes.');
    }
    // Native-returned roots own saved inputs, including roots outside the VS
    // Code folder and roots covered by another nested workspace folder.
    if (!this.dirtyJox().length) return;
    if (!project.provider.sourceRoots?.length) await this.prepare(project.folder, token);
    if (token?.isCancellationRequested) throw Object.assign(Error('Source operation cancelled.'), { cancelled: true });
    this.assertCleanRawJox(project);
  }

  dirtyJox() {
    return (this.vscode.workspace.textDocuments || []).filter(document =>
      document.uri.scheme === 'file' && document.isDirty && /\.jox$/i.test(document.uri.fsPath));
  }

  assertCleanRawJox(project) {
    const dirty = this.dirtyJox();
    if (!dirty.length) return;
    const physical = file => {
      try { return physicalSourcePath(file); }
      catch (error) { throw Error('Cannot verify dirty JOX source ownership. Save or close the document before executing saved changes.', { cause: error }); }
    };
    const roots = project.provider.sourceRoots.map(physical);
    for (const document of dirty) {
      const file = physical(document.uri.fsPath);
      if (!isManagedProjectPath(file) && roots.some(root => sourceContains(root, file)))
        throw Error('Save the JOX document before executing saved source changes.');
    }
  }

  async sync(project, options = {}) {
    if (options.token?.isCancellationRequested) return { passed: false, code: 130, cancelled: true };
    await project.provider.requireSync({expectedWorkingIdentity:options.expectedWorkingIdentity});
    return this.withExecution(project, options, () => project.provider.sync({ ...options, beforeRequest: async () => {
      await options.beforeRequest?.();
      this.assertCleanRawJox(project);
      for (const document of this.vscode.workspace.textDocuments || []) {
        if (!document.isDirty || document.uri.scheme !== 'jade-source') continue;
        let owner;
        try { owner = this.projectForUri(document.uri); }
        catch (cause) { throw Error('Cannot verify which project owns an unsaved Jade editor. Save or close it before syncing.', { cause }); }
        if (!owner || owner === project) throw Error('Save the source document before syncing saved JOX changes.');
      }
    } }));
  }

  async execute(project, command, selection, options) {
    return this.withExecution(project, options, () => project.provider.execute(command, selection, options));
  }

  async executeBatch(project, command, operations, options) {
    return this.withExecution(project, options, () => project.provider.executeBatch(command, operations, options),
      () => operations.map(() => ({ result: { passed: false, code: 130, cancelled: true } })));
  }

  releaseExecution() {
    this.executing = false;
    for (const [changed, pending] of this.pendingChanges) this.scheduleRefresh(changed, !pending.needsPrepare);
  }

  async withExecution(project, options, operation, cancellation = () => ({ passed: false, code: 130, cancelled: true })) {
    const cancelled = () => options?.token?.isCancellationRequested;
    if (cancelled()) return cancellation();
    this.project(project.folder);
    if (this.executing) throw Error('Another Jade Working operation is running.');
    this.executing = true;
    try {
      await this.changing.get(project)?.promise;
      if (cancelled()) return cancellation();
      await this.beforeOperation?.();
      if (cancelled()) return cancellation();
      this.project(project.folder);
      await this.saveDirty(project, options?.token);
      return await operation();
    } finally {
      this.releaseExecution();
    }
  }

  register(context) {
    const delegate = async (method, uri, ...args) => {
      const project = await this.recover(uri);
      return project.files[method](uri, ...args);
    };
    const provider = { onDidChangeFile: this.events.event, watch: () => ({ dispose() {} }) };
    for (const method of ['stat', 'readFile', 'writeFile', 'readDirectory', 'createDirectory', 'delete', 'rename'])
      provider[method] = (uri, ...args) => delegate(method, uri, ...args);
    context.subscriptions.push(this.vscode.workspace.registerFileSystemProvider('jade-source', provider, { isCaseSensitive: true }), this);
    if (this.vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(this.vscode.workspace.onDidChangeWorkspaceFolders(() => this.retireClosedProjects()));
    if (this.vscode.workspace.onDidCloseTextDocument) context.subscriptions.push(this.vscode.workspace.onDidCloseTextDocument(document => {
      if (document.uri.scheme !== 'jade-source') return;
      // A language change also emits close/open while the URI remains open.
      // Let membership settle before releasing a genuinely closed clean editor.
      if (this.disposed || document.isDirty) return;
      setTimeout(() => {
        if (this.disposed || document.isDirty || (this.vscode.workspace.textDocuments || [])
          .some(open => open.uri.toString() === document.uri.toString())) return;
        for (const value of this.projects.values())
          void Promise.resolve(value.files.close(document.uri)).catch(error => this.reportError(error));
      }, 0);
    }));
  }

  dispose() {
    this.disposed = true;
    for (const pending of this.pendingChanges.values()) clearTimeout(pending.timer);
    this.pendingChanges.clear();
    for (const { source } of this.changing.values()) source?.cancel();
    for (const project of this.projects.values()) for (const watcher of project.watchers?.values() || []) watcher.dispose();
    this.sourceListeners.clear();
    for (const listeners of this.forwarding.values()) for (const listener of listeners) listener.dispose();
    for (const project of this.projects.values()) {
      void this.releaseProject(project).catch(error => this.reportError(error));
      project.files.dispose();
    }
    this.forwarding.clear(); this.projects.clear(); this.events.dispose();
  }
}

module.exports = { NativeSourceWorkspace };
