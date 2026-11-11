"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const {
  sourceTargetPath,
  pathIdentity,
  relativeIdentity,
} = require("./source-pull-path");

/** Import selected saved remote hashes; never derive a baseline from local source. */
function readSelectedBaselineReceipt({
  storageDirectory,
  destination,
  sourceDatabasePath,
  selection,
}) {
  if (
    typeof sourceDatabasePath !== "string" ||
    !path.isAbsolute(sourceDatabasePath)
  )
    return;
  const binding =
    pathIdentity(destination) + "::" + pathIdentity(sourceDatabasePath);
  const identity = crypto.createHash("sha256").update(binding).digest("hex");
  const stored =
    storageDirectory &&
    path.join(storageDirectory, "source-baselines", identity + ".json");
  const receiptFile =
    stored && fs.existsSync(stored)
      ? stored
      : path.join(destination, "extract-manifest.json");
  if (!fs.existsSync(receiptFile)) return;
  const stat = fs.lstatSync(receiptFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024)
    throw Error(
      "Stored source baseline receipt is not a bounded regular file.",
    );
  const receipt = JSON.parse(
    fs.readFileSync(receiptFile, "utf8").replace(/^\uFEFF/, ""),
  );
  if (
    receipt.format !== 1 ||
    receipt.exitCode !== 0 ||
    !Array.isArray(receipt.files) ||
    typeof receipt.database !== "string" ||
    pathIdentity(receipt.database) !== pathIdentity(sourceDatabasePath)
  )
    throw Error(
      "Stored source baseline receipt has an invalid database binding or format.",
    );
  // The legacy Every route exported current, not latest, schema versions.
  if (typeof receipt.mode !== "string" || !/^Every\s*;/.test(receipt.mode))
    return;
  const selected = new Set(
    selection.map((item) => {
      sourceTargetPath(destination, item.path);
      return relativeIdentity(item.path);
    }),
  );
  const found = new Set(),
    files = [];
  for (const entry of receipt.files) {
    if (
      typeof entry?.path !== "string" ||
      !selected.has(relativeIdentity(entry.path))
    )
      continue;
    const key = relativeIdentity(entry.path);
    if (
      found.has(key) ||
      !/\.(cls|ddx)$/i.test(entry.path) ||
      !/^[a-fA-F0-9]{64}$/.test(entry.sha256 || "")
    )
      throw Error(
        "Stored source baseline receipt has a duplicate path or invalid hash.",
      );
    sourceTargetPath(destination, entry.path);
    if (entry.nativePath !== undefined)
      sourceTargetPath(destination, entry.nativePath);
    files.push({
      path: entry.path,
      sha256: entry.sha256,
      ...(entry.nativePath === undefined
        ? {}
        : { nativePath: entry.nativePath }),
    });
    found.add(key);
  }
  if (!files.length) return;
  return {
    sourceDatabasePath: receipt.database,
    destination: path.resolve(destination),
    files,
  };
}
module.exports = { readSelectedBaselineReceipt };
