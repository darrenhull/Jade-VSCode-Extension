'use strict';
const { registerClassCatalogue } = require('./class-catalogue');
function registerNativeSourceCatalogue(vscode, context, workspace, classWorkspaces) {
  let project;
  const catalogue = registerClassCatalogue(vscode, context, {
    scope: 'workspace', label: 'Object Explorer — Classes',
    getPage: async filter => {
      if (!project) throw Error('Choose a Jade source project.');
      workspace.project(project.folder);
      if (!project.provider.snapshot) await workspace.prepare(project.folder);
      let parentId;
      if (filter.schema) {
        const schemas = await project.provider.query({ kind: 'schema', search: filter.schema, offset: 0, limit: 100 });
        const matching = schemas.items.filter(item => item.name === filter.schema);
        if (matching.length !== 1) throw Error('The selected schema is no longer available in the native catalogue.');
        parentId = matching[0].id;
      }
      const page = await project.provider.query({ kind: 'type', parentId, search: filter.query || '', offset: filter.offset || 0, limit: 100 });
      const rows = page.items.map(entity => ({ provider: 'jox', entityId: entity.id, nativeEntity: entity,
        projectId: page.projectId, projectName: project.folder.name, schema: entity.qualifiedName?.schema,
        name: entity.name, kind: entity.kind }));
      return { rows, generation: page.generation, page: { items: rows, total: page.total, offset: page.offset, limit: page.limit,
        hasMore: page.nextOffset !== null, nextOffset: page.nextOffset, hasPrevious: page.offset > 0,
        previousOffset: Math.max(0, page.offset - page.limit), label: page.total ? (page.offset + 1) + '–' + (page.offset + rows.length) + ' of ' + page.total + ' types' : '0 types' } };
    },
    refreshPage: async () => { if (project) await workspace.refresh(project.folder); },
    openClass: (row, metadata) => {
      const binding = project.provider.binding();
      if (metadata.generation !== binding.generation || row.projectId !== binding.projectId)
        throw Error('The source catalogue changed. Refresh Classes before opening this type.');
      return classWorkspaces.open({ project, entity: row.nativeEntity });
    }
  });
  const show = async row => {
    let folder = row?.project?.folder;
    if (!folder) folder = workspace.folders().length === 1 ? workspace.folders()[0]
      : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Choose the Jade source project' });
    if (!folder) return;
    project = await workspace.prepare(folder);
    return catalogue.show(row?.entity?.kind === 'schema' ? { schema: row.entity.name } : {});
  };
  context.subscriptions.push(vscode.commands.registerCommand('jadeNative.browseSourceClasses', show));
  context.subscriptions.push(vscode.commands.registerCommand('jadeNative.findSourceClass', async (name, schema, projectRoot) => {
    if (!name || !schema) return show();
    const row = await workspace.findClass(name, schema, projectRoot);
    return row ? classWorkspaces.open(row) : { opened: false, reason: 'No matching native source declaration was found.' };
  }));
  return { show, refresh: catalogue.refresh, snapshot: catalogue.snapshot, get panel() { return catalogue.panel; } };
}
module.exports = { registerNativeSourceCatalogue };
