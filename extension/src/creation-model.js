"use strict";
const path = require("node:path");
const { planSchema } = require("./native-project");
const { generateCollection, collectionKeyChoices } = require("./collections");
const { LanguageModel } = require("./language-model");
const { createCreationImports } = require("./creation-imports");
const { createCollectionRules, familyFor, bases, nativeCollectionOptions } = require("./collection-rules");
const { nativeClassSource, readCollectionDefinition, applyNativeCollectionOptions } = require("./collection-definition");
const { storageCatalog, planStorageMapping } = require("./collection-storage");
const systemTypes = ["Object", ...Object.values(bases)];
const folded = value => String(value || "").toLowerCase();
function invalid(field, message, details) { const error = Error(message); error.field = field; Object.assign(error, details); throw error; }
function inField(field, operation) { try { return operation(); } catch (error) { if (!error.field) error.field = field; throw error; } }
function page(items, { query = "", offset = 0, limit = 50 } = {}) {
  const needle = folded(query);
  offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  limit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  const matched = needle ? items.filter(item => folded(item.label || item.name).includes(needle)) : items;
  return { items: matched.slice(offset, offset + limit), total: matched.length, offset, limit, hasMore: offset + limit < matched.length };
}
function createCreationModel(project, { sourceRoot = project.root, systemCache } = {}) {
  const collectionRules = createCollectionRules(project, { systemCache, catalogProvider: () => getCatalog() });
  const schemaNames = new Set();
  for (const schema of project.schemas) {
    if (schemaNames.has(folded(schema.name))) invalid("schema", "Duplicate schema declaration: " + schema.name);
    schemaNames.add(folded(schema.name));
    const complete = new Set();
    for (const entry of schema.classes) {
      const cls = entry.model.classes.find(value => value.name === entry.owner);
      if (!cls || cls.partial) continue;
      if (complete.has(folded(entry.owner))) invalid("schema", "Duplicate complete declaration: " + schema.name + "::" + entry.owner);
      complete.add(folded(entry.owner));
    }
  }
  if (systemCache) {
    // Reuse the existing verified-cache converter rather than maintaining a
    // second native metadata interpretation in the authoring UI.
    const language = new LanguageModel();
    language.setSystemCache(systemCache);
    // These are the native cache reader's class categories: primitive (6),
    // pseudo type (7) and interface (8) remain metadata, not superclass choices.
    const classNames = new Set(systemCache.types.filter(type => !type.primitive && ![6, 7, 8].includes(type.category)).map(type => type.name));
    const root = { name: "RootSchema", header: { text: "" }, entries: [], classes: [...language.system.values()].map(cls => ({ owner: cls.name, selectable: classNames.has(cls.name), model: { classes: [cls] } })) };
    project = { ...project, schemas: [...project.schemas.filter(schema => schema.name !== "RootSchema"), root] };
  }
  // The same known base types must back both autocomplete and generation when
  // no verified cache is available. Their empty member lists do not pretend to
  // supply native system properties; refreshing the cache supplies those.
  const root = project.schemas.find(schema => schema.name === "RootSchema") || { name: "RootSchema", header: { text: "" }, entries: [], classes: [] };
  const classes = [...root.classes];
  for (const name of systemTypes) if (!classes.some(entry => entry.owner === name)) classes.push({ owner: name, model: { classes: [{ name, kind: "class", members: [] }] } });
  project = { ...project, schemas: [...project.schemas.filter(schema => schema.name !== "RootSchema"), { ...root, classes }] };
  const schemasByName = new Map(project.schemas.map(schema => [schema.name, schema]));
  const imports = createCreationImports(project);
  const visibleCache = new Map();
  let catalog, dictionaryKinds;
  const getCatalog = () => catalog ||= imports.catalog();
  const requireSchema = name => {
    const schema = schemasByName.get(name);
    if (!schema) invalid("schema", "Choose an existing user schema.");
    return schema;
  };
  function visible(schemaName) {
    if (visibleCache.has(schemaName)) return visibleCache.get(schemaName);
    const found = new Map(), seen = new Set();
    let current = requireSchema(schemaName);
    while (current && !seen.has(current.name)) {
      seen.add(current.name);
      for (const entry of current.classes) {
        if (entry.selectable === false || entry.model.classes.find(cls => cls.name === entry.owner)?.primitive) continue;
        const key = folded(entry.owner);
        if (!found.has(key)) found.set(key, { name: entry.owner, schema: current.name, id: current.name + "::" + entry.owner, label: current.name + "::" + entry.owner });
      }
      current = schemasByName.get(current.parent);
    }
    for (const name of systemTypes)
      if (!found.has(folded(name))) found.set(folded(name), { name, schema: "RootSchema", id: "RootSchema::" + name, label: "RootSchema::" + name });
    const result = [...found.values(), ...imports.visible(schemaName)].sort((a, b) => a.label.localeCompare(b.label));
    visibleCache.set(schemaName, result);
    return result;
  }
  function resolveChoice(schema, identity, field) {
    const qualified = String(identity || "").includes("::");
    const result = visible(schema).find(item => qualified ? item.id === identity : item.name === identity);
    if (!result) invalid(field === "member class" ? "member" : field, "Choose a " + field + " visible in the selected schema.", { code: "JADE_TYPE_NOT_VISIBLE", metadataStatus: "known" });
    if (field === "superclass" && result.imported) invalid("superclass", "Jade does not permit subclassing imported classes. Choose a local or schema-inherited superclass.", { code: "JADE_IMPORTED_CLASS_CANNOT_BE_SUBCLASSED", metadataStatus: "known" });
    return result;
  }
  function dictionaryKind(choice) {
    if (choice.name === "MemberKeyDictionary" && choice.schema === "RootSchema") return "member";
    if (choice.name === "ExtKeyDictionary" && choice.schema === "RootSchema") return "external";
    if (!dictionaryKinds) {
      dictionaryKinds = new Map();
      for (const schema of getCatalog().schemas) for (const member of schema.members)
        if (member.dictionaryKind) dictionaryKinds.set(member.schema + "::" + member.name, member.dictionaryKind);
    }
    return dictionaryKinds.get(choice.id);
  }
  function schemaRows() {
    return project.schemas.filter(schema => !["RootSchema", "JadeSchema"].includes(schema.name)).map(schema => ({
      name: schema.name, parent: schema.parent, label: schema.name,
      version: /jadeVersionNumber\s+"([\d.]+)"/.exec(schema.header.text)?.[1],
      locales: getLocales(schema.name),
    }));
  }
  function getLocales(name) {
    // Locale metadata is small. Avoid building the full property catalogue just
    // to render the initial schema selector.
    const locales = new Map(), seen = new Set();
    let current = schemasByName.get(name);
    while (current && !seen.has(current.name)) {
      seen.add(current.name);
      for (const entry of current.entries || []) {
        if (!/^\s*localeDefinitions\b/m.test(entry.text || "")) continue;
        for (const match of entry.text.matchAll(/^\s*(\d+)\s+"((?:""|[^"])*)"([^;]*);/gm)) {
          const id = Number(match[1]);
          if (id > 0 && id <= 2147483647 && !locales.has(id)) locales.set(id, { id, name: match[2].replace(/""/g, '"'), schema: current.name, schemaDefault: /\bschemaDefaultLocale\b/.test(match[3]) });
        }
      }
      current = schemasByName.get(current.parent);
    }
    return [...locales.values()];
  }
  function search(options) {
    let choices = visible(options.schema);
    if (options.kind === "superclass") choices = choices.filter(choice => !choice.imported);
    if (options.kind === "superclass" && options.collectionFamily) choices = choices.filter(choice => collectionRules.familyOf(choice.id) === options.collectionFamily);
    else if (options.kind === "superclass" && options.collectionKind) choices = choices.filter(choice => dictionaryKind(choice) === options.collectionKind);
    return page(choices, options);
  }
  function keyChoices(options) {
    const selected = resolveChoice(options.schema, options.membership, "member class"), c = getCatalog();
    const member = c.schemas.find(schema => schema.name === options.schema)?.members.find(member => member.name === selected.name && member.schema === selected.schema);
    if (member?.imported && member.metadataStatus !== "known") invalid("member", "Exported property metadata for " + selected.label + " is unavailable. Pull the exporting package source before choosing member keys.", { code: "JADE_IMPORT_METADATA_UNAVAILABLE", metadataStatus: "nativeRequired" });
    return page(collectionKeyChoices(member, c, options.schema).map(property => ({ ...property, label: property.name })), options);
  }
  function preview(request) {
    let result, summary, rulesRequest = request;
    if (request.type === "schema") {
      if (!/^[A-Za-z_]\w*$/.test(request.name || "") || ["rootschema", "jadeschema"].includes(folded(request.name))) invalid("name", "Enter a valid user schema name.");
      if (project.schemas.some(schema => folded(schema.name) === folded(request.name))) invalid("name", "A schema with this name already exists.");
      const parent = request.parent || "RootSchema";
      if (parent === request.name) invalid("parent", "Choose a different parent schema.");
      if (parent !== "RootSchema" && !schemasByName.has(parent)) invalid("parent", "Choose an existing parent schema.");
      const bases = { app: "RootSchemaApp", global: "RootSchemaGlobal", session: "RootSchemaSession" }, chain = [], seen = new Set();
      let current = schemasByName.get(parent);
      while (current && current.name !== "RootSchema") {
        if (seen.has(current.name)) invalid("parent", "Cyclic schema hierarchy.");
        seen.add(current.name); chain.unshift(current);
        if (current.parent !== "RootSchema" && !schemasByName.has(current.parent)) invalid("parent", "Pull parent schema " + current.parent + " before creating its child.");
        current = schemasByName.get(current.parent);
      }
      for (const schema of chain) for (const role of Object.keys(bases)) {
        const found = schema.classes.find(entry => entry.model.classes.some(cls => cls.parent === bases[role]));
        if (found) bases[role] = found.owner;
      }
      const version = request.version || /jadeVersionNumber\s+"([\d.]+)"/.exec(schemasByName.get(parent)?.header.text || "")?.[1];
      if (!/^\d+\.\d+\.\d+$/.test(version || "")) invalid("version", "Enter a valid Jade version, for example 25.0.02.");
      result = planSchema(sourceRoot, request.name, parent, version, bases);
      summary = "A new schema " + request.name + " inheriting " + parent + ", with native application, global and session definitions.";
    } else {
      const schema = requireSchema(request.schema);
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(request.name || "") || /^Jade/i.test(request.name)) invalid("name", "Class name must start with an uppercase letter and must not use the Jade prefix.");
      if (visible(schema.name).some(choice => folded(choice.name) === folded(request.name))) invalid("name", "A visible class with this name already exists.");
      if (!["transient", "persistent"].includes(request.lifetime)) invalid("lifetime", "Choose transient or persistent lifetime.");
      collectionRules.validate(request);
      if (request.type === "collection") {
        const family = familyFor(request), dictionary = family === "memberDictionary" || family === "externalDictionary";
        const member = resolveChoice(schema.name, request.membership, "member class");
        if (family === "memberDictionary" && member.imported && getCatalog().schemas.find(value => value.name === schema.name)?.members.find(value => value.id === member.id)?.metadataStatus !== "known") invalid("keys", "Exported property metadata for " + member.label + " is unavailable. Pull the exporting package source before defining member keys.", { code: "JADE_IMPORT_METADATA_UNAVAILABLE", metadataStatus: "nativeRequired" });
        const selectedBase = resolveChoice(schema.name, request.superclass || "RootSchema::" + bases[family], "superclass"), superclass = selectedBase.name;
        if (collectionRules.familyOf(selectedBase.id) !== family) invalid("superclass", "Choose a visible superclass matching the selected collection family.");
        if (request.loadFactor !== undefined && (!Number.isInteger(request.loadFactor) || request.loadFactor < 1 || request.loadFactor > 100)) invalid("load-factor", "Load factor must be a whole percentage from 1 to 100.");
        if (dictionary) {
          const kind = family === "memberDictionary" ? "member" : "external";
          const generated = inField("keys", () => generateCollection({ ...request, kind, membership: member.name, superclass }, getCatalog()));
          const generatedMetadata = readCollectionDefinition({ owner: request.name, text: generated.text }, schema.name);
          rulesRequest = { ...request, keys: generatedMetadata.keys };
          collectionRules.validate(rulesRequest);
          result = { files: [{ file: path.resolve(generated.folder, "types", generated.fileName), text: applyNativeCollectionOptions(generated.text, request.name, nativeCollectionOptions(request)) }] };
          const keys = request.keys.map(key => key.name + (key.descending ? " descending" : " ascending")).join(", then ");
          summary = "A " + request.lifetime + " " + (kind === "external" ? "external-key" : "member-key") + " dictionary of " + member.label + ", sorted by " + keys + "; duplicate keys " + (request.duplicatesAllowed ? "allowed" : "prohibited") + ".";
        } else {
          if (request.keys?.length || request.duplicatesAllowed) invalid("keys", "Arrays and sets do not define dictionary keys or duplicate-key rules.");
          if (family === "objectArray" && request.loadFactor !== undefined) invalid("load-factor", "Load factors apply to Btree sets and dictionaries, not arrays.");
          const version = /jadeVersionNumber\s+"([\d.]+)"/.exec(schema.header.text)?.[1];
          if (!/^\d+\.\d+\.\d+$/.test(version || "")) invalid("schema", "Schema header has no valid Jade version.");
          const text = applyNativeCollectionOptions(nativeClassSource({ version, schema: schema.name, parentSchema: schema.parent, name: request.name, superclass, lifetime: request.lifetime, membership: member.name }), request.name, nativeCollectionOptions(request, { includeLoadFactor: family === "objectSet" }));
          result = { files: [{ file: path.resolve(schema.folder, "types", request.name + ".cls"), text }] };
          summary = "A " + request.lifetime + " " + (family === "objectArray" ? "ordered array" : "set of unique objects") + " of " + member.label + (family === "objectArray" ? "; repeated objects are allowed." : "; no ordering is promised.");
        }
      } else if (request.type === "class") {
        const superclass = resolveChoice(schema.name, request.superclass || "RootSchema::Object", "superclass");
        const version = /jadeVersionNumber\s+"([\d.]+)"/.exec(schema.header.text)?.[1];
        if (!/^\d+\.\d+\.\d+$/.test(version || "")) invalid("schema", "Schema header has no valid Jade version.");
        const text = nativeClassSource({ version, schema: schema.name, parentSchema: schema.parent, name: request.name, superclass: superclass.name, lifetime: request.lifetime });
        result = { files: [{ file: path.resolve(schema.folder, "types", request.name + ".cls"), text }] };
        summary = "A " + request.lifetime + " class " + schema.name + "::" + request.name + " inheriting " + superclass.label + ". Native Jade validates the superclass lifetime rules.";
      } else invalid("kind", "Choose schema, class or collection.");
    }
    if (request.type !== "schema" && request.mapFile) {
      const mapping = planStorageMapping(project, request);
      if (mapping) result.files.push(mapping);
    }
    const files = result.files.map(entry => ({ ...entry, file: path.resolve(entry.file), relativePath: path.relative(project.root, entry.file) }));
    return { ...result, files, summary, source: files[0].text, ...(request.type !== "schema" ? { rules: collectionRules.describe(rulesRequest) } : {}) };
  }
  return { schemas: options => page(schemaRows(), options), search, keyChoices, preview, importsNotice: imports.notice(), storage: options => { const catalog = storageCatalog(project, options.schema); return { ...catalog, ...page(catalog.items, options) }; }, describe: request => request.type === "schema" ? { warnings: [], lifetime: { message: "Schemas define a namespace; class lifetime settings do not apply." } } : collectionRules.describe(request) };
}
module.exports = { createCreationModel };
