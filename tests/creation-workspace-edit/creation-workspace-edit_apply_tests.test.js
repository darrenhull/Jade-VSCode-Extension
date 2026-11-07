"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { applyCreationWorkspaceEdit } = require("../../extension/src/creation-workspace-edit");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function fixture({ defaultEol = 2 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-workspace-edit-test-")), file = path.join(root, "databaseDefinitions.sec"), newFile = path.join(root, "FishArray.cls");
  const original = "databaseDefinitions\r\nPetsDb\r\n(\r\n)\r\n", updated = original.replace(")", "classMapDefinitions\r\nFishArray in \"pets\";\r\n)");
  const originalBytes = Buffer.concat([Buffer.from([255, 254]), Buffer.from(original, "utf16le")]); fs.writeFileSync(file, originalBytes);
  const docs = new Map(), calls = []; let applyHook, failSave;
  function document(file) {
    if (docs.has(file)) return docs.get(file);
    const bytes = fs.readFileSync(file), utf16 = bytes[0] === 255 && bytes[1] === 254;
    const text = utf16 ? bytes.subarray(2).toString("utf16le") : bytes.toString("utf8");
    const doc = { uri: { fsPath: file, scheme: "file", toString: () => file }, version: 1, isDirty: false, eol: text.includes("\r\n") ? 2 : text.includes("\n") ? 1 : defaultEol, text, getText() { return this.text; }, positionAt(offset) { return { offset }; }, async save() { calls.push(["save", file]); if (file === failSave) return false; fs.writeFileSync(file, utf16 ? Buffer.concat([Buffer.from([255, 254]), Buffer.from(this.text, "utf16le")]) : Buffer.from(this.text)); this.isDirty = false; return true; } };
    docs.set(file, doc); return doc;
  }
  class WorkspaceEdit { constructor() { this.edits = []; } createFile(uri, options) { this.edits.push({ type: "create", uri, options }); } insert(uri, at, text) { this.edits.push({ type: "insert", uri, at, text }); } replace(uri, range, text) { this.edits.push({ type: "replace", uri, range, text }); } set(uri, edits) { for (const edit of edits) this.edits.push({ ...edit, uri }); } }
  const vscode = { EndOfLine: { LF: 1, CRLF: 2 }, TextEdit: { insert: (at, text) => ({ type: "insert", at, text }), setEndOfLine: eol => ({ type: "eol", eol }) }, Uri: { file: fsPath => ({ fsPath, scheme: "file", toString: () => fsPath }) }, WorkspaceEdit, Position: class { constructor(line, character) { this.line = line; this.character = character; } }, Range: class { constructor(start, end) { this.start = start; this.end = end; } }, workspace: { get textDocuments() { return [...docs.values()]; }, openTextDocument: async uri => document(uri.fsPath), async applyEdit(edit) { calls.push(["apply", edit]); for (const e of edit.edits) { if (e.type === "create") { fs.writeFileSync(e.uri.fsPath, "", { flag: "wx" }); continue; } const doc = document(e.uri.fsPath); if (e.type === "eol") doc.eol = e.eol; doc.text = (e.type === "eol" ? doc.text : e.text).replace(/\r\n|\r|\n/g, doc.eol === 2 ? "\r\n" : "\n"); doc.version++; doc.isDirty = true; } if (applyHook) await applyHook(); return true; } } };
  const plan = { files: [{ file: newFile, text: "native class source\r\n" }, { file, text: updated, operation: "update", expectedHash: digest(originalBytes), expectedText: original, encoding: "utf16le", bom: true }] };
  return { root, file, newFile, plan, vscode, calls, docs, document, setApplyHook(value) { applyHook = value; }, setFailSave(value) { failSave = value; }, cleanup() { fs.rmSync(root, { recursive: true, force: true }); } };
}
for (const [sourceEol, configuredEol] of [["\r\n", 1], ["\n", 2]]) test("reviewed source preserves " + JSON.stringify(sourceEol) + " with the opposite configured editor EOL", async () => {
  const f = fixture({ defaultEol: configuredEol }); try {
    f.plan.files[0].text = "native class source" + sourceEol + "// café" + sourceEol;
    const result = await applyCreationWorkspaceEdit(f.vscode, f.root, f.plan);
    assert.deepEqual(result.files, [f.newFile, f.file]);
    assert.equal(fs.readFileSync(f.newFile, "utf8"), f.plan.files[0].text);
    assert.equal(f.document(f.newFile).eol, sourceEol === "\r\n" ? 2 : 1);
    assert.equal(f.document(f.file).eol, 2);
    assert.equal(f.document(f.file).getText(), f.plan.files[1].text);
    assert.equal(f.calls.filter(call => call[0] === "apply").length, 1);
  } finally { f.cleanup(); }
});

test("reviewed existing metadata uses one native WorkspaceEdit and preserves its editor encoding and undo boundary", async () => {
  const f = fixture(); try {
    const result = await applyCreationWorkspaceEdit(f.vscode, f.root, f.plan);
    assert.deepEqual(result.files, [f.newFile, f.file]); assert.equal(f.calls.filter(c => c[0] === "apply").length, 1);
    const bytes = fs.readFileSync(f.file); assert.deepEqual([...bytes.subarray(0, 2)], [255, 254]); assert.equal(bytes.subarray(2).toString("utf16le"), f.plan.files[1].text);
    assert.equal(fs.readFileSync(f.newFile, "utf8"), f.plan.files[0].text);
    const edit = f.calls.find(c => c[0] === "apply")[1]; assert.equal(edit.edits.find(e => e.type === "create").options.overwrite, false);
  } finally { f.cleanup(); }
});
test("changed disk hashes and dirty editor buffers reject before applying or creating files", async () => {
  for (const change of ["disk", "dirty"]) { const f = fixture(); try {
    if (change === "disk") fs.appendFileSync(f.file, Buffer.from("changed", "utf16le")); else f.document(f.file).isDirty = true;
    await assert.rejects(applyCreationWorkspaceEdit(f.vscode, f.root, f.plan), /changed|unsaved|dirty/i); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.newFile), false);
  } finally { f.cleanup(); } }
});
test("user edits during WorkspaceEdit are preserved and never saved as the reviewed metadata", async () => {
  const f = fixture(); try {
    f.setApplyHook(() => { const doc = f.document(f.file); doc.text += "USER EDIT"; doc.version++; });
    await assert.rejects(applyCreationWorkspaceEdit(f.vscode, f.root, f.plan), error => { assert.ok(error.outcome.dirtyFiles.includes(f.file)); assert.equal(error.outcome.savedFiles.length, 0); return /changed|review/i.test(error.message); });
    assert.match(f.document(f.file).getText(), /USER EDIT/); assert.equal(f.calls.filter(c => c[0] === "save").length, 0);
  } finally { f.cleanup(); }
});
test("partial saves identify actual saved and dirty files without deleting user edits or claiming rollback", async () => {
  const f = fixture(); try {
    f.setFailSave(f.file);
    await assert.rejects(applyCreationWorkspaceEdit(f.vscode, f.root, f.plan), error => { assert.deepEqual(error.outcome.savedFiles, [f.newFile]); assert.ok(error.outcome.dirtyFiles.includes(f.file)); assert.ok(error.outcome.createdFiles.includes(f.newFile)); return /saved|dirty/i.test(error.message); });
    assert.equal(fs.existsSync(f.newFile), true); assert.equal(f.document(f.file).isDirty, true);
  } finally { f.cleanup(); }
});
test("junction workspace paths recognise canonical dirty metadata and new-file buffers", async () => {
  for (const target of ["metadata", "new"]) { const f = fixture(); try {
    const alias = path.join(f.root, "workspace-alias"); fs.symlinkSync(f.root, alias, process.platform === "win32" ? "junction" : "dir");
    const plan = { files: f.plan.files.map(entry => ({ ...entry, file: path.join(alias, path.basename(entry.file)) })) };
    if (target === "metadata") f.document(f.file).isDirty = true;
    else f.docs.set(f.newFile, { uri: { fsPath: f.newFile, scheme: "untitled" }, isDirty: true });
    await assert.rejects(applyCreationWorkspaceEdit(f.vscode, alias, plan), /unsaved|dirty/i);
    assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.newFile), false);
  } finally { f.cleanup(); } }
});
test("duplicate physical metadata targets through junction aliases are rejected before applying edits", async () => {
  const f = fixture(); try {
    const alias = path.join(f.root, "workspace-alias"); fs.symlinkSync(f.root, alias, process.platform === "win32" ? "junction" : "dir");
    const plan = { files: [f.plan.files[1], { ...f.plan.files[1], file: path.join(alias, path.basename(f.file)) }] };
    await assert.rejects(applyCreationWorkspaceEdit(f.vscode, f.root, plan), /duplicate/i); assert.equal(f.calls.length, 0);
  } finally { f.cleanup(); }
});
test("an existing metadata leaf symlink outside the workspace is rejected", async t => {
  const f = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), "jade-workspace-edit-outside-")); try {
    const other = path.join(outside, "metadata.sec"), link = path.join(f.root, "linked.sec"); fs.copyFileSync(f.file, other);
    try { fs.symlinkSync(other, link, "file"); } catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("File symlinks require Windows developer-mode permission on this host."); return; } throw error; }
    const plan = { files: [{ ...f.plan.files[1], file: link }] };
    await assert.rejects(applyCreationWorkspaceEdit(f.vscode, f.root, plan), /outside/i); assert.equal(f.calls.length, 0);
  } finally { f.cleanup(); fs.rmSync(outside, { recursive: true, force: true }); }
});
