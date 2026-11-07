"use strict";
const fs = require("node:fs"), path = require("node:path");
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
};
const identity = file => path.resolve(file).toLowerCase();

// Only a reviewed plan is written. Preflight the entire set before creating any
// file, and use exclusive creation to handle a competing writer safely.
function writeCreation(root, generated, { dirtyFiles = [], dirtyPaths = [] } = {}) {
  root = fs.realpathSync(root);
  if (!Array.isArray(generated?.files) || !generated.files.length)
    throw Error("There are no generated files to save.");
  const dirty = new Set([...dirtyFiles, ...dirtyPaths].map(identity)), seen = new Set();
  const files = generated.files.map(entry => {
    if (typeof entry?.file !== "string" || typeof entry.text !== "string")
      throw Error("Invalid generated source file.");
    const file = path.resolve(entry.file), key = identity(file);
    if (!inside(root, file)) throw Error("Generated files must remain within the selected workspace.");
    if (seen.has(key)) throw Error("Generated files contain duplicate paths.");
    seen.add(key);
    if (dirty.has(key)) throw Error("An unsaved editor already uses this file: " + file);
    if (fs.existsSync(file)) throw Error("Source file already exists: " + file);
    let ancestor = path.dirname(file);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const real = fs.realpathSync(ancestor);
    if (real !== root && !inside(root, real)) throw Error("Source folder points outside the workspace.");
    return { file, text: entry.text };
  });
  const created = [];
  try {
    for (const entry of files) {
      fs.mkdirSync(path.dirname(entry.file), { recursive: true });
      const parent = fs.realpathSync(path.dirname(entry.file));
      if (parent !== root && !inside(root, parent)) throw Error("Source folder points outside the workspace.");
      fs.writeFileSync(entry.file, entry.text, { flag: "wx" });
      created.push(entry.file);
    }
  } catch (error) {
    // These files were exclusively created by this operation. Existing files and
    // directories are never removed as part of failure handling.
    const retainedFiles = [];
    for (const file of created.reverse()) {
      try { fs.unlinkSync(file); }
      catch (cleanupError) { if (cleanupError.code !== "ENOENT") retainedFiles.push(file); }
    }
    if (retainedFiles.length) {
      const failure = Error("Source creation failed: " + error.message + ". These newly created files could not be rolled back: " + retainedFiles.join(", "), { cause: error });
      failure.code = error.code;
      failure.retainedFiles = retainedFiles;
      throw failure;
    }
    throw error;
  }
  return { files: files.map(entry => entry.file), ...(generated.header ? { header: generated.header } : {}) };
}
module.exports = { writeCreation, saveCreation: writeCreation };
