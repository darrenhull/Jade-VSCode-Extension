"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { inheritedKeyRows, lifetimeRows, placementChoices, sizingChoices, sizingSelectionError } = require("../../extension/media/creation-rules-view");
test("custom sizing remains unavailable until the specific source bounds and their evidence are supplied", () => {
  const choices = sizingChoices({}); assert.equal(choices.find(mode => mode.id === "native").disabled, false);
  for (const mode of choices.filter(mode => mode.id !== "native")) { assert.equal(mode.disabled, true); assert.match(mode.reason, /source bounds|unavailable/i); }
});
test("proven source sizing bounds enable only the proven mode without claiming effective runtime capacity", () => {
  const choices = sizingChoices({ modes: { blockSize: { status: "known", min: 0, max: 99, integer: true, provenance: "Native fixture source-bound proof" } } });
  const block = choices.find(mode => mode.id === "blockSize"), population = choices.find(mode => mode.id === "expectedPopulation");
  assert.equal(block.disabled, false); assert.equal(block.min, 0); assert.equal(block.max, 99); assert.equal(population.disabled, true); assert.match(block.runtimeNotice, /runtime.*allocation|runtime.*capacity/i);
});
test("an unavailable or out-of-bound selected sizing mode stays an error instead of silently choosing a default", () => {
  const choices = sizingChoices({ modes: { blockSize: { status: "known", min: 0, max: 99, integer: true, provenance: "Native fixture proof" } } });
  assert.match(sizingSelectionError({ sizingMode: "expectedPopulation", sizingValue: 10 }, sizingChoices({})), /unavailable|source bounds/i);
  assert.match(sizingSelectionError({ sizingMode: "blockSize", sizingValue: 100 }, choices), /0.*99/);
  assert.match(sizingSelectionError({ sizingMode: "blockSize", sizingValue: 1.5 }, choices), /whole number/i);
  assert.equal(sizingSelectionError({ sizingMode: "blockSize", sizingValue: 0 }, choices), undefined);
  assert.equal(sizingSelectionError({ sizingMode: "native", sizingValue: 1000 }, choices), undefined);
});
test("missing inherited metadata remains unknown for every comparison attribute and duplicate policy", () => {
  const rows = inheritedKeyRows({ status: "nativeRequired", keys: [{ name: "lookup" }] });
  for (const field of ["type", "length", "scale", "direction", "case", "locale", "duplicates"]) assert.equal(rows[0].fields.find(row => row.id === field).value, "Unknown");
  assert.equal(rows[0].compatible, false);
});
test("provided false and zero values retain their actual native meaning and provenance", () => {
  const rows = inheritedKeyRows({ status: "known", duplicatesAllowed: false, provenance: "native CLS header", keys: [{ name: "lookup", type: "Decimal", length: 12, scale: 0, descending: false, caseInsensitive: false, locale: 2057, fieldProvenance: { descending: "native CLS key declaration" } }] });
  const value = id => rows[0].fields.find(row => row.id === id).value;
  assert.equal(value("direction"), "Ascending"); assert.equal(value("case"), "Case-sensitive"); assert.equal(value("scale"), "0"); assert.equal(value("duplicates"), "Not allowed");
  assert.match(rows[0].fields.find(row => row.id === "direction").provenance, /native CLS/);
});
test("raw native comparison numbers never become guessed locale or Binary/Latin1 descriptions", () => {
  const rows = inheritedKeyRows({ status: "nativeRequired", keys: [{ name: "lookup", nativeSortOrder: 0, nativeLength: 50 }] });
  const locale = rows[0].fields.find(row => row.id === "locale"); assert.equal(locale.value, "Unknown"); assert.match(locale.provenance, /raw native sort order: 0/); assert.doesNotMatch(locale.provenance, /Latin1|Binary/);
});
test("default lifetime is separate from actual allowed instance and subclass flags", () => {
  const rows = lifetimeRows({ default: "persistent", allowFlags: { persistentAllowed: { value: true, provenance: "native header" }, transientAllowed: { value: false, provenance: "native header" } } });
  assert.equal(rows.find(row => row.id === "default").value, "persistent"); assert.equal(rows.find(row => row.id === "persistentAllowed").value, "Allowed"); assert.equal(rows.find(row => row.id === "transientAllowed").value, "Not allowed");
  assert.equal(rows.find(row => row.id === "subclassPersistentAllowed").value, "Unknown"); assert.equal(rows.find(row => row.id === "sharedTransientAllowed").value, "Unknown");
});
test("actual nested class and subclass flags retain false and provenance without treating a default as a permission", () => {
  const rows = lifetimeRows({ owner: "Pets::BaseCollection", default: "transient", allowFlags: { class: { persistent: { value: false, provenance: "Native type metadata" }, transient: { value: true, provenance: "Source class header" } }, subclass: { sharedTransient: { value: false, provenance: "Native subclass metadata" } } } });
  assert.equal(rows.find(row => row.id === "persistentAllowed").value, "Not allowed");
  assert.equal(rows.find(row => row.id === "transientAllowed").value, "Allowed");
  assert.equal(rows.find(row => row.id === "subclassSharedTransientAllowed").value, "Not allowed");
  assert.equal(rows.find(row => row.id === "subclassPersistentAllowed").value, "Unknown");
  assert.equal(rows.find(row => row.id === "sharedTransientAllowed").value, "Unknown");
});
test("an explicit native-default descriptor is displayed only when native metadata supplies its meaning", () => {
  const known = lifetimeRows({ allowFlags: { persistentAllowed: { value: false, status: "nativeDefault", provenance: "native omission rule verified" } } });
  assert.match(known.find(row => row.id === "persistentAllowed").value, /Not allowed.*native default/);
  const unknown = lifetimeRows({ allowFlags: { persistentAllowed: { status: "nativeDefault", provenance: "unspecified" } } });
  assert.equal(unknown.find(row => row.id === "persistentAllowed").value, "Unknown");
});
test("ordinary class mapping and exclusive ownership choices remain separate and unknown ownership is disabled with a reason", () => {
  const options = placementChoices({ classMap: { id: "Pets::PetsDb::alternate" }, exclusivePlacement: { status: "nativeRequired", message: "Exclusive-map owner metadata is unavailable." } });
  assert.equal(options.classMap.id, "Pets::PetsDb::alternate"); assert.equal(options.exclusive.every(option => option.disabled), true); assert.equal(options.exclusive.length, 2);
  assert.ok(options.exclusive.every(option => /metadata is unavailable/.test(option.reason)));
});
