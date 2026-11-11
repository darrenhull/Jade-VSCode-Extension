"use strict";
const fs = require("node:fs"), path = require("node:path");
const { jadeSourceUri } = require("./active-jade-source");
const { parseSource } = require("./source_symbols");
const { topLevelMatches } = require("./source-context");
const { resolveExtractionDirectory } = require("./extract");
const { sourceTargetPath, pathIdentity } = require("./source-pull-path");
const inside = (root, file) => { const relative = path.relative(root, file); return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };

function savedIdentity(model) {
  // Tokens come from the native interface file control, after lexer masking.
  const interfaceSection = topLevelMatches(model.code, /^\s*interfaceDefs\s*$/gm);
  if (interfaceSection.length) {
    const interfaces = topLevelMatches(model.code, /^\s*([A-Za-z_]\w*)\s+number\s*=\s*\d+\s*\(/gm);
    if (interfaces.length === 1 && !model.classes.length) return { name: interfaces[0][1], kind: "interface" };
  } else if (model.classes.length === 1) return { name: model.classes[0].name, kind: "class" };
  throw Error("Choose one saved single-class/interface CLS file with a schema identity.");
}

/** Resolve UI identity only. Jade/CLI remain responsible for source extraction. */
async function resolveSourcePullSelection(vscode, resource, settingsForFolder, {prepareSource} = {}) {
  const row = resource && ["class", "interface"].includes(resource.kind) && resource.schema && resource.name ? resource : undefined;
  let uri;
  if (row) {
    const entry = row.entries?.find(value => !value.cls?.partial) || row.entries?.[0];
    const file = row.file || entry?.model?.uri;
    if (file) uri = typeof file === "string" ? vscode.Uri.parse(file) : file;
  } else uri = jadeSourceUri(vscode, resource);
  const rootUri = row?.projectRoot ? vscode.Uri.file(row.projectRoot) : uri;
  const folder = rootUri && vscode.workspace.getWorkspaceFolder(rootUri);
  if (!folder || row?.projectRoot && pathIdentity(row.projectRoot) !== pathIdentity(folder.uri.fsPath))
    throw Error("Choose a class in an open workspace project.");
  const settings = settingsForFolder(folder);
  let destination = resolveExtractionDirectory(folder.uri.fsPath, settings.extractionDirectory);
  if (uri && !inside(destination, uri.fsPath)) destination = folder.uri.fsPath;
  if (!fs.existsSync(destination)) throw Error("Create the configured source folder before pulling class sources.");
  let schema = row?.schema, name = row?.name, kind = row?.kind || "class";
  if (!uri) {
    if (![schema, name].every(value => typeof value === "string" && /^[A-Za-z_][A-Za-z_0-9]*$/.test(value)))
      throw Error("Choose a schema-qualified class or interface.");
    uri = vscode.Uri.file(sourceTargetPath(destination, "schemas/" + schema + "/types/" + name + ".cls"));
  }
  if (uri.scheme !== "file" || !/\.cls$/i.test(uri.fsPath) || !inside(folder.uri.fsPath, uri.fsPath))
    throw Error("Choose a saved CLS file in this workspace.");
  if(prepareSource&&await prepareSource(uri)===false)throw Error("Restore or discard the pending class-view draft before pulling Source.");
  if (fs.existsSync(uri.fsPath)) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.isDirty) throw Error("Save or discard unsaved editor changes before pulling this class from Source.");
    const model = parseSource(fs.readFileSync(uri.fsPath, "utf8"), uri.toString());
    const saved = savedIdentity(model);
    if (!model.schema) throw Error("Choose a saved CLS with a schema identity.");
    if (!row) { schema = model.schema; name = saved.name; kind = saved.kind; }
    else if (model.schema !== schema || saved.name !== name || saved.kind !== kind)
      throw Error("The selected class identity no longer matches its saved file. Refresh Object Explorer.");
  } else if (!row) throw Error("Save a class file before pulling it from Source.");
  const relative = path.relative(destination, uri.fsPath).split(path.sep).join("/");
  sourceTargetPath(destination, relative);
  const configuration = { ...settings }; delete configuration.program;
  return { folder, destination, selection: [{ schema, name, kind, path: relative }],
    config: { ...configuration, schema, workspaceRoots: [folder.uri.fsPath] } };
}
module.exports = { resolveSourcePullSelection };
