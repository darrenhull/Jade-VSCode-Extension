"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const {
  nativeProcess,
  runNativeTests,
} = require("../extension/src/working-database");
const {
  collectionCatalog,
  generateCollection,
} = require("../extension/src/collections");
const { parseSource } = require("../extension/src/source_symbols");
test(
  "generated reference key paths, inherited dictionary and load-factor tuning compile and execute natively",
  {
    skip: process.env.JADE_COLLECTION_ADVANCED !== "1",
    timeout: 180000,
  },
  async () => {
    const base = path.resolve(__dirname, ".."),
      working = JSON.parse(
        fs.readFileSync(
          path.join(base, "evidence/advanced-collection-working.json"),
        ),
      ),
      directory = path.join(base, "evidence/advanced-collection-generated");
    fs.mkdirSync(directory, { recursive: true });
    const header =
      'jadeVersionNumber "25.0.02";\nschemaDefinition\nSJetSchema subschemaOf RootSchema partialDefinition;\n';
    let output = "";
    async function load(name, text) {
      const file = path.join(directory, name + ".cls");
      fs.writeFileSync(file, text);
      const result = await nativeProcess(
        path.join(working.installPath, "bin/jadloadb.exe"),
        [
          "path=" + working.databasePath,
          "ini=" + working.iniPath,
          "server=singleUser",
          "schemaFile=" + file,
          "targetSchema=SJetSchema",
          "loadStyle=currentSchemaVersion",
          "dontSaveSources=false",
        ],
        working,
        (t) => (output += t),
      );
      assert.equal(result.success, true, result.output);
      return { owner: name, model: parseSource(text, file) };
    }
    const owner = await load(
      "AdvancedGeneratedOwner",
      header +
        "typeHeaders\nAdvancedGeneratedOwner subclassOf Object transient;\ntypeDefinitions\nAdvancedGeneratedOwner completeDefinition\n(\nattributeDefinitions\n name: String[50];\n)\ntypeSources\n",
    );
    const member = await load(
      "AdvancedGeneratedMember",
      header +
        "typeHeaders\nAdvancedGeneratedMember subclassOf Object transient;\ntypeDefinitions\nAdvancedGeneratedMember completeDefinition\n(\nreferenceDefinitions\n owner: AdvancedGeneratedOwner;\n)\ntypeSources\n",
    );
    const schema = {
      name: "SJetSchema",
      parent: "RootSchema",
      folder: directory,
      header: { text: header },
      classes: [owner, member],
    };
    const request = {
      schema: "SJetSchema",
      name: "AdvancedGeneratedPath",
      membership: "AdvancedGeneratedMember",
      kind: "member",
      lifetime: "transient",
      loadFactor: 66,
      keys: [{ name: "owner.name" }],
    };
    const generated = generateCollection(
      request,
      collectionCatalog({ schemas: [schema] }),
    );
    const dictionary = await load(request.name, generated.text);
    schema.classes.push(dictionary);
    await load(
      "AdvancedGeneratedChild",
      generateCollection(
        {
          ...request,
          name: "AdvancedGeneratedChild",
          superclass: request.name,
        },
        collectionCatalog({ schemas: [schema] }),
      ).text,
    );
    for (const loadFactor of [1, 100])
      await load(
        "AdvancedGeneratedLoad" + loadFactor,
        generateCollection(
          {
            ...request,
            name: "AdvancedGeneratedLoad" + loadFactor,
            loadFactor,
          },
          collectionCatalog({ schemas: [schema] }),
        ).text,
      );
    const body = `keyPathLookup() unitTest;
vars
 owner: AdvancedGeneratedOwner;
 member: AdvancedGeneratedMember;
 dictionary: AdvancedGeneratedPath;
 child: AdvancedGeneratedChild;
begin
 create owner transient; owner.name := "A";
 create member transient; member.owner := owner;
 create dictionary transient; dictionary.add(member);
 assertEquals(member, dictionary.getAtKey("A"));
 create child transient; child.add(member);
 assertEquals(member, child.getAtKey("A"));
epilog
 delete child; delete dictionary; delete member; delete owner;
end;`;
    await load(
      "AdvancedGeneratedTests",
      header +
        "typeHeaders\nAdvancedGeneratedTests subclassOf JadeTestCase transient;\ntypeDefinitions\nAdvancedGeneratedTests completeDefinition\n(\njadeMethodDefinitions\nkeyPathLookup() unitTest;\n)\ntypeSources\nAdvancedGeneratedTests (\njadeMethodSources\nkeyPathLookup\n{\n" +
        body +
        "\n}\n)",
    );
    const result = await runNativeTests(
      working,
      {
        schema: "SJetSchema",
        owner: "AdvancedGeneratedTests",
        methods: ["keyPathLookup"],
      },
      (text) => (output += text),
    );
    fs.writeFileSync(path.join(directory, "output.txt"), output);
    fs.writeFileSync(
      path.join(directory, "result.json"),
      JSON.stringify(result, null, 2),
    );
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.failures, 0);
  },
);
