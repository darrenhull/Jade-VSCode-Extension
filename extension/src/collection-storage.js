"use strict";
const path = require("node:path"), crypto = require("node:crypto");
const { lexSource } = require("./source-lex");
const { decode } = require("./native-project");
function unavailable(message) { return { status: "nativeRequired", items: [], message }; }
function readStorage(project, name) {
  const schema = project.schemas.find(schema => schema.name === name);
  if (!schema) return unavailable("Choose an existing schema before selecting storage.");
  const entries = (schema.entries || []).filter(entry => path.basename(entry.file).toLowerCase() === "databasedefinitions.sec");
  if (entries.length !== 1) return unavailable("Pull one authoritative databaseDefinitions.sec for this schema before selecting a storage file.");
  const entry = entries[0];
  if (!(entry.bytes instanceof Uint8Array)) return unavailable("Saved database metadata bytes are required to review a storage change.");
  const bytes = Buffer.from(entry.bytes), text = decode(bytes);
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf16le" : "utf8";
  const bom = encoding === "utf16le" || bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191;
  const prefix = !bom ? Buffer.alloc(0) : encoding === "utf16le" ? Buffer.from([255, 254]) : Buffer.from([239, 187, 191]);
  if (entry.text !== text || !Buffer.concat([prefix, Buffer.from(text, encoding)]).equals(bytes)) return unavailable("Database metadata encoding or snapshot is not losslessly readable; no storage source will be overwritten.");
  const lexical = lexSource(text), code = lexical.code;
  const stringStarts = new Set(lexical.excluded.filter(range => range.kind === "string").map(range => range.start));
  const header = /^\s*databaseDefinitions\s*\r?\n\s*([A-Za-z_]\w*)\s*\r?\n\s*\(/m.exec(code);
  if (!header) return unavailable("The database metadata structure needs native validation before editing.");
  const open = header.index + header[0].lastIndexOf("(");
  let close, depth = 1;
  for (let index = open + 1; index < code.length; index++) {
    if (code[index] === "(") depth++;
    if (code[index] === ")" && !--depth) { close = index; break; }
  }
  if (close === undefined || code.slice(close + 1).trim()) return unavailable("The database metadata contains an incomplete or unsupported definition.");
  const body = code.slice(open + 1, close), fileSection = /^\s*databaseFileDefinitions\s*$/m.exec(body), maps = /^\s*classMapDefinitions\s*$/m.exec(body);
  if (!fileSection || !maps || maps.index < fileSection.index) return unavailable("Existing database file and class map sections are required before choosing storage.");
  const fileStart = open + 1 + fileSection.index + fileSection[0].length;
  const mapStart = open + 1 + maps.index + maps[0].length;
  const fileEnd = open + 1 + maps.index;
  const items = [], names = new Set();
  for (const match of text.slice(fileStart, fileEnd).matchAll(/^([\t ]*)"((?:""|[^"\r\n])*)"[^;]*;/gm)) {
    const at = fileStart + match.index + match[1].length;
    // A quoted database-file name is a string token; comments have no string
    // token at this position. This keeps commented examples out of choices.
    if (!stringStarts.has(at)) continue;
    const file = match[2].replace(/""/g, '"');
    if (!names.has(file)) { names.add(file); const id = name + "::" + header[1] + "::" + file; items.push({ id, name: file, label: id, schema: name, databaseName: header[1] }); }
  }
  if (!items.length) return unavailable("No existing user database files were found in this schema's native metadata.");
  return { status: "known", items, message: "Existing files declared by this schema. The default mapping is unchanged unless you choose a file.", entry, bytes, text, code, close, mapStart, encoding, bom };
}
function storageCatalog(project, name) {
  const result = readStorage(project, name);
  return { status: result.status, items: result.items, message: result.message };
}
function planStorageMapping(project, request) {
  if (!request.mapFile) return;
  function reject(message) { const error = Error(message); error.field = "map-file"; throw error; }
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(request.name || "")) reject("Enter a valid class name before choosing its storage file.");
  const metadata = readStorage(project, request.schema);
  if (metadata.status !== "known") reject(metadata.message);
  const selected = metadata.items.find(item => item.id === request.mapFile);
  if (!selected) reject("Choose an existing schema-qualified database file declared by the selected schema.");
  const mapText = metadata.text.slice(metadata.mapStart, metadata.close);
  for (const match of mapText.matchAll(/^([\t ]*)([A-Za-z_]\w*)\s+in\s+"((?:""|[^"\r\n])*)"[^;]*;/gm)) {
    const at = metadata.mapStart + match.index + match[1].length;
    if (metadata.code.slice(at, at + match[2].length) !== match[2] || match[2].toLowerCase() !== request.name.toLowerCase()) continue;
    if (match[3].replace(/""/g, '"') === selected.name) return;
    reject("A storage mapping already exists for " + request.name + ". Review and edit that existing mapping explicitly.");
  }
  const newline = metadata.text.includes("\r\n") ? "\r\n" : "\n";
  const closingLine = metadata.text.lastIndexOf("\n", metadata.close - 1) + 1;
  if (metadata.text.slice(closingLine, metadata.close).trim()) reject("The database closing delimiter needs native validation before adding a class mapping.");
  const existingIndent = /^([\t ]*)[A-Za-z_]\w*\s+in\s+"/m.exec(mapText)?.[1];
  const indent = existingIndent ?? metadata.text.slice(closingLine, metadata.close) + "\t";
  const line = indent + request.name + ' in "' + selected.name.replace(/"/g, '""') + '";' + newline;
  return {
    file: metadata.entry.file, operation: "update", expectedHash: crypto.createHash("sha256").update(metadata.bytes).digest("hex"), expectedText: metadata.text,
    text: metadata.text.slice(0, closingLine) + line + metadata.text.slice(closingLine), encoding: metadata.encoding, bom: metadata.bom,
    relativePath: path.relative(project.root, metadata.entry.file),
  };
}
module.exports = { storageCatalog, planStorageMapping };
