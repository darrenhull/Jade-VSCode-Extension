"use strict";
const { readCollectionDefinition } = require("./collection-definition");
const { resolveKeyProperty } = require("./collections");
const { lifetimeMetadata } = require("./creation-lifetime-metadata");
const bases = Object.freeze({ memberDictionary: "MemberKeyDictionary", externalDictionary: "ExtKeyDictionary", objectArray: "ObjectArray", objectSet: "ObjectSet" });
const families = Object.fromEntries(Object.entries(bases).map(([family, name]) => ["RootSchema::" + name, family]));
function familyFor(request) {
  const family = request.collectionFamily || ({ member: "memberDictionary", external: "externalDictionary" }[request.kind]);
  if (typeof family !== "string" || !Object.hasOwn(bases, family)) { const error = Error("Choose a supported collection family."); error.field = "dictionary"; throw error; }
  return family;
}
function createCollectionRules(project, { systemCache, catalogProvider } = {}) {
  const definitions = new Map(), sourceEntries = new Map(), types = new Map(), schemaParents = new Map(project.schemas.map(schema => [schema.name, schema.parent]));
  for (const schema of project.schemas) for (const entry of schema.classes) {
    const id = schema.name + "::" + entry.owner;
    sourceEntries.set(id, { entry, schema: schema.name });
    types.set(id, { id, name: entry.owner, schema: schema.name, parent: entry.model.classes.find(cls => cls.name === entry.owner)?.parent });
  }
  const names = new Map((systemCache?.types || []).map(type => [type.oid, type.name]));
  for (const type of systemCache?.types || []) {
    if (type.primitive || type.schema_name && type.schema_name !== "RootSchema") continue;
    const id = "RootSchema::" + type.name;
    const keys = (type.keys || []).map(key => ({ name: key.name, type: names.get(key.type_oid), nativeLength: key.length, descending: key.descending, caseInsensitive: key.case_insensitive, nativeSortOrder: key.sort_order, fieldProvenance: {
      ...(key.name !== undefined ? { name: "nativeMetadata" } : {}), ...(names.has(key.type_oid) ? { type: "nativeMetadata" } : {}), ...(key.length !== undefined ? { nativeLength: "nativeMetadata" } : {}),
      ...(typeof key.descending === "boolean" ? { descending: "nativeMetadata" } : {}), ...(typeof key.case_insensitive === "boolean" ? { caseInsensitive: "nativeMetadata" } : {}), ...(key.sort_order !== undefined ? { nativeSortOrder: "nativeMetadata" } : {}),
    } }));
    const metadata = { id, name: type.name, schema: "RootSchema", parent: names.get(type.superclass_oid), final: type.final, subschemaHidden: type.subaccess >= 3, membership: names.get(type.member_type_oid), keys, keysStatus: keys.length ? "nativeRequired" : "none", nativeType: type };
    definitions.set(id, metadata); types.set(id, metadata);
  }
  for (const name of ["Object", ...Object.values(bases)]) {
    const id = "RootSchema::" + name;
    if (!types.has(id)) { const metadata = { id, name, schema: "RootSchema", keys: [], keysStatus: "none" }; definitions.set(id, metadata); types.set(id, metadata); }
  }
  function get(id, metadata) {
    if (!metadata) return types.get(id);
    if (!definitions.has(id) && sourceEntries.has(id)) {
      const source = sourceEntries.get(id);
      definitions.set(id, readCollectionDefinition(source.entry, source.schema));
    }
    return definitions.get(id);
  }
  function resolve(identity, schema, metadata = false) {
    if (String(identity || "").includes("::")) return get(identity, metadata);
    const seen = new Set();
    while (schema && !seen.has(schema)) {
      seen.add(schema);
      const found = get(schema + "::" + identity, metadata);
      if (found) return found;
      schema = schemaParents.get(schema) || (schema === "RootSchema" ? undefined : "RootSchema");
    }
  }
  function familyOf(identity, schema) {
    let current = resolve(identity, schema), seen = new Set();
    while (current && !seen.has(current.id)) {
      if (families[current.id]) return families[current.id];
      seen.add(current.id);
      current = resolve(current.parent, current.schema);
    }
  }
  function memberKeys(definition) {
    if (definition.keyKind !== "member" || !catalogProvider) return definition.keys;
    const catalog = catalogProvider();
    const memberType = resolve(definition.membership, definition.schema);
    let member = memberType && catalog.types.find(type => type.name === memberType.name && type.schema === memberType.schema);
    if (!member && definition.membership?.includes("::")) {
      const seen = new Set();
      for (let scope = definition.schema; scope && !seen.has(scope); scope = schemaParents.get(scope)) {
        seen.add(scope);
        member = catalog.types.find(type => type.name === definition.membership && type.schema === scope);
        if (member) break;
      }
    }
    if (!member) return definition.keys;
    return definition.keys.map(key => {
      const property = resolveKeyProperty(member, key.name, catalog, definition.schema);
      if (!property) return key;
      const fields = {}, fieldProvenance = { ...key.fieldProvenance };
      for (const field of ["type", "length", "precision", "scale"])
        if (property[field] !== undefined) { fields[field] = property[field]; fieldProvenance[field] = "Resolved member property metadata: " + (property.schema || member.schema) + "::" + (property.owner || member.name) + "." + property.name; }
      return { ...key, ...fields, fieldProvenance };
    });
  }
  function inheritedKeys(identity, schema) {
    const seen = new Set();
    let current = resolve(identity, schema, true);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.keysStatus !== "none") return { status: current.keysStatus, owner: current.id, keys: memberKeys(current), kind: current.keyKind, nativeSource: current.nativeKeySource, membership: current.membership, duplicatesAllowed: current.duplicatesAllowed, fieldProvenance: current.fieldProvenance || {} };
      current = resolve(current.parent, current.schema, true);
    }
    return { status: current ? "nativeRequired" : "none", keys: [] };
  }
  function describe(request) {
    const family = request.type === "class" ? undefined : familyFor(request);
    const dictionary = family === "memberDictionary" || family === "externalDictionary";
    const parent = resolve(request.superclass || (family ? bases[family] : "Object"), request.schema, true);
    const allowFlags = lifetimeMetadata({ sourceOptions: parent?.sourceOptions, nativeType: parent?.nativeType });
    const flagsComplete = Object.values(allowFlags).every(scope => Object.values(scope).every(flag => typeof flag?.value === "boolean"));
    return {
      family,
      inheritedKeys: dictionary ? inheritedKeys(request.superclass || bases[family], request.schema) : { status: "notApplicable", keys: [] },
      keyBudget: keyBudget(request, family, dictionary),
      lifetime: { default: request.lifetime, owner: parent?.id, context: "superclass", allowFlags, restrictionsStatus: flagsComplete ? "known" : "nativeRequired", message: "Default lifetime chooses what create uses when no lifetime is specified; it does not restrict allowed instance lifetimes. The displayed class/subclass allowances describe the selected superclass. Unrecorded flags and the proposed class require native validation." },
      sizing: { modes: Object.fromEntries(["blockSize", "expectedPopulation"].map(field => [field, { status: "known", min: 0, max: 2147483647, integer: true, provenance: "Jade 25.0.02 native CLS load and public property round-trip; -1 rejected 7726 and 2147483648 rejected 6065." }])), runtimeMessage: "These bounds validate requested native source values. Jade may adjust effective allocation at runtime; source acceptance does not guarantee runtime capacity." },
      warnings: [],
    };
  }
  function keyBudget(request, family, dictionary) {
    if (!dictionary) return { status: "notApplicable", limit: 512, message: "Arrays and sets do not define dictionary keys." };
    if (family === "externalDictionary" && request.keys?.length && request.keys.every(key => key.type === "String" && Number.isSafeInteger(key.length) && key.length > 0)) {
      const usedUnits = request.keys.reduce((total, key) => total + key.length, 0);
      return { status: "known", usedUnits, limit: 512, message: usedUnits + " / 512 native CLS String key-length units (verified with Jade 25.0.02). These units are not a count of display characters." };
    }
    return { status: "nativeRequired", limit: 512, message: "This combination needs native validation. No unproved UTF-8, Binary, mixed-type or member-key conversion formula is applied." };
  }
  function validate(request) {
    const parent = resolve(request.superclass || (request.type === "class" ? "Object" : bases[familyFor(request)]), request.schema, true);
    function reject(field, message, details) { const error = Error(message); error.field = field; Object.assign(error, details); throw error; }
    function mismatch(index, expected, attribute, reason) {
      reject("keys", reason + " New dictionary subclasses with this mismatch are rejected by native Jade (6385).", { code: "JADE_INHERITED_KEY_MISMATCH", metadataStatus: "known", keyIndex: index, keyName: expected?.name, attribute, nativeCode: 6385, nativeCodeProvenance: "Verified Jade 25.0.02 new-subclass fixtures; this is a rule hint, not a compiler run." });
    }
    if (parent?.final) reject("superclass", "The selected superclass is final and cannot be subclassed.");
    if (parent?.subschemaFinal && parent.schema !== request.schema) reject("superclass", "The selected superclass is final in subschemas.");
    if (request.type === "class") return;
    if (request.blockSize !== undefined && request.expectedPopulation !== undefined) reject("sizing", "Choose entries per block or expected population, not both.");
    for (const field of ["blockSize", "expectedPopulation"])
      if (request[field] !== undefined && (!Number.isSafeInteger(request[field]) || request[field] < 0 || request[field] > 2147483647)) reject("sizing", "Collection sizing must be a whole native Integer from 0 to 2147483647; zero uses Jade defaults.");
    const family = familyFor(request), budget = keyBudget(request, family, family === "memberDictionary" || family === "externalDictionary");
    if (budget.status === "known" && budget.usedUnits > budget.limit) reject("keys", "Combined external String key definitions exceed 512 native CLS key-length units. Native Jade rejects this definition (6206).");
    const inherited = inheritedKeys(parent?.id, request.schema);
    if (inherited.status !== "known" || !Array.isArray(request.keys)) return;
    if (inherited.kind === "external" && inherited.keys.length !== request.keys.length)
      mismatch(Math.min(inherited.keys.length, request.keys.length), inherited.keys[Math.min(inherited.keys.length, request.keys.length)], "count", "Keep the inherited number of dictionary keys.");
    for (let index = 0; index < Math.min(inherited.keys.length, request.keys.length); index++) {
      const expected = inherited.keys[index], actual = request.keys[index];
      if (inherited.kind === "member" && typeof expected.name === "string" && typeof actual?.name === "string" && expected.name !== actual.name)
        mismatch(index, expected, "name", "Keep the inherited member-key property and key order.");
      if (inherited.kind !== "external") continue;
      // These external-key attributes have been independently rejected by Jade
      // 25.0.02 with 6385. Key names can differ and are deliberately not compared.
      for (const attribute of ["descending", "caseInsensitive"])
        if (typeof expected[attribute] === "boolean" && typeof actual?.[attribute] === "boolean" && expected[attribute] !== actual[attribute])
          mismatch(index, expected, attribute, "Keep the inherited key " + (attribute === "descending" ? "direction" : "case-sensitivity") + " setting.");
      if (expected.type === actual.type && Number.isInteger(expected.length) && Number.isInteger(actual.length) && expected.length !== actual.length)
        mismatch(index, expected, "length", "Keep the inherited key length.");
      if (expected.type && actual.type && expected.type !== actual.type)
        mismatch(index, expected, "type", "Keep the inherited external-key type and key order.");
    }
  }
  return { familyOf, describe, validate, metadata: (identity, schema) => resolve(identity, schema, true) };
}
function nativeCollectionOptions(request, { includeLoadFactor = false } = {}) {
  const options = [];
  for (const field of ["blockSize", "expectedPopulation"]) if (request[field] !== undefined) options.push(field + " = " + request[field]);
  if (includeLoadFactor && request.loadFactor !== undefined) options.push("loadFactor = " + request.loadFactor);
  return options;
}
module.exports = { createCollectionRules, familyFor, bases, nativeCollectionOptions };
