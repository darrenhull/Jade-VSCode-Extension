"use strict";
// Read authoring metadata without rewriting native source or treating missing
// metadata as a restriction. Unrecognised forms remain the native loader's job.
const { lexSource } = require("./source-lex");
const identifier = value => /^[A-Za-z_]\w*$/.test(value || "");
function readCollectionDefinition(entry, schema) {
  const name = entry.owner;
  if (!identifier(name)) throw Error("Invalid source class identity.");
  const text = entry.text || entry.model?.text || "", code = entry.model?.code || lexSource(text).code;
  const header = new RegExp("\\b" + name + "\\s+subclassOf\\s+(\\w+)([^;]*);").exec(code);
  const options = header?.[2] || "";
  const result = {
    id: schema + "::" + name, name, schema, parent: header?.[1],
    sourceOptions: header ? options.trim() : undefined,
    defaultLifetime: header ? /\btransient\b/.test(options) ? "transient" : "persistent" : undefined,
    final: header ? /\bfinal\b/.test(options) : undefined,
    subschemaFinal: header ? /\bsubschemaFinal\b/.test(options) : undefined,
    subschemaHidden: header ? /\bsubschemaHidden\b/.test(options) : undefined,
    duplicatesAllowed: header ? /\bduplicatesAllowed\b/.test(options) : undefined,
    fieldProvenance: header ? { duplicatesAllowed: /\bduplicatesAllowed\b/.test(options) ? "sourceDeclaration" : "nativeSourceDefault" } : {},
    keys: [], keysStatus: "none",
  };
  const membership = /^membershipDefinitions\s*\r?\n([\s\S]*?)(?=^\w+Definitions\s*$|^typeSources\s*$|$(?![\s\S]))/m.exec(code)?.[1];
  result.membership = membership && new RegExp("\\b" + name + "\\s+of\\s+(\\w+(?:::\\w+)?)\\s*;").exec(membership)?.[1];
  const section = /^(memberKeyDefinitions|externalKeyDefinitions)\s*\r?\n([\s\S]*?)(?=^\w+Definitions\s*$|^typeSources\s*$|$(?![\s\S]))/m.exec(code);
  if (!section) return result;
  const block = new RegExp("(?:^|\\n)\\s*" + name + "\\s+(?:completeDefinition|partialDefinition)\\s*\\r?\\n\\s*\\(([\\s\\S]*?)\\n\\s*\\)").exec(section[2]);
  if (!block) { result.keysStatus = "nativeRequired"; return result; }
  result.nativeKeySource = block[1].trim();
  result.keyKind = section[1] === "memberKeyDefinitions" ? "member" : "external";
  result.keysStatus = "known";
  const definitions = block[1].split(";");
  if (definitions.pop().trim()) result.keysStatus = "nativeRequired";
  for (const declaration of definitions) {
    if (!declaration.trim()) continue;
    const match = /^\s*([a-z]\w*(?:\.[a-z]\w*)*)(?:\s*:\s*(\w+)(?:\[(\d+)(?:\s*,\s*(\d+))?\])?)?\s*([\s\S]*?)\s*$/.exec(declaration);
    if (!match || (result.keyKind === "external") !== Boolean(match[2])) { result.keysStatus = "nativeRequired"; continue; }
    const tokens = match[5].split(/[\s,]+/).filter(Boolean), seen = new Set();
    let valid = true, locale;
    for (const token of tokens) {
      if (seen.has(token)) { valid = false; break; }
      seen.add(token);
      if (token === "descending" || token === "caseInsensitive") continue;
      if (/^\d+$/.test(token) && locale === undefined && Number.isSafeInteger(Number(token))) locale = Number(token);
      else { valid = false; break; }
    }
    if (!valid) result.keysStatus = "nativeRequired";
    result.keys.push({ name: match[1], ...(match[2] ? { type: match[2] } : {}), ...(match[3] ? { length: Number(match[3]) } : {}), ...(match[4] ? { scale: Number(match[4]) } : {}), descending: seen.has("descending") ? true : valid ? false : undefined, caseInsensitive: seen.has("caseInsensitive") ? true : valid ? false : undefined, ...(locale !== undefined ? { locale } : {}), fieldProvenance: {
      name: "sourceDeclaration", ...(match[2] ? { type: "sourceDeclaration" } : {}), ...(match[3] ? { length: "sourceDeclaration" } : {}), ...(match[4] ? { scale: "sourceDeclaration" } : {}),
      ...(seen.has("descending") ? { descending: "sourceDeclaration" } : valid ? { descending: "nativeSourceDefault" } : {}),
      ...(seen.has("caseInsensitive") ? { caseInsensitive: "sourceDeclaration" } : valid ? { caseInsensitive: "nativeSourceDefault" } : {}),
      ...(locale !== undefined ? { locale: "sourceDeclaration" } : {}),
    } });
  }
  return result;
}
function nativeClassSource({ version, schema, parentSchema, name, superclass, lifetime, membership }) {
  return [`jadeVersionNumber "${version}";`, "schemaDefinition", `\t${schema} subschemaOf ${parentSchema} partialDefinition;`, "typeHeaders", `\t${name} subclassOf ${superclass}${lifetime === "transient" ? " transient" : ""};`, ...(membership ? ["membershipDefinitions", `\t${name} of ${membership};`] : []), "typeDefinitions", `\t${name} completeDefinition`, "\t(", "\t)", "databaseDefinitions", "typeSources", ""].join("\r\n");
}
function applyNativeCollectionOptions(text, name, options) {
  if (!options.length) return text;
  if (!identifier(name)) throw Error("Invalid collection class identity.");
  const header = new RegExp("(\\b" + name + "\\s+subclassOf\\s+\\w+)([^;]*);");
  if (!header.test(text)) throw Error("Generated source has no collection class header.");
  return text.replace(header, (_, prefix, previous) => prefix + (previous.trim() ? previous.trimEnd() + ", " : " ") + options.join(", ") + ";");
}
module.exports = { readCollectionDefinition, nativeClassSource, applyNativeCollectionOptions };
