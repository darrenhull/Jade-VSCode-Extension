'use strict';
// The existing Tools view contains command metadata only. Native project
// discovery and operations remain owned by the registered JOX commands.
function registerJoxTools(vscode, context) {
  const actions = [
    ['Set Up Project', 'jadeNative.setupProject', 'folder-open'],
    ['Detect Runtime Settings', 'jadeNative.discover', 'settings-gear'],
    ['Refresh Object Explorer', 'jadeNative.refreshClassView', 'refresh'],
    ['Refresh Tests', 'jadeNative.refreshTests', 'testing-run-icon']
  ];
  const provider = {
    getTreeItem: row => row,
    getChildren: parent => parent ? [] : actions.map(([label, command, icon]) => {
      const row = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      row.id = command;
      row.command = { command, title: label };
      row.iconPath = new vscode.ThemeIcon(icon);
      return row;
    })
  };
  const view = vscode.window.createTreeView('jadeNative.tools', { treeDataProvider: provider });
  context.subscriptions.push(view);
  return { provider, view };
}
module.exports = { registerJoxTools };
