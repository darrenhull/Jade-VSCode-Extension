'use strict';
const path = require('node:path');
const { configDto } = require('./cli-client');
const { isManagedProjectPath } = require('./source-index-scope');
const { NativeSourceProvider } = require('./NativeSourceProvider');
const { JadeSourceFileSystemProvider } = require('./JadeSourceFileSystemProvider');

// Project handles and open documents only. Native owns the single source model.
class NativeSourceWorkspace {
  constructor({ vscode, client, configFor }) {
    this.vscode = vscode;
    this.client = client;
    this.configFor = configFor;
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

  project(folder) {
    if (this.disposed) throw Error('The native source workspace is closed.');
    const current = this.folders().find(value => value.uri.toString() === folder?.uri.toString());
    if (!current) throw Error('The selected Jade project is no longer open.');
    const supplied = { ...this.configFor(current), sourceFormat: 'jox' };
    const config = configDto(supplied);
    if (Object.hasOwn(supplied, 'workingJadeGitPolicy')) config.workingJadeGitPolicy = supplied.workingJadeGitPolicy;
    const key = current.uri.toString();
    let project = this.projects.get(key);
    if (!project) {
      const provider = new NativeSourceProvider({ client: this.client, config, projectRoot: current.uri.fsPath,
        validateContext: () => { if (this.project(current) !== project) throw Error('The selected source project changed.'); } });
      project = { folder: current, provider, files: new JadeSourceFileSystemProvider(this.vscode, provider) };
      this.projects.set(key, project);
      this.forwarding.set(project, [project.files.onDidChangeFile(changes => this.events.fire(changes)),
        project.files.onDidFinishSave(({ saved }) => { if (saved || this.pendingChanges.has(project)) this.scheduleRefresh(project, saved); })]);
    } else if (JSON.stringify(project.provider.config) !== JSON.stringify(config)) {
      throw Error('Jade project settings changed. Close its source editors and reload the window before continuing.');
    }
    return project;
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
    for (const value of project.files.documents.values()) {
      const currentState = () => {
        const document = (this.vscode.workspace.textDocuments || []).find(item => item.uri.toString() === value.uri.toString());
        return { document, dirty: document?.isDirty === true, version: document?.version };
      };
      await project.files.refresh(value.uri, { currentState });
    }
    await Promise.all([...this.sourceListeners].map(listener => Promise.resolve().then(() => listener(project))));
    return project;
  }

  onDidChangeSource(listener) { this.sourceListeners.add(listener); return { dispose: () => this.sourceListeners.delete(listener) }; }

  observeSources(project) {
    if (!this.vscode.workspace.createFileSystemWatcher || !this.vscode.RelativePattern) return;
    const roots = new Set(project.provider.sourceRoots), watchers = project.watchers ||= new Map();
    for (const [root, watcher] of watchers) if (!roots.has(root)) { watcher.dispose(); watchers.delete(root); }
    for (const root of roots) if (!watchers.has(root)) {
      const watcher = this.vscode.workspace.createFileSystemWatcher(new this.vscode.RelativePattern(this.vscode.Uri.file(root), '**/*.[jJ][oO][xX]'));
      const changed = uri => { if (uri.scheme === 'file' && !isManagedProjectPath(uri.fsPath)) this.scheduleRefresh(project); };
      watcher.onDidChange(changed); watcher.onDidCreate(changed); watcher.onDidDelete(changed);
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

  retireClosedProjects() {
    const open = new Set(this.folders().map(folder => folder.uri.toString()));
    for (const project of this.projects.values()) if (!open.has(project.folder.uri.toString())) {
      const pending = this.pendingChanges.get(project); if (pending) clearTimeout(pending.timer);
      this.pendingChanges.delete(project); this.changing.get(project)?.source?.cancel();
      for (const watcher of project.watchers?.values() || []) watcher.dispose();
      project.watchers?.clear();
    }
  }

  projectForUri(uri) {
    if (uri?.scheme === 'jade-source') {
      for (const project of this.projects.values()) {
        if (project.files.documents.has(uri.toString())) return this.project(project.folder);
      }
      throw Error('The native source editor has no open project binding.');
    }
    const folder = uri && this.vscode.workspace.getWorkspaceFolder(uri);
    if (folder) return this.project(folder);
    if (this.folders().length === 1) return this.project(this.folders()[0]);
    throw Error('Choose the Jade project before this operation.');
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
    const page = await project.provider.query({ kind: 'type', search: name, offset: 0, limit: 100 });
    const matches = page.items.filter(entity => entity.name === name && entity.qualifiedName?.schema === schema);
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

  async saveDirty(project) {
    for (const document of this.vscode.workspace.textDocuments || []) {
      if (document.uri.scheme === 'jade-source' && project.files.documents.has(document.uri.toString()) && document.isDirty && !await document.save())
        throw Error('Save the source document before executing saved JOX changes.');
    }
    // Never upload a different saved origin while its ordinary JOX file is dirty.
    for (const document of this.vscode.workspace.textDocuments || []) {
      if (document.uri.scheme === 'file' && document.isDirty && /\.jox$/i.test(document.uri.fsPath) &&
          this.vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() === project.folder.uri.toString())
        throw Error('Save the JOX document before executing saved source changes.');
    }
  }

  async execute(project, command, selection, options) {
    return this.withExecution(project, options, () => project.provider.execute(command, selection, options));
  }

  async executeBatch(project, command, operations, options) {
    return this.withExecution(project, options, () => project.provider.executeBatch(command, operations, options),
      () => operations.map(() => ({ result: { passed: false, code: 130, cancelled: true } })));
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
      await this.saveDirty(project);
      return await operation();
    } finally {
      this.executing = false;
      for (const [changed, pending] of this.pendingChanges) this.scheduleRefresh(changed, !pending.needsPrepare);
    }
  }

  register(context) {
    const delegate = (method, uri, ...args) => this.projectForUri(uri).files[method](uri, ...args);
    const provider = { onDidChangeFile: this.events.event, watch: () => ({ dispose() {} }) };
    for (const method of ['stat', 'readFile', 'writeFile', 'readDirectory', 'createDirectory', 'delete', 'rename'])
      provider[method] = (uri, ...args) => delegate(method, uri, ...args);
    context.subscriptions.push(this.vscode.workspace.registerFileSystemProvider('jade-source', provider, { isCaseSensitive: true }), this);
    if (this.vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(this.vscode.workspace.onDidChangeWorkspaceFolders(() => this.retireClosedProjects()));
    if (this.vscode.workspace.onDidCloseTextDocument) context.subscriptions.push(this.vscode.workspace.onDidCloseTextDocument(document => {
      if (document.uri.scheme !== 'jade-source') return;
      for (const value of this.projects.values()) value.files.close(document.uri);
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
    for (const project of this.projects.values()) project.files.dispose();
    this.forwarding.clear(); this.projects.clear(); this.events.dispose();
  }
}

module.exports = { NativeSourceWorkspace };
