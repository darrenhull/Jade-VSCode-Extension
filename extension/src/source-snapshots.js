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
  while (directory !== workspaceRoot && directory !== path.dirname(directory)) {
    let exists=markers?.get(directory);
    if(exists===undefined){exists=fs.existsSync(path.join(directory,'.jade-extraction'));markers?.set(directory,exists);}
    if(exists)return true;
    directory = path.dirname(directory);
  }
  return false;
}
module.exports = { isNestedSnapshot };
