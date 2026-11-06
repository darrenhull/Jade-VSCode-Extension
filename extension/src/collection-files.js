"use strict";
const fs = require("node:fs"),
  path = require("node:path");
function inside(root, file) {
  const r = path.relative(root, file);
  return r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r);
}
function writeCollection(root, generated) {
  root = fs.realpathSync(root);
  const folder = path.resolve(generated.folder, "types");
  if (
    !inside(root, folder) ||
    !/^[A-Z][A-Za-z0-9_]*\.cls$/.test(generated.fileName)
  )
    throw Error("Collection file must be within the selected workspace.");
  // Check every existing ancestor before mkdir: a symlink must not lead outside.
  let ancestor = folder;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!inside(root, fs.realpathSync(ancestor)))
    throw Error("Collection folder points outside the workspace.");
  fs.mkdirSync(folder, { recursive: true });
  if (!inside(root, fs.realpathSync(folder)))
    throw Error("Collection folder points outside the workspace.");
  const file = path.join(folder, generated.fileName);
  fs.writeFileSync(file, generated.text, { flag: "wx" });
  return file;
}
module.exports = { writeCollection };
