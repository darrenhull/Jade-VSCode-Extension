"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  chooseCollectionMember,
} = require("../extension/src/collection-designer");
test("the native member picker presents all visible classes even when BaseUnitTest is currently selected", async () => {
  const schema = {
    name: "SJetTestSchema",
    members: [
      { name: "BaseUnitTest", schema: "SJetTestSchema" },
      { name: "Fish", schema: "SJetSchema" },
      { name: "Sheep", schema: "SJetSchema" },
      { name: "Hampster", schema: "SJetSchema" },
    ],
  };
  let seen;
  const selected = await chooseCollectionMember(
    {
      window: {
        showQuickPick: async (items, options) => {
          seen = { items, options };
          return items.find((item) => item.label === "Fish");
        },
      },
    },
    schema,
    "BaseUnitTest",
  );
  assert.equal(selected, "Fish");
  assert.equal(seen.items.length, 4);
  assert.match(
    seen.items.find((item) => item.label === "Fish").description,
    /SJetSchema/,
  );
  assert.match(seen.options.placeHolder, /4/);
});
