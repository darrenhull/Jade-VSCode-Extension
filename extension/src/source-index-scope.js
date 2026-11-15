"use strict";
const path = require("node:path"),
  { isNestedSnapshot } = require("./source-snapshots");
function isManagedProjectPath(file){return typeof file==='string'&&/(?:^|[\\/])\.jade(?:[\\/]|$)/i.test(file);}
function isIndexableSourcePath(file) {
  return (
    typeof file === "string" && !isManagedProjectPath(file) &&
    (/\.(cls|jade)$/i.test(file) ||
      /(?:^|[\\/])schemaDefinitions\.sec$/i.test(file))
  );
}
/** One terminal discovery for an uncertain native scope, never per-file scans. */
async function queueSourceIndexScope(vscode, index, destination) {
  const root = path.resolve(destination),
    pattern = new vscode.RelativePattern(
      vscode.Uri.file(root),
      "**/{*.cls,*.jade,schemaDefinitions.sec}",
    );
  const uris = await vscode.workspace.findFiles(
    pattern,
    "**/{node_modules,.git,.jade}/**",
  );
  let queued = 0;
  for (const uri of uris) {
    if (uri.scheme !== "file" || !isIndexableSourcePath(uri.fsPath)) continue;
    const relative = path.relative(root, uri.fsPath);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative) ||
      isNestedSnapshot(uri, vscode.workspace)
    )
      continue;
    index.schedule(uri.toString());
    queued++;
  }
  return queued;
}
module.exports = { isManagedProjectPath, isIndexableSourcePath, queueSourceIndexScope };
