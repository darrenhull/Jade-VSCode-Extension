"use strict";
const path = require("node:path");
const { planSchema } = require("./native-project");
const { collectionCatalog, generateCollection, collectionKeyChoices } = require("./collections");
const { LanguageModel } = require("./language-model");
const systemTypes = ["Object", "MemberKeyDictionary", "ExtKeyDictionary"];
const folded = value => String(value || "").toLowerCase();
function invalid(field, message) { const error = Error(message); error.field = field; throw error; }
function inField(field, operation) { try { return operation(); } catch (error) { if (!error.field) error.field = field; throw error; } }
function page(items, { query = "", offset = 0, limit = 50 } = {}) {
  const needle = folded(query);
  offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  limit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  const matched = needle ? items.filter(item => folded(item.label || item.name).includes(needle)) : items;
  return { items: matched.slice(offset, offset + limit), total: matched.length, offset, limit, hasMore: offset + limit < matched.length };
}
function createCreationModel(project, { sourceRoot = project.root, systemCache } = {}) {
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
    const classNames = new Set(systemCache.types.filter(type => !type.primitive && ![6, 7, 8].includes(type.category)).map(type => type.name));
    const root = { name: "RootSchema", header: { text: "" }, entries: [], classes: [...language.system.values()].map(cls => ({ owner: cls.name, selectable: classNames.has(cls.name), model: { classes: [cls] } })) };
    project = { ...project, schemas: [...project.schemas.filter(schema => schema.name !== "RootSchema"), root] };
  }
  const schemasByName = new Map(project.schemas.map(schema => [schema.name, schema]));
  const visibleCache = new Map();
  let catalog, dictionaryKinds;
  const getCatalog = () => catalog ||= collectionCatalog(project);
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
    const result = [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
    visibleCache.set(schemaName, result);
    return result;
  }
  function resolveChoice(schema, identity, field) {
    const qualified = String(identity || "").includes("::");
    const result = visible(schema).find(item => qualified ? item.id === identity : item.name === identity);
    if (!result) invalid(field === "member class" ? "member" : field, "Choose a " + field + " visible in the selected schema.");
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
    if (options.kind === "superclass" && options.collectionKind) choices = choices.filter(choice => dictionaryKind(choice) === options.collectionKind);
    return page(choices, options);
  }
  function keyChoices(options) {
    const selected = resolveChoice(options.schema, options.membership, "member class"), c = getCatalog();
    const member = c.schemas.find(schema => schema.name === options.schema)?.members.find(member => member.name === selected.name && member.schema === selected.schema);
    return page(collectionKeyChoices(member, c, options.schema).map(property => ({ ...property, label: property.name })), options);
  }
  function preview(request) {
    let result, summary;
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
      if (request.type === "collection") {
        if (!["member", "external"].includes(request.kind)) invalid("dictionary", "Choose member or external keys.");
        const member = resolveChoice(schema.name, request.membership, "member class");
        const superclass = request.superclass ? resolveChoice(schema.name, request.superclass, "superclass").name : undefined;
        if (request.superclass && dictionaryKind(resolveChoice(schema.name, request.superclass, "superclass")) !== request.kind) invalid("superclass", "Choose a visible dictionary superclass matching the selected key kind.");
        if (request.loadFactor !== undefined && (!Number.isInteger(request.loadFactor) || request.loadFactor < 1 || request.loadFactor > 100)) invalid("load-factor", "Load factor must be a whole percentage from 1 to 100.");
        const generated = inField("keys", () => generateCollection({ ...request, membership: member.name, superclass }, getCatalog()));
        result = { files: [{ file: path.resolve(generated.folder, "types", generated.fileName), text: generated.text }] };
        const keys = request.keys.map(key => key.name + (key.descending ? " descending" : " ascending")).join(", then ");
        summary = "A " + request.lifetime + " " + (request.kind === "external" ? "external-key" : "member-key") + " dictionary of " + member.label + ", sorted by " + keys + "; duplicate keys " + (request.duplicatesAllowed ? "allowed" : "prohibited") + ".";
      } else if (request.type === "class") {
        const superclass = resolveChoice(schema.name, request.superclass || "RootSchema::Object", "superclass");
        const version = /jadeVersionNumber\s+"([\d.]+)"/.exec(schema.header.text)?.[1];
        if (!/^\d+\.\d+\.\d+$/.test(version || "")) invalid("schema", "Schema header has no valid Jade version.");
        const text = [`jadeVersionNumber "${version}";`, "schemaDefinition", `\t${schema.name} subschemaOf ${schema.parent} partialDefinition;`, "typeHeaders", `\t${request.name} subclassOf ${superclass.name}${request.lifetime === "transient" ? " transient" : ""};`, "typeDefinitions", `\t${request.name} completeDefinition`, "\t(", "\t)", "databaseDefinitions", "typeSources", ""].join("\r\n");
        result = { files: [{ file: path.resolve(schema.folder, "types", request.name + ".cls"), text }] };
        summary = "A " + request.lifetime + " class " + schema.name + "::" + request.name + " inheriting " + superclass.label + ". Native Jade validates the superclass lifetime rules.";
      } else invalid("kind", "Choose schema, class or collection.");
    }
    const files = result.files.map(entry => ({ ...entry, file: path.resolve(entry.file), relativePath: path.relative(project.root, entry.file) }));
    return { ...result, files, summary, source: files[0].text };
  }
  return { schemas: options => page(schemaRows(), options), search, keyChoices, preview };
}
module.exports = { createCreationModel };
