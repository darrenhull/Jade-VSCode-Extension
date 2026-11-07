"use strict";
const fs = require("node:fs/promises"), path = require("node:path"), crypto = require("node:crypto");
const { canonicalIdentity: identity } = require("./creation-files");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const inside = (root, file) => { const relative = path.relative(root, file); return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };
async function stat(file) { try { return await fs.lstat(file); } catch (error) { if (error.code === "ENOENT") return; throw error; } }

// Existing native metadata is edited through VS Code's text model, preserving
// its encoding, normal undo history and save-conflict handling. This adapter is
// used only by reviewed plans that include an existing-file update; the ordinary
// new-file writer remains unchanged.
async function applyCreationWorkspaceEdit(vscode, root, generated, { dirtyPaths = [], dirtyFiles = [] } = {}) {
  const lexicalRoot = path.resolve(root), canonicalRoot = await fs.realpath(lexicalRoot);
  if (!Array.isArray(generated?.files) || !generated.files.some(file => file.operation === "update")) throw Error("A reviewed existing-file update is required for this save operation.");
  const dirty = new Set([...dirtyPaths, ...dirtyFiles].map(identity)), seen = new Set(), prepared = [];
  async function checkParent(file) {
    let parent = path.dirname(file);
    while (!await stat(parent)) { const next = path.dirname(parent); if (next === parent) throw Error("Cannot resolve source parent: " + file); parent = next; }
    const actual = await fs.realpath(parent);
    if (identity(actual) !== identity(canonicalRoot) && !inside(canonicalRoot, actual)) throw Error("Source folder points outside the selected workspace.");
  }
  const documentIdentity = document => {
    if (!["file", "untitled"].includes(document.uri.scheme) || !path.isAbsolute(document.uri.fsPath)) return;
    try { return identity(document.uri.fsPath); } catch { return undefined; }
  };
  async function checkDisk(entry) {
    await checkParent(entry.file);
    if (entry.update) {
      const actual = await fs.realpath(entry.file);
      if (!inside(canonicalRoot, actual)) throw Error("Existing source file points outside the selected workspace.");
      if (digest(await fs.readFile(entry.file)) !== entry.expectedHash) throw Error("Source changed on disk since review: " + entry.file);
    } else if (await stat(entry.file)) throw Error("Source file already exists: " + entry.file);
  }
  for (const entry of generated.files) {
    if (typeof entry?.file !== "string" || typeof entry.text !== "string") throw Error("Invalid reviewed source file.");
    const file = path.resolve(entry.file), key = identity(file), update = entry.operation === "update";
    if (!inside(lexicalRoot, file) && !inside(canonicalRoot, file)) throw Error("Reviewed source files must remain within the selected workspace.");
    if (seen.has(key)) throw Error("Reviewed source files contain duplicate paths.");
    if (entry.operation && !["update", "create"].includes(entry.operation)) throw Error("Unsupported source edit operation.");
    seen.add(key);
    if (dirty.has(key) || vscode.workspace.textDocuments.some(document => document.isDirty && documentIdentity(document) === key)) throw Error("An unsaved editor already uses this file: " + file);
    if (update && (typeof entry.expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(entry.expectedHash) || typeof entry.expectedText !== "string")) throw Error("Existing metadata updates require their reviewed hash and original text.");
    const item = { ...entry, file, update, uri: vscode.Uri.file(file) };
    await checkDisk(item);
    if (update) {
      item.document = await vscode.workspace.openTextDocument(item.uri);
      item.version = item.document.version;
      if (item.document.isDirty || item.document.getText() !== item.expectedText) throw Error("Source editor changed since review: " + file);
    }
    prepared.push(item);
  }
  // Recheck every target after asynchronous document opening. Use VS Code's
  // standard workspace edit rather than direct file rewrites, and detect user
  // or on-save changes before saving or claiming success.
  for (const item of prepared) {
    await checkDisk(item);
    if (item.document && (item.document.isDirty || item.document.version !== item.version || item.document.getText() !== item.expectedText)) throw Error("Source editor changed since review: " + item.file);
  }
  const savedFiles = [];
  async function outcome() {
    const createdFiles = [], dirtyFiles = [], changedFiles = [], inspectionErrors = [];
    for (const item of prepared) {
      try {
        const documents = vscode.workspace.textDocuments.filter(document => documentIdentity(document) === identity(item.file));
        if (documents.some(document => document.isDirty)) dirtyFiles.push(item.file);
        const exists = await stat(item.file);
        if (!item.update && exists) createdFiles.push(item.file);
        if (documents.some(document => document.isDirty) || !item.update && exists || item.update && (!exists || digest(await fs.readFile(item.file)) !== item.expectedHash)) changedFiles.push(item.file);
      } catch (error) { inspectionErrors.push({ file: item.file, message: error.message }); }
    }
    return { savedFiles: [...savedFiles], dirtyFiles, createdFiles, changedFiles, inspectionErrors };
  }
  try {
    for (const item of prepared) {
      if (!await stat(path.dirname(item.file))) await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(item.file)));
      await checkDisk(item);
    }
    for (const item of prepared) {
      if (item.document && (item.document.isDirty || item.document.version !== item.version || item.document.getText() !== item.expectedText)) throw Error("Source editor changed before applying the reviewed edit: " + item.file);
      if (!item.update && vscode.workspace.textDocuments.some(document => document.isDirty && documentIdentity(document) === identity(item.file))) throw Error("An unsaved editor now uses the new source file: " + item.file);
    }
    const edit = new vscode.WorkspaceEdit();
    for (const item of prepared) {
      if (item.update) edit.replace(item.uri, new vscode.Range(item.document.positionAt(0), item.document.positionAt(item.expectedText.length)), item.text);
      else {
        edit.createFile(item.uri, { overwrite: false, ignoreIfExists: false });
        // Insertions are normalised to the document's EOL by VS Code. Set the
        // reviewed source's EOL in the same edit so files.eol cannot change it.
        const eol = item.text.includes("\r\n") ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF;
        edit.set(item.uri, [vscode.TextEdit.insert(new vscode.Position(0, 0), item.text), vscode.TextEdit.setEndOfLine(eol)]);
      }
    }
    if (!await vscode.workspace.applyEdit(edit)) throw Error("VS Code could not apply every reviewed source edit.");
    for (const item of prepared) {
      item.document = await vscode.workspace.openTextDocument(item.uri);
      item.appliedVersion = item.document.version;
      if (item.document.getText() !== item.text) throw Error("The source editor changed during the reviewed edit: " + item.file);
      item.diskHash = digest(await fs.readFile(item.file));
      if (item.update && item.diskHash !== item.expectedHash) throw Error("Source changed on disk while applying the reviewed edit: " + item.file);
    }
    for (const item of prepared) {
      await checkParent(item.file);
      if (!inside(canonicalRoot, await fs.realpath(item.file))) throw Error("Source file now points outside the selected workspace: " + item.file);
      if (item.document.version !== item.appliedVersion || item.document.getText() !== item.text) throw Error("The source editor changed before saving: " + item.file);
      if (vscode.workspace.textDocuments.some(document => document !== item.document && document.isDirty && documentIdentity(document) === identity(item.file))) throw Error("Another editor for the same physical file has unsaved changes: " + item.file);
      if (digest(await fs.readFile(item.file)) !== item.diskHash) throw Error("Source changed on disk before saving: " + item.file);
      if (!await item.document.save()) throw Error("VS Code could not save the reviewed file: " + item.file);
      savedFiles.push(item.file);
      if (item.document.isDirty || item.document.getText() !== item.text) throw Error("A user or on-save action changed the reviewed source: " + item.file);
    }
    return { files: prepared.map(item => item.file), ...(generated.header ? { header: generated.header } : {}) };
  } catch (cause) {
    const state = await outcome();
    const describe = values => values.length ? values.join(", ") : "none";
    const error = Error("Reviewed source save did not finish. Saved files: " + describe(state.savedFiles) + ". Dirty editors: " + describe(state.dirtyFiles) + ". Newly created files: " + describe(state.createdFiles) + ". " + cause.message + (state.inspectionErrors.length ? " Some file states could not be inspected: " + describe(state.inspectionErrors.map(item => item.file)) + "." : "") + " Existing edits have been preserved; review these files before retrying.", { cause });
    error.outcome = state;
    error.field = "map-file";
    throw error;
  }
}
module.exports = { applyCreationWorkspaceEdit };
