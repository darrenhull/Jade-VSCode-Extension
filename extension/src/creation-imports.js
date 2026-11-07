"use strict";
const { lexSource } = require("./source-lex");
const { topLevelMatches } = require("./source-context");
const { collectionCatalog } = require("./collections");

// Package declarations are read from native source. No class is made public
// merely because its exporting schema's full class source is present locally.
function section(code, name) {
  const headings = topLevelMatches(code, /^[\t ]*([A-Za-z_]\w*)[\t ]*\r?$/gm);
  const start = headings.find(heading => heading[1] === name);
  if (!start) return;
  const after = start.index + start[0].length;
  const next = headings.find(heading => heading.index >= after && /(?:Definitions|Sources)$|^(?:schemaDefinition|typeHeaders|interfaceDefs)$/.test(heading[1]) && !/^\s*\(/.test(code.slice(heading.index + heading[0].length)));
  return code.slice(after, next?.index ?? code.length);
}
function blocks(code, pattern) {
  const values = [];
  for (const match of topLevelMatches(code, pattern)) {
    const open = match.index + match[0].lastIndexOf("(");
    let depth = 1, end;
    for (let index = open + 1; index < code.length; index++) {
      if (code[index] === "(") depth++;
      if (code[index] === ")" && !--depth) { end = index; break; }
    }
    if (end !== undefined) values.push({ match, body: code.slice(open + 1, end) });
  }
  return values;
}
function metadataError(message) {
  const error = Error(message); error.field = "member";
  error.code = "JADE_IMPORT_METADATA_UNAVAILABLE"; error.metadataStatus = "nativeRequired";
  return error;
}
function createCreationImports(project) {
  const schemas = new Map(project.schemas.map(schema => [schema.name, schema])), declarations = new Map(), exported = new Map();
  let sourceCatalog, enrichedCatalog, sourceTypes;
  const sourceClasses = new Map();
  for (const schema of project.schemas) for (const entry of schema.classes || []) {
    const cls = entry.model.classes.find(value => value.name === entry.owner);
    if (cls) sourceClasses.set(schema.name + "::" + entry.owner, cls);
  }
  const getSourceCatalog = () => sourceCatalog ||= collectionCatalog(project);
  function sourceType(name, schema) {
    sourceTypes ||= new Map(getSourceCatalog().types.map(type => [type.schema + "::" + type.name, type]));
    const seen = new Set();
    while (schema && !seen.has(schema)) {
      seen.add(schema);
      const found = sourceTypes.get(schema + "::" + name);
      if (found) return found;
      schema = schemas.get(schema)?.parent;
    }
  }
  for (const schema of project.schemas) {
    const aliases = new Map();
    for (const entry of [schema.header, ...(schema.entries || [])]) {
      if (!entry?.text || !/importedPackageDefinitions|exportedPackageDefinitions/.test(entry.text)) continue;
      const code = lexSource(entry.text).code;
      const exportBody = section(code, "exportedPackageDefinitions");
      if (exportBody !== undefined) for (const declaration of blocks(exportBody, /^[\t ]*([A-Za-z_]\w*)[\t ]*\r?\n[\t ]*\(/gm)) {
        const name = declaration.match[1], classSection = section(declaration.body, "exportedClassDefinitions"), classes = new Map();
        if (classSection !== undefined) for (const type of blocks(classSection, /^[\t ]*([A-Za-z_]\w*)([^;\r\n]*)\r?\n[\t ]*\(/gm)) {
          const properties = section(type.body, "exportedPropertyDefinitions");
          const names = properties === undefined ? [] : topLevelMatches(properties, /^[\t ]*([A-Za-z_]\w*)[\t ]*(?:(?:readonly|readOnly)[\t ]*)?;[\t ]*\r?$/gm).map(match => match[1]);
          const remaining = (properties || "").replace(/^[\t ]*setModifiedTimeStamp\b[^\r\n]*;[\t ]*\r?$/gm, "").replace(/^[\t ]*[A-Za-z_]\w*[\t ]*(?:(?:readonly|readOnly)[\t ]*)?;[\t ]*\r?$/gm, "").trim();
          classes.set(type.match[1], { name: type.match[1], properties: names, metadataStatus: remaining ? "nativeRequired" : "known" });
        }
        const key = schema.name + "::" + name, previous = exported.get(key);
        if (previous && JSON.stringify([...previous.classes]) !== JSON.stringify([...classes])) throw metadataError("Conflicting extracted export declarations for " + key + ".");
        exported.set(key, { name, schema: schema.name, classes });
      }
      const body = section(code, "importedPackageDefinitions");
      if (body === undefined) continue;
      for (const declaration of blocks(body, /^[\t ]*([A-Za-z_]\w*)\s+is\s+((?:[A-Za-z_]\w*::)+[A-Za-z_]\w*)[\t ]*\r?\n[\t ]*\(/gm)) {
        const alias = declaration.match[1], route = declaration.match[2].split("::"), classes = section(declaration.body, "importedClassDefinitions");
        const names = classes === undefined ? [] : topLevelMatches(classes, /^[\t ]*([A-Za-z_]\w*)[\t ]*;?[\t ]*\r?$/gm).map(match => match[1]);
        const value = { alias, originSchema: route.at(-2), package: route.at(-1), schema: schema.name, classes: names };
        const prior = aliases.get(alias);
        if (prior && JSON.stringify(prior) !== JSON.stringify(value)) throw metadataError("Conflicting extracted import declarations for " + schema.name + "::" + alias + ".");
        aliases.set(alias, value);
      }
    }
    declarations.set(schema.name, [...aliases.values()]);
  }
  const projections = new Map();
  function projectType(row, declaration, seen = new Set()) {
    if (projections.has(row.id)) return { ...projections.get(row.id), usedInSchema: row.usedInSchema };
    if (seen.has(row.id)) return { ...row, metadataStatus: "nativeRequired", properties: [] };
    seen.add(row.id);
    const pkg = exported.get(row.originSchema + "::" + row.package), definition = pkg?.classes.get(row.className);
    if (!definition) return { ...row, metadataStatus: "nativeRequired", properties: [] };
    const original = sourceType(row.className, row.originSchema), properties = new Map();
    let complete = definition.metadataStatus === "known";
    // Only an ancestor exported by the same package AND imported in this
    // declaration contributes inherited fields. Unexported base fields do not.
    let ancestor = original, visited = new Set();
    while (ancestor && !visited.has(ancestor.schema + "::" + ancestor.name)) {
      visited.add(ancestor.schema + "::" + ancestor.name);
      const parent = sourceClasses.get(ancestor.schema + "::" + ancestor.name)?.parent;
      ancestor = parent && sourceType(parent, ancestor.schema);
      if (ancestor && pkg.classes.has(ancestor.name) && declaration.classes.includes(ancestor.name) && sourceType(ancestor.name, row.originSchema)?.schema === ancestor.schema) {
        const inherited = projectType({ ...row, id: row.importingSchema + "::" + declaration.alias + "::" + ancestor.name, className: ancestor.name, name: declaration.alias + "::" + ancestor.name, nativeName: declaration.alias + "::" + ancestor.name }, declaration, seen);
        complete &&= inherited.metadataStatus === "known";
        for (const property of inherited.properties) properties.set(property.name, property);
        break;
      }
    }
    for (const name of definition.properties) {
      const property = original?.properties.find(property => property.name === name);
      if (!property) { complete = false; continue; }
      const value = { ...property, schema: row.importingSchema, originSchema: property.schema, exported: true };
      const reference = sourceType(property.type, property.schema || row.originSchema);
      if (reference && reference.schema !== "RootSchema") {
        if (pkg.classes.has(reference.name) && declaration.classes.includes(reference.name) && sourceType(reference.name, row.originSchema)?.schema === reference.schema) value.type = declaration.alias + "::" + reference.name;
        else { value.type = undefined; complete = false; }
      }
      properties.set(name, value);
    }
    const projected = { ...row, metadataStatus: complete ? "known" : "nativeRequired", properties: [...properties.values()] };
    projections.set(row.id, projected);
    return projected;
  }
  function visible(schemaName) {
    const rows = [], seen = new Set(), aliases = new Set();
    let current = schemas.get(schemaName);
    while (current && !seen.has(current.name)) {
      seen.add(current.name);
      for (const declaration of declarations.get(current.name) || []) {
        if (aliases.has(declaration.alias)) throw metadataError("An imported package alias is declared more than once in this schema branch: " + declaration.alias + ".");
        aliases.add(declaration.alias);
        for (const name of declaration.classes) rows.push(projectType({
          id: declaration.schema + "::" + declaration.alias + "::" + name,
          label: declaration.schema + "::" + declaration.alias + "::" + name,
          name: declaration.alias + "::" + name, nativeName: declaration.alias + "::" + name, className: name,
          schema: declaration.schema, importingSchema: declaration.schema, usedInSchema: schemaName,
          originSchema: declaration.originSchema, package: declaration.package, imported: true,
          metadataStatus: "nativeRequired",
        }, declaration));
      }
      current = schemas.get(current.parent);
    }
    return rows;
  }
  function enrichCatalog(catalog) {
    const types = [...(catalog.types || [])], added = new Set(types.map(type => type.schema + "::" + type.name));
    return { ...catalog, types, schemas: catalog.schemas.map(schema => {
      const imported = visible(schema.name);
      for (const member of imported) if (!added.has(member.schema + "::" + member.name)) { added.add(member.schema + "::" + member.name); types.push(member); }
      return imported.length ? { ...schema, members: [...schema.members, ...imported] } : schema;
    }) };
  }
  return { visible, enrichCatalog, catalog: () => enrichedCatalog ||= enrichCatalog(getSourceCatalog()), notice: () => [...declarations.values()].some(values => values.length) ? "Imported aliases use extracted package declarations. Missing exported property metadata requires native validation; full original classes are not exposed." : "" };
}
module.exports = { createCreationImports };
