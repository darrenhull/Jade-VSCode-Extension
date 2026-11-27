'use strict';
function registerNativeSourceExplorer(vscode, context, workspace, classWorkspaces) {
  const events = new vscode.EventEmitter();
  const pageSize = 100;
  const provider = {
    onDidChangeTreeData: events.event,
    getTreeItem(row) {
      const label = row.label || row.entity?.name || row.project.folder.name;
      const expandable = row.queryKind || row.kind === 'project';
      const item = new vscode.TreeItem(label, expandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
      item.id = JSON.stringify([row.project.folder.uri.toString(), row.entity?.id || row.parentId || '', row.kind, row.offset || 0,
        ...(row.kind === 'page' ? [row.queryKind] : []),
        ...(row.kind === 'project' && row.project.explorerRevision ? ['view', row.project.explorerRevision] : [])]);
      item.description = row.entity?.signature || row.entity?.qualifiedName?.schema;
      item.contextValue = !row.entity ? 'jadeSourceProject' : row.entity.kind === 'schema' ? 'jadeSourceSchema'
        : ['class', 'interface', 'primitive', 'type'].includes(row.entity.kind) ? 'jadeSourceClass'
          : row.entity.kind === 'method' ? 'jadeSourceMethod' : 'jadeSourceMember';
      if (row.entity && row.entity.kind !== 'schema') item.command = { command: item.contextValue === 'jadeSourceClass' ? 'jadeNative.openClassWorkspace' : 'jadeNative.showClassMember', title: 'Open Jade source', arguments: [row] };
      return item;
    },
    async getChildren(row) {
      if (!row) return workspace.folders().map(folder => ({ kind: 'project', project: workspace.project(folder) }));
      const project = await workspace.ensurePrepared(row.project.folder);
      if (row.kind !== 'project' && row.generation !== project.provider.binding().generation) throw Error('The source catalogue changed. Refresh Classes before continuing.');
      const kind = row.kind === 'project' ? 'schema' : row.queryKind;
      if (!kind) return [];
      const page = await project.provider.query({ kind, parentId: row.parentId || row.entity?.id, offset: row.offset || 0, limit: pageSize });
      const generation = page.generation;
      const children = page.items.map(entity => ({ kind: 'entity', project, entity, generation,
        ...(kind === 'member' ? { typeEntity: row.typeEntity || row.entity } : {}),
        queryKind: entity.kind === 'schema' ? 'type' : ['class', 'interface', 'primitive', 'type'].includes(entity.kind) ? 'member' : undefined }));
      if (page.nextOffset !== null) children.push({ kind: 'page', label: 'MoreÃ¢â‚¬Â¦', project, generation, queryKind: kind,
        parentId: row.parentId || row.entity?.id, offset: page.nextOffset,
        ...(kind === 'member' ? { typeEntity: row.typeEntity || row.entity } : {}) });
      return children;
    }
  };
  const view = vscode.window.createTreeView('jadeNative.classes', { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(events, view);
  if (workspace.onDidInvalidateSource) context.subscriptions.push(workspace.onDidInvalidateSource(() => events.fire()));
  const open = async row => {
    if (!row?.project || !row.entity?.id) throw Error('Select a member from the native source catalogue.');
    if (row.generation && row.generation !== row.project.provider.binding().generation)
      throw Error('The source catalogue changed. Refresh Classes before opening this member.');
    return workspace.open(row.project, row.entity.id);
  };
  for (const id of ['jadeNative.showClassMember', 'jadeNative.previewClassMember', 'jadeNative.openOriginalSource'])
    context.subscriptions.push(vscode.commands.registerCommand(id, open));
  context.subscriptions.push(vscode.commands.registerCommand('jadeNative.openClassWorkspace', row => classWorkspaces.open(row)));
  const refresh = async () => {
    for (const folder of workspace.folders()) await workspace.refresh(folder);
    events.fire();
  };
  context.subscriptions.push(vscode.commands.registerCommand('jadeNative.refreshClassView', refresh));
  if (vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { void refresh().catch(error => workspace.reportError(error)); }));
  return { provider, view, open, refresh, changed: async project => { await classWorkspaces.refresh(project); events.fire(); } };
}
module.exports = { registerNativeSourceExplorer };
