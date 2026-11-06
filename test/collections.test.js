"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  collectionCatalog,
  generateCollection,
} = require("../extension/src/collections");
const { parseSource } = require("../extension/src/source_symbols");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { writeCollection } = require("../extension/src/collection-files");
function cls(schema, owner, parent, properties) {
  const text = `jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf ${parent} transient;\ntypeDefinitions\n${owner} completeDefinition\n(\nattributeDefinitions\n${properties}\n)\ntypeSources\n`;
  return { owner, text, model: parseSource(text, owner + ".cls") };
}
function catalog() {
  return collectionCatalog({
    schemas: [
      {
        name: "Base",
        parent: "RootSchema",
        folder: "/workspace/schemas/Base",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [
          cls("Base", "Animal", "Object", "name: String[50];\nrank: Integer;"),
        ],
      },
      {
        name: "Pets",
        parent: "Base",
        folder: "/workspace/schemas/Pets",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [cls("Pets", "Fish", "Animal", "species: String[30];")],
      },
      {
        name: "Other",
        parent: "RootSchema",
        folder: "/workspace/schemas/Other",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [cls("Other", "Fish", "Object", "different: Integer;")],
      },
    ],
  });
}
const request = {
  schema: "Pets",
  name: "FishByName",
  kind: "member",
  membership: "Fish",
  lifetime: "transient",
  duplicatesAllowed: false,
  keys: [{ name: "name", descending: false }],
};
test("persistent collection uses the native default lifetime without an invalid persistent option", () => {
  const result = generateCollection(
    { ...request, lifetime: "persistent" },
    catalog(),
  );
  assert.match(result.text, /FishByName subclassOf MemberKeyDictionary;/);
  assert.doesNotMatch(result.text, /subclassOf[^;]*\bpersistent\b/);
});
test("collection catalog resolves inherited fields within schema ancestry, irrespective of folders", () => {
  const c = catalog(),
    fish = c.schemas
      .find((s) => s.name === "Pets")
      .members.find((m) => m.name === "Fish");
  assert.deepEqual(fish.properties.map((p) => p.name).sort(), [
    "name",
    "rank",
    "species",
  ]);
  assert.equal(
    c.schemas
      .find((s) => s.name === "Other")
      .members.find((m) => m.name === "Fish").properties[0].name,
    "different",
  );
});
test("member collection emits native membership and ordered key sections without invented ids", () => {
  const r = generateCollection(
    {
      ...request,
      keys: [
        { name: "name", caseInsensitive: true },
        { name: "rank", descending: true },
      ],
      duplicatesAllowed: true,
    },
    catalog(),
  );
  assert.equal(r.fileName, "FishByName.cls");
  assert.match(
    r.text,
    /FishByName subclassOf MemberKeyDictionary transient, duplicatesAllowed;/,
  );
  assert.match(r.text, /FishByName of Fish;/);
  assert.match(r.text, /name caseInsensitive;\r\n\s*rank descending;/);
  assert.doesNotMatch(r.text, /number\s*=|patchVersion/);
  assert.equal(parseSource(r.text, r.fileName).classes.length, 1);
});
test("external dictionaries emit typed keys with validated native lengths", () => {
  const r = generateCollection(
    {
      ...request,
      kind: "external",
      keys: [
        { name: "lookup", type: "String", length: 50 },
        { name: "position", type: "Integer", descending: true },
      ],
    },
    catalog(),
  );
  assert.match(r.text, /subclassOf ExtKeyDictionary/);
  assert.match(r.text, /externalKeyDefinitions/);
  assert.match(r.text, /lookup: String\[50\];/);
  assert.match(r.text, /position: Integer descending;/);
  assert.throws(
    () =>
      generateCollection(
        {
          ...request,
          kind: "external",
          keys: [{ name: "lookup", type: "String", length: 512 }],
        },
        catalog(),
      ),
    /length/i,
  );
});
test("collection validation rejects invalid identities, missing keys, cross-schema types and collisions", () => {
  for (const value of [
    { name: "../Bad" },
    { name: "JadeThing" },
    { membership: "Missing" },
    { keys: [] },
    { keys: [{ name: "missing" }] },
    { keys: [{ name: "name" }, { name: "name" }] },
    { schema: "RootSchema" },
  ])
    assert.throws(() =>
      generateCollection({ ...request, ...value }, catalog()),
    );
  assert.throws(
    () => generateCollection({ ...request, name: "Fish" }, catalog()),
    /exist/i,
  );
  assert.throws(
    () =>
      generateCollection(
        { ...request, keys: [{ name: "rank", caseInsensitive: true }] },
        catalog(),
      ),
    /String/i,
  );
});
test("reference key paths resolve each property in its declaring schema and reject missing endpoints", () => {
  const project = {
    schemas: [
      {
        name: "Pets",
        parent: "RootSchema",
        folder: "/workspace/Pets",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [
          cls("Pets", "Owner", "Object", "name: String[50];"),
          cls("Pets", "Fish", "Object", "owner: Owner;"),
        ],
      },
    ],
  };
  const c = collectionCatalog(project),
    value = {
      ...request,
      keys: [{ name: "owner.name", caseInsensitive: true }],
    };
  assert.match(
    generateCollection(value, c).text,
    /owner.name caseInsensitive;/,
  );
  assert.throws(
    () =>
      generateCollection({ ...value, keys: [{ name: "owner.missing" }] }, c),
    /property|path/i,
  );
  assert.throws(
    () =>
      generateCollection(
        { ...value, keys: [{ name: "owner.name.length" }] },
        c,
      ),
    /property|path/i,
  );
});
test("native load-factor tuning is optional and bounded without changing default source", () => {
  assert.match(
    generateCollection({ ...request, loadFactor: 66 }, catalog()).text,
    /loadFactor = 66/,
  );
  for (const loadFactor of [0, 101, 1.5, "66"])
    assert.throws(
      () => generateCollection({ ...request, loadFactor }, catalog()),
      /load factor/i,
    );
  assert.doesNotMatch(
    generateCollection(request, catalog()).text,
    /loadFactor/,
  );
});
test("custom dictionary superclasses must match the chosen native dictionary kind", () => {
  const base = cls("Pets", "FishBySpecies", "MemberKeyDictionary", ""),
    project = {
      schemas: [
        {
          name: "Pets",
          parent: "RootSchema",
          folder: "/workspace/Pets",
          header: { text: 'jadeVersionNumber "25.0.02";' },
          classes: [cls("Pets", "Fish", "Object", "name: String[50];"), base],
        },
      ],
    },
    c = collectionCatalog(project);
  assert.match(
    generateCollection({ ...request, superclass: "FishBySpecies" }, c).text,
    /subclassOf FishBySpecies transient;/,
  );
  assert.throws(
    () => generateCollection({ ...request, superclass: "Fish" }, c),
    /superclass/i,
  );
  assert.throws(
    () =>
      generateCollection(
        { ...request, superclass: "FishBySpecies", kind: "external" },
        c,
      ),
    /superclass/i,
  );
});
test("file creation is exclusive and cannot escape the selected workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jade-collection-write-"));
  try {
    const generated = {
      folder: path.join(root, "schemas", "Pets"),
      fileName: "FishByName.cls",
      text: "native source",
    };
    const file = writeCollection(root, generated);
    assert.equal(fs.readFileSync(file, "utf8"), "native source");
    assert.throws(
      () => writeCollection(root, { ...generated, text: "overwrite" }),
      /exist/i,
    );
    assert.throws(
      () => writeCollection(root, { ...generated, folder: path.dirname(root) }),
      /workspace/i,
    );
    assert.throws(() =>
      writeCollection(root, { ...generated, fileName: "../escape.cls" }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("workspace locale choices follow schema ancestry and preserve native LCIDs and friendly names", () => {
  const project = {
    schemas: [
      {
        name: "Base",
        parent: "RootSchema",
        folder: "/workspace/Base",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [cls("Base", "Fish", "Object", "name: String[50];")],
        entries: [
          {
            text: 'localeDefinitions\n2057 "English (United Kingdom)" schemaDefaultLocale;\n1033 "English (United States)";',
            extension: ".sec",
          },
        ],
      },
      {
        name: "Pets",
        parent: "Base",
        folder: "/workspace/Pets",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [],
        entries: [
          {
            text: 'localeDefinitions\n1033 "English US override";\n1036 "French (France)";',
            extension: ".sec",
          },
        ],
      },
    ],
  };
  const c = collectionCatalog(project),
    locales = c.schemas.find((s) => s.name === "Pets").locales;
  assert.deepEqual(
    locales.map((l) => [l.id, l.name]),
    [
      [1033, "English US override"],
      [1036, "French (France)"],
      [2057, "English (United Kingdom)"],
    ],
  );
  assert.equal(locales.find((l) => l.id === 2057).schemaDefault, true);
});
test("native String key locale follows canonical modifier ordering and stays absent by default", () => {
  const c = catalog(),
    value = {
      ...request,
      keys: [
        { name: "name", locale: 2057, caseInsensitive: true, descending: true },
      ],
    };
  assert.match(
    generateCollection(value, c).text,
    /name descending, caseInsensitive 2057;/,
  );
  assert.match(
    generateCollection({ ...value, keys: [{ name: "name", locale: 2057 }] }, c)
      .text,
    /name 2057;/,
  );
  assert.doesNotMatch(generateCollection(request, c).text, /\b2057\b/);
  for (const locale of [null, 0, -1, 1.5, "2057", NaN, 2147483648])
    assert.throws(
      () =>
        generateCollection({ ...request, keys: [{ name: "name", locale }] }, c),
      /locale/i,
    );
  assert.throws(
    () =>
      generateCollection(
        { ...request, keys: [{ name: "rank", locale: 2057 }] },
        c,
      ),
    /String/,
  );
  assert.match(
    generateCollection(
      {
        ...request,
        kind: "external",
        keys: [
          {
            name: "lookup",
            type: "String",
            length: 48,
            locale: 1033,
            descending: true,
            caseInsensitive: true,
          },
        ],
      },
      c,
    ).text,
    /lookup: String\[48\] descending, caseInsensitive 1033;/,
  );
});
test("StringUtf8 native locale and both sort modifiers use the same native token order", () => {
  assert.match(
    generateCollection(
      {
        ...request,
        kind: "external",
        keys: [
          {
            name: "lookup",
            type: "StringUtf8",
            length: 50,
            locale: 2057,
            descending: true,
            caseInsensitive: true,
          },
        ],
      },
      catalog(),
    ).text,
    /lookup: StringUtf8\[50\] descending, caseInsensitive 2057;/,
  );
});
test("nearest schema default locale overrides an ancestor default regardless of LCID sort order", () => {
  const project = {
    schemas: [
      {
        name: "Base",
        parent: "RootSchema",
        folder: "/Base",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [],
        entries: [
          { text: 'localeDefinitions\n2057 "English" schemaDefaultLocale;' },
        ],
      },
      {
        name: "Pets",
        parent: "Base",
        folder: "/Pets",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [],
        entries: [
          { text: 'localeDefinitions\n3082 "Spanish" schemaDefaultLocale;' },
        ],
      },
    ],
  };
  const locales = collectionCatalog(project).schemas.find(
    (schema) => schema.name === "Pets",
  ).locales;
  assert.equal(
    locales.find((locale) => locale.id === 3082).schemaDefault,
    true,
  );
  assert.equal(
    locales.find((locale) => locale.id === 2057).schemaDefault,
    false,
  );
});
test("test-schema membership includes application ancestors independent of folders, excluding sibling schemas", () => {
  const project = {
    schemas: [
      {
        name: "SJetSchema",
        parent: "RootSchema",
        folder: "/one",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [
          cls("SJetSchema", "Fish", "Object", "name: String[50];"),
          cls("SJetSchema", "Sheep", "Object", "name: String[50];"),
          cls("SJetSchema", "Hampster", "Object", "name: String[50];"),
        ],
      },
      {
        name: "SJetTestSchema",
        parent: "SJetSchema",
        folder: "/arbitrary/location",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [cls("SJetTestSchema", "BaseUnitTest", "JadeTestCase", "")],
      },
      {
        name: "Sibling",
        parent: "RootSchema",
        folder: "/another",
        header: { text: 'jadeVersionNumber "25.0.02";' },
        classes: [cls("Sibling", "NotVisible", "Object", "")],
      },
    ],
  };
  const schema = collectionCatalog(project).schemas.find(
    (value) => value.name === "SJetTestSchema",
  );
  assert.deepEqual(
    schema.members.map((member) => member.name),
    ["BaseUnitTest", "Fish", "Hampster", "Sheep"],
  );
  assert.equal(
    schema.members.find((member) => member.name === "Fish").schema,
    "SJetSchema",
  );
});
test("collection property choices include inherited fields and bounded reference paths with declaring-schema resolution", () => {
  const project = {
      schemas: [
        {
          name: "Base",
          parent: "RootSchema",
          folder: "/Base",
          header: { text: 'jadeVersionNumber "25.0.02";' },
          classes: [
            cls("Base", "Owner", "Object", "name: String[50];"),
            cls("Base", "Animal", "Object", "rank: Integer;"),
          ],
        },
        {
          name: "Pets",
          parent: "Base",
          folder: "/Pets",
          header: { text: 'jadeVersionNumber "25.0.02";' },
          classes: [
            cls(
              "Pets",
              "Fish",
              "Animal",
              "owner: Owner;\nspecies: String[50];",
            ),
          ],
        },
      ],
    },
    c = collectionCatalog(project),
    schema = c.schemas.find((s) => s.name === "Pets"),
    fish = schema.members.find((m) => m.name === "Fish"),
    { collectionKeyChoices } = require("../extension/src/collections");
  const properties = collectionKeyChoices(fish, c, "Pets");
  assert.ok(properties.some((p) => p.name === "rank"));
  assert.ok(properties.some((p) => p.name === "species"));
  assert.equal(properties.find((p) => p.name === "owner.name").type, "String");
});
