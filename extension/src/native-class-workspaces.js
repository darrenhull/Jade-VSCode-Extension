'use strict';
const { createClassWorkspaces } = require('./class-workspace');
const groupNames = { property: 'Properties', reference: 'References', method: 'Methods', typeMethod: 'Type methods', constant: 'Constants', key: 'Collection keys', base: 'Inheritance' };

function nativeMember(entity, owner = entity.qualifiedName?.type) {
  return { ...entity, nativeEntity: entity, owner, schema: entity.qualifiedName?.schema,
    kind: entity.flags?.typeMethod === true ? 'typeMethod' : entity.kind, detail: entity.signature,
    inherited: entity.flags?.inherited === true, system: entity.flags?.system === true };
}

function createNativeClassWorkspaceModel({ workspace } = {}) {
  return {
    async load(row, state = {}) {
      if (workspace && workspace.project(row.project.folder) !== row.project) throw Error('The class project changed. Reopen it from Object Explorer.');
      const binding = row.project.provider.binding();
      const page = await row.project.provider.query({ kind: 'member', parentId: row.entity.id,
        ...(state.kind && state.kind !== 'all' ? { memberKind: state.kind } : {}), search: state.query || '',
        includeInherited: state.includeInherited === true, offset: state.offset || 0, limit: 100 });
      const groups = new Map();
      const members = page.items.map(entity => nativeMember(entity));
      for (const member of members) {
        const label = groupNames[member.kind] || 'Other members';
        if (!groups.has(label)) groups.set(label, { label, items: [] });
        groups.get(label).items.push(member);
      }
      const schema = row.entity.qualifiedName?.schema;
      return { identity: { provider: binding.provider, projectId: binding.projectId, entityId: row.entity.id,
        name: row.entity.name, owner: row.entity.name, schema, qualifiedName: [schema, row.entity.name].filter(Boolean).join('::'),
        projectRoot: row.project.folder.uri.fsPath, projectName: row.project.folder.name, file: row.file },
        groups: [...groups.values()], total: page.total, offset: page.offset, hasMore: page.nextOffset !== null,
        selected: members.find(member => member.id === state.selectedId) || (row.selectedMember?.id === state.selectedId ? row.selectedMember : undefined),
        inheritedAvailable: page.inheritedAvailable === true, inheritedReason: page.inheritedReason || 'Inherited metadata has not been qualified by the native source provider.',
        overview: { source: row.file, description: row.entity.signature || '', counts: [{ label: 'Members', count: page.total }] } };
    }
  };
}

function registerNativeClassWorkspaces(vscode, context, workspace, options = {}) {
  const model = createNativeClassWorkspaceModel({ workspace }), pending = new Map(), views = new Map();
  const keyFor = row => JSON.stringify([row.project.provider.binding().projectId, row.entity.id]);
  const sourceUri = async (row, entityId) => row.project.files.open(entityId);
  const original = async (row, id) => workspace.open(row.project, id || row.entity.id, undefined, { viewColumn: vscode.ViewColumn.Beside });
  const shell = createClassWorkspaces(vscode, context, { load: model.load,
    onOriginal: (row, id) => original(row, id),
    onBack: row => options.back?.(row),
    onInstances: row => options.instances?.({ schema: row.entity.qualifiedName?.schema, className: row.entity.name, projectRoot: row.project.folder.uri.fsPath })
  });
  const provider = {
    async resolveCustomTextEditor(document, panel) {
      const row = pending.get(document.uri.toString());
      if (!row || workspace.record(document.uri).document.entityId !== row.entity.id) throw Error('Open this class from the native source catalogue.');
      pending.delete(document.uri.toString());
      let selectedDocument = document;
      const view = shell.attach({ document, panel, row, selectedId: row.selectedMember?.id, services: {
        async openMember(member, { openNative = false, isCurrent = () => true } = {}) {
          row.selectedMember = member;
          if (member.system) return { available: false, readOnly: true, editorMode: 'native', owner: member.owner, member: member.name,
            kind: member.kind, text: member.signature || member.detail || member.name, reason: 'System declarations are read-only.' };
          const uri = await sourceUri(row, member.id);
          const nextDocument = await vscode.workspace.openTextDocument(uri);
          await vscode.languages.setTextDocumentLanguage(nextDocument, 'jade-nz');
          const native = row.project.files.binding(uri);
          if (!isCurrent()) return;
          selectedDocument = nextDocument;
          if (member.inherited) return { available: false, readOnly: true, editorMode: 'native', owner: member.owner, member: member.name,
            kind: member.kind, text: selectedDocument.getText(), reason: 'This inherited declaration is read-only here. Open Original Source to edit its declaration explicitly.' };
          if (openNative) await original(row, member.id);
          return { available: true, editorMode: 'native', readOnly: !row.project.files.editable(native),
            owner: member.owner, member: member.name, kind: member.kind, uri: uri.toString(),
            text: selectedDocument.getText(), version: selectedDocument.version, dirty: selectedDocument.isDirty };
        },
        openOriginal: () => original(row, row.selectedMember?.id),
        save: () => {
          if (row.selectedMember?.inherited || row.selectedMember?.system) throw Error('Save this declaration in its native source editor.');
          return selectedDocument.save();
        },
        currentDocument: () => selectedDocument,
        build: () => vscode.commands.executeCommand('jadeNative.compileClass', selectedDocument.uri),
        runTests: () => vscode.commands.executeCommand('jadeNative.runLocalTests', selectedDocument.uri),
        publish: () => vscode.commands.executeCommand('jadeNative.publishClass', selectedDocument.uri)
      } });
      const key = keyFor(row);
      views.set(key, { panel, view, row });
      panel.onDidDispose(() => { if (views.get(key)?.view === view) views.delete(key); view.dispose(); });
    },
    dispose() { for (const { panel } of views.values()) panel.dispose(); views.clear(); shell.dispose(); }
  };
  context.subscriptions.push(vscode.window.registerCustomEditorProvider('jade.classWorkspace', provider, { supportsMultipleEditorsPerDocument: false }), provider);
  async function open(input) {
    const project = workspace.project(input?.project?.folder);
    if (project !== input.project) throw Error('The selected class has no current native project binding.');
    const type = input.typeEntity || input.entity;
    if (!['class', 'interface', 'primitive', 'type'].includes(type?.kind)) throw Error('Choose a class from the native source catalogue.');
    const nativeBinding = project.provider.binding();
    const row = { ...input, provider: nativeBinding.provider, projectId: nativeBinding.projectId, entityId: type.id,
      entity: type, ...(input.typeEntity ? { selectedMember: nativeMember(input.entity, type.name) } : {}) };
    const key = keyFor(row), existing = views.get(key);
    if (existing) { existing.panel.reveal(existing.panel.viewColumn); if (row.selectedMember) await existing.view.select(row.selectedMember.id); return { opened: true, reused: true }; }
    const uri = await sourceUri(row, type.id);
    row.file = uri.toString(); pending.set(row.file, row);
    try { await vscode.commands.executeCommand('vscode.openWith', uri, 'jade.classWorkspace', { preview: false }); }
    catch (error) { pending.delete(row.file); throw error; }
    return { opened: true, uri: row.file };
  }
  return { open, provider, refresh: project => Promise.all([...views.values()].filter(value => !project || value.row.project === project).map(value => value.view.refresh())) };
}
module.exports = { createNativeClassWorkspaceModel, registerNativeClassWorkspaces };
