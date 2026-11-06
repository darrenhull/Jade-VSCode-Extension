"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { choices } = require("../extension/media/collection-choices");
test("large designer catalogs produce bounded searchable suggestions without changing membership", () => {
  const records = Array.from({ length: 30000 }, (_, n) => ({
    name: "Fish" + String(n).padStart(5, "0"),
  }));
  assert.equal(choices(records, "").length, 100);
  assert.deepEqual(
    choices(records, "fish29999").map((r) => r.name),
    ["Fish29999"],
  );
  assert.equal(records.length, 30000);
  assert.equal(choices(records, "missing").length, 0);
});
test("exact class matches are suggested before broader substring matches", () => {
  const values = [
    { name: "BigFish" },
    { name: "FishByName" },
    { name: "Fish" },
    { name: "GoldFish" },
  ];
  assert.equal(choices(values, "fish")[0].name, "Fish");
  assert.deepEqual(
    choices(values, "fish", 2).map((v) => v.name),
    ["Fish", "FishByName"],
  );
});
