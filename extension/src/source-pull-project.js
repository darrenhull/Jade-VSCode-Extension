"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { resolveExtractionDirectory } = require("./extract");
/** Resolve an open empty project; native configuration owns Jade validation. */
function resolveSourcePullProject(vscode, folder, settingsForFolder) {
  const current =
    folder?.uri?.scheme === "file" &&
    vscode.workspace.getWorkspaceFolder(folder.uri);
  if (
    !current ||
    path.resolve(current.uri.fsPath).toLowerCase() !==
      path.resolve(folder.uri.fsPath).toLowerCase()
  )
    throw Error(
      "Choose an open source project folder before extracting Source.",
    );
  const settings = { ...settingsForFolder(current) };
  delete settings.program;
  const destination = resolveExtractionDirectory(
    current.uri.fsPath,
    settings.extractionDirectory,
  );
  if (fs.existsSync(destination) && !fs.statSync(destination).isDirectory())
    throw Error("The configured extraction destination is not a folder.");
  return {
    folder: current,
    destination,
    cwd: current.uri.fsPath,
    config: { ...settings, workspaceRoots: [current.uri.fsPath] },
  };
}
module.exports = { resolveSourcePullProject };
