'use strict';
const fs = require('node:fs');
const path = require('node:path');

// A baseline remains inspectable without shadowing edited workspace classes.
// Opening the baseline itself as a workspace makes it a normal source root.
function isNestedSnapshot(uri, workspace, markers) {
  const root = workspace.getWorkspaceFolder?.(uri)?.uri.fsPath;
  if (!root) return false;
  let directory = path.dirname(uri.fsPath);
  const workspaceRoot = path.resolve(root);
  // Native cache URIs use canonical Windows spelling; the open workspace may
  // differ in case. Compare path identity before considering its root marker.
  while (path.relative(workspaceRoot,directory) !== '' && directory !== path.dirname(directory)) {
    const relative=path.relative(workspaceRoot,directory);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))break;
    let exists=markers?.get(directory);
    if(exists===undefined){exists=fs.existsSync(path.join(directory,'.jade-extraction'));markers?.set(directory,exists);}
    if(exists)return true;
    directory = path.dirname(directory);
  }
  return false;
}
module.exports = { isNestedSnapshot };
