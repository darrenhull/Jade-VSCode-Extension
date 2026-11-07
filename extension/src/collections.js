"use strict";
// Pure native-source model: no VS Code, database or filesystem dependency.
function collectionCatalog(project) {
  const bySchema = new Map(project.schemas.map((s) => [s.name, s]));
  const types = new Map(),
    propertyCache = new Map();
  for (const schema of project.schemas)
    for (const entry of schema.classes)
      types.set(schema.name + "::" + entry.owner, {
        schema: schema.name,
        cls: entry.model.classes.find((c) => c.name === entry.owner),
      });
  function resolve(name, schema) {
    const seen = new Set();
    while (schema && !seen.has(schema)) {
      seen.add(schema);
      const type = types.get(schema + "::" + name);
      if (type) return type;
      schema = bySchema.get(schema)?.parent;
    }
  }
  function properties(type, seen = new Set()) {
    if (!type) return [];
    const id = type.schema + "::" + type.cls.name;
    if (propertyCache.has(id)) return propertyCache.get(id);
    if (seen.has(id)) throw Error("Cyclic class hierarchy: " + id);
    seen.add(id);
    const inherited = properties(resolve(type.cls.parent, type.schema), seen),
      members = new Map(inherited.map((p) => [p.name, p]));
    for (const p of type.cls.members)
      if (p.kind === "property")
        members.set(p.name, {
          name: p.name,
          type: p.type,
          length: p.length,
          precision: p.precision,
          scale: p.scale,
          owner: type.cls.name,
          schema: type.schema,
        });
    const result = [...members.values()];
    propertyCache.set(id, result);
    return result;
  }
  function dictionaryKind(type, seen = new Set()) {
    if (!type?.cls) return;
    const id = type.schema + "::" + type.cls.name;
    if (seen.has(id)) return;
    seen.add(id);
    if (type.cls.parent === "MemberKeyDictionary") return "member";
    if (type.cls.parent === "ExtKeyDictionary") return "external";
    return dictionaryKind(resolve(type.cls.parent, type.schema), seen);
  }
  return {
    types: [...types.values()]
      .filter((t) => t.cls)
      .map((t) => ({
        name: t.cls.name,
        schema: t.schema,
        properties: properties(t),
      })),
    schemas: project.schemas
      .filter((s) => !["RootSchema", "JadeSchema"].includes(s.name))
      .map((s) => {
        const names = new Set(),
          locales = new Map(),
          seen = new Set();
        let current = s,
          defaultLocale;
        while (current && !seen.has(current.name)) {
          seen.add(current.name);
          for (const c of current.classes) names.add(c.owner);
          for (const entry of current.entries || []) {
            if (!/^\s*localeDefinitions\b/m.test(entry.text || "")) continue;
            for (const match of entry.text.matchAll(
              /^\s*(\d+)\s+"((?:""|[^"])*)"([^;]*);/gm,
            )) {
              const id = Number(match[1]);
              if (
                defaultLocale === undefined &&
                /\bschemaDefaultLocale\b/.test(match[3])
              )
                defaultLocale = id;
              if (
                id > 0 &&
                Number.isInteger(id) &&
                id <= 2147483647 &&
                !locales.has(id)
              )
                locales.set(id, {
                  id,
                  name: match[2].replace(/""/g, '"'),
                  schema: current.name,
                  schemaDefault: /\bschemaDefaultLocale\b/.test(match[3]),
                });
            }
          }
          current = bySchema.get(current.parent);
        }
        return {
          name: s.name,
          parent: s.parent,
          folder: s.folder,
          version: /jadeVersionNumber\s+"([\d.]+)"/.exec(s.header.text)?.[1],
          locales: [...locales.values()]
            .map((locale) => ({
              ...locale,
              schemaDefault: locale.id === defaultLocale,
            }))
            .sort((a, b) => a.id - b.id),
          members: [...names].sort().map((name) => ({
            name,
            schema: resolve(name, s.name)?.schema,
            properties: properties(resolve(name, s.name)),
            dictionaryKind: dictionaryKind(resolve(name, s.name)),
          })),
        };
      }),
  };
}
function generateCollection(request, catalog) {
  const schema = catalog.schemas.find((s) => s.name === request.schema);
  if (!schema) throw Error("Choose an existing user schema.");
  if (
    !/^[A-Z][A-Za-z0-9_]*$/.test(request.name || "") ||
    /^Jade/i.test(request.name)
  )
    throw Error(
      "Class name must start with an uppercase letter and must not use the Jade prefix.",
    );
  if (
    schema.members.some(
      (m) => m.name.toLowerCase() === request.name.toLowerCase(),
    )
  )
    throw Error("A visible class with this name already exists.");
  const member = schema.members.find((m) => m.name === request.membership);
  if (!member) throw Error("Choose a member class visible in this schema.");
  if (!["member", "external"].includes(request.kind))
    throw Error("Choose member or external keys.");
  const superclass =
    request.superclass ||
    (request.kind === "member" ? "MemberKeyDictionary" : "ExtKeyDictionary");
  if (
    superclass !==
      (request.kind === "member"
        ? "MemberKeyDictionary"
        : "ExtKeyDictionary") &&
    schema.members.find((m) => m.name === superclass)?.dictionaryKind !==
      request.kind
  )
    throw Error(
      "Choose a visible dictionary superclass matching the selected key kind.",
    );
  if (!["transient", "persistent"].includes(request.lifetime))
    throw Error("Choose transient or persistent lifetime.");
  if (
    !Array.isArray(request.keys) ||
    !request.keys.length ||
    request.keys.length > 16
  )
    throw Error("Choose between one and sixteen keys.");
  const seen = new Set(),
    lines = [];
  for (const key of request.keys) {
    if (
      !(
        request.kind === "member"
          ? /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/
          : /^[a-z][A-Za-z0-9_]*$/
      ).test(key.name || "")
    )
      throw Error(
        "Key names and reference path components must start with a lowercase letter.",
      );
    if (seen.has(key.name.toLowerCase()))
      throw Error("Duplicate key: " + key.name);
    seen.add(key.name.toLowerCase());
    const property = resolveKeyProperty(member, key.name, catalog, schema.name),
      type = request.kind === "member" ? property?.type : key.type;
    if (!type) throw Error("Unknown member property: " + key.name);
    if (key.caseInsensitive && !["String", "StringUtf8"].includes(type))
      throw Error("Case insensitive keys require String or StringUtf8.");
    if (key.locale !== undefined) {
      if (
        !Number.isInteger(key.locale) ||
        key.locale <= 0 ||
        key.locale > 2147483647
      )
        throw Error(
          "Locale must be a positive 32-bit native locale identifier (LCID).",
        );
      if (!["String", "StringUtf8"].includes(type))
        throw Error("Locale selection requires a String or StringUtf8 key.");
    }
    let declaration = key.name;
    if (request.kind === "external") {
      if (
        ![
          "String",
          "StringUtf8",
          "Binary",
          "Integer",
          "Integer64",
          "Real",
          "Decimal",
          "Date",
          "Time",
          "TimeStamp",
          "Boolean",
          "Character",
        ].includes(type)
      )
        throw Error("Unsupported external key type.");
      declaration += ": " + type;
      if (["String", "StringUtf8", "Binary"].includes(type)) {
        const length = key.length ?? 30,
          max = { String: 511, StringUtf8: 126, Binary: 510 }[type];
        if (!Number.isInteger(length) || length < 1 || length > max)
          throw Error(type + " key length must be between 1 and " + max + ".");
        declaration += "[" + length + "]";
      }
      if (type === "Decimal") {
        const length = key.length ?? 12,
          scale = key.scale ?? 0;
        if (
          !Number.isInteger(length) ||
          length < 1 ||
          length > 23 ||
          !Number.isInteger(scale) ||
          scale < 0 ||
          scale > length
        )
          throw Error("Invalid Decimal length or scale.");
        declaration += "[" + length + "," + scale + "]";
      }
    }
    const modifiers = [
      key.descending ? "descending" : undefined,
      key.caseInsensitive ? "caseInsensitive" : undefined,
    ].filter(Boolean);
    if (modifiers.length) declaration += " " + modifiers.join(", ");
    if (key.locale !== undefined) declaration += " " + key.locale;
    lines.push("\t" + declaration + ";");
  }
  if (!/^\d+\.\d+\.\d+$/.test(schema.version || ""))
    throw Error("Schema header has no valid Jade version.");
  const name = request.name;
  const options = [
    request.lifetime === "transient" ? "transient" : undefined,
    request.duplicatesAllowed ? "duplicatesAllowed" : undefined,
  ].filter(Boolean);
  if (request.loadFactor !== undefined) {
    if (
      !Number.isInteger(request.loadFactor) ||
      request.loadFactor < 1 ||
      request.loadFactor > 100
    )
      throw Error("Load factor must be a whole percentage from 1 to 100.");
    options.push("loadFactor = " + request.loadFactor);
  }
  const text = [
    `jadeVersionNumber "${schema.version}";`,
    "schemaDefinition",
    `${schema.name} subschemaOf ${schema.parent} partialDefinition;`,
    "typeHeaders",
    `\t${name} subclassOf ${superclass}${options.length ? " " + options.join(", ") : ""};`,
    "membershipDefinitions",
    `\t${name} of ${member.name};`,
    "typeDefinitions",
    `\t${name} completeDefinition`,
    "\t(",
    "\t)",
    request.kind === "member"
      ? "memberKeyDefinitions"
      : "externalKeyDefinitions",
    `\t${name} completeDefinition`,
    "\t(",
    ...lines,
    "\t)",
    "typeSources",
    "",
  ].join("\r\n");
  return { fileName: name + ".cls", text, folder: schema.folder };
}
function resolveKeyProperty(member, name, catalog, schema) {
  let properties = member.properties,
    property;
  const parts = name.split(".");
  for (let index = 0; index < parts.length; index++) {
    property = properties?.find((p) => p.name === parts[index]);
    if (!property) return;
    if (index === parts.length - 1) return property;
    const type = visibleKeyType(
      property.type,
      property.schema || schema,
      catalog,
    );
    if (!type) return;
    properties = type.properties;
    schema = type.schema;
  }
}
function visibleKeyType(name, scope, catalog) {
  const seen = new Set();
  while (scope && !seen.has(scope)) {
    seen.add(scope);
    const type = catalog.types?.find(
      (type) => type.schema === scope && type.name === name,
    );
    if (type) return type;
    scope = catalog.schemas.find((schema) => schema.name === scope)?.parent;
  }
}
function collectionKeyChoices(member, catalog, schema) {
  if (!member) return [];
  const result = [...(member.properties || [])];
  let paths = 0;
  // One reference hop keeps suggestions finite even for cyclic object models.
  // Deeper native paths remain valid typed input and use the same resolver.
  for (const property of member.properties || []) {
    const type = visibleKeyType(
      property.type,
      property.schema || schema,
      catalog,
    );
    if (!type) continue;
    for (const child of type.properties || []) {
      if (paths++ >= 2000) return result;
      result.push({ ...child, name: property.name + "." + child.name });
    }
  }
  return result;
}
module.exports = {
  collectionCatalog,
  generateCollection,
  resolveKeyProperty,
  collectionKeyChoices,
};
