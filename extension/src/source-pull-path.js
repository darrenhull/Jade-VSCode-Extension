"use strict";
const path = require("node:path");
function sourceTargetPath(destination, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    path.win32.isAbsolute(relative)
  )
    throw Error("Expected a relative source path.");
  const parts = relative.replaceAll(String.fromCharCode(92), "/").split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[\x00-\x1f:*?"<>|]/.test(part) ||
        /[. ]$/.test(part),
    )
  )
    throw Error("Invalid relative source path.");
  const target = path.resolve(destination, ...parts);
  const inside = path.relative(destination, target);
  if (
    !inside ||
    inside === ".." ||
    inside.startsWith(".." + path.sep) ||
    path.isAbsolute(inside)
  )
    throw Error("Source path escaped its destination.");
  return target;
}
const pathIdentity = (value) => path.resolve(value).toLowerCase();
const relativeIdentity = (value) =>
  value.replaceAll(String.fromCharCode(92), "/").toLowerCase();
// Only a native selected class can own its exact same-stem Form definition.
function selectedSourcePaths(selection) {
  return selection.flatMap((item) =>
    item.kind === "class" && /\.cls$/i.test(item.path)
      ? [item.path, item.path.replace(/\.cls$/i, ".ddx")]
      : [item.path],
  );
}
module.exports = {
  sourceTargetPath,
  pathIdentity,
  relativeIdentity,
  selectedSourcePaths,
};
