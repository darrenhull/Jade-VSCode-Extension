"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { moveKey, definitionRequest, describeDraft, collectionPresentation, prepareInheritedKeys, canSave, diagnosticField, choicePresentation, diagnosticPresentation } = require("../../extension/media/creation-designer");
test("imported choices show alias, exporter and importing context without replacing their qualified identity", () => {
  const row = { id: "Consumer::Zoo::Fish", label: "Consumer::Zoo::Fish", name: "Zoo::Fish", nativeName: "Zoo::Fish", imported: true, originSchema: "Provider", metadataStatus: "known" };
  const presentation = choicePresentation(row, "ConsumerChild");
  assert.equal(presentation.label, row.id); assert.match(presentation.detail, /Zoo::Fish/); assert.match(presentation.detail, /Provider/); assert.match(presentation.detail, /Consumer/); assert.match(presentation.detail, /ConsumerChild/);
  assert.equal(presentation.disabled, false); assert.equal(row.id, "Consumer::Zoo::Fish");
});
test("missing imported metadata is presented separately from an invalid schema selection", () => {
  const unknown = diagnosticPresentation({ code: "JADE_IMPORT_METADATA_UNAVAILABLE", message: "Exported properties were not extracted", metadataStatus: "nativeRequired" });
  const invalid = diagnosticPresentation({ code: "JADE_TYPE_NOT_VISIBLE", message: "The selected type is not visible", metadataStatus: "known" });
  assert.equal(unknown.kind, "metadata-unavailable"); assert.match(unknown.message, /Metadata unavailable/); assert.match(unknown.message, /Exported properties/);
  assert.equal(invalid.kind, "invalid-selection"); assert.notEqual(unknown.kind, invalid.kind);
});
test("a predicted native rule code is labelled as validation evidence rather than a compiler execution", () => {
  const hint = diagnosticPresentation({ message: "Inherited length mismatch (6385)", nativeCode: 6385, nativeCodeProvenance: "Verified native new-subclass fixtures; this is not a compiler run." });
  assert.equal(hint.kind, "native-rule-hint"); assert.match(hint.message, /Rule validation/); assert.match(hint.evidence, /not a compiler run/);
});
test("inherited-key diagnostics identify the offending control without replacing native codes or messages", () => {
  assert.equal(diagnosticField({ field: "keys", keyIndex: 0, keyName: "lookup", attribute: "length", nativeCode: 6385 }), "key-length-0");
  assert.equal(diagnosticField({ field: "keys", keyIndex: 1, attribute: "caseInsensitive", nativeCode: 6386 }), "key-case-1");
  assert.equal(diagnosticField({ field: "keys", keyIndex: 2, attribute: "name" }), "key-2");
  assert.equal(diagnosticField({ field: "keys" }), "keys");
});
test("implicit form submission is permitted only from the reviewed source step", () => {
  const reviewed = { receipt: "receipt", validPreview: true, saving: false };
  assert.equal(canSave({ ...reviewed, step: 0 }), false);
  assert.equal(canSave({ ...reviewed, step: 1 }), false);
  assert.equal(canSave({ ...reviewed, step: 2 }), true);
  assert.equal(canSave({ ...reviewed, step: 2, saving: true }), false);
});
test("keyboard key moves preserve composite-key settings and do not mutate their draft", () => {
  const keys = [{ name: "name", locale: 2057 }, { name: "age", descending: true }];
  const moved = moveKey(keys, 1, -1);
  assert.equal(moved[0].name, "age"); assert.equal(moved[1].locale, 2057);
  assert.equal(keys[0].name, "name");
  assert.deepEqual(moveKey(keys, 0, -1), keys);
});
test("known inherited key settings can be copied without mutating metadata and require explicit replacement of entered keys", () => {
  const inherited = { status: "known", keys: [{ name: "lookup", type: "String", length: 50, descending: true, caseInsensitive: true, locale: 2057 }] };
  const result = prepareInheritedKeys([{ name: "existing" }], inherited);
  assert.equal(result.requiresConfirmation, true); assert.deepEqual(result.keys, inherited.keys);
  result.keys[0].name = "renamed"; assert.equal(inherited.keys[0].name, "lookup");
  assert.equal(prepareInheritedKeys([{ name: "" }], inherited).requiresConfirmation, false);
});
test("unknown inherited native metadata cannot be turned into guessed editable key settings", () => {
  assert.equal(prepareInheritedKeys([], { status: "nativeRequired", keys: [{ name: "native", nativeLength: 100 }] }), undefined);
  assert.equal(prepareInheritedKeys([], { status: "known", keys: [] }), undefined);
  assert.equal(prepareInheritedKeys([], { status: "known", kind: "external", keys: [{ name: "lookup", type: "String", length: 50 }] }), undefined);
  assert.equal(prepareInheritedKeys([], { status: "known", kind: "external", keys: [{ name: "lookup", type: "String", descending: false, caseInsensitive: false }] }), undefined);
});
test("array and set requests omit inactive dictionary settings without losing the dictionary draft", () => {
  const draft = { type: "collection", collectionFamily: "objectArray", name: "FishArray", membership: "Pets::Fish", kind: "member", superclass: "RootSchema::ObjectArray", lifetime: "persistent", duplicatesAllowed: true, loadFactor: 60, keys: [{ name: "name", locale: 2057 }] };
  const request = definitionRequest(draft);
  assert.equal(request.collectionFamily, "objectArray"); assert.equal(request.keys, undefined); assert.equal(request.duplicatesAllowed, undefined); assert.equal(request.loadFactor, undefined);
  assert.equal(draft.keys[0].name, "name"); assert.equal(draft.loadFactor, 60);
  assert.equal(collectionPresentation(draft).keys, false); assert.equal(collectionPresentation(draft).tuning, false);
  assert.equal(collectionPresentation(draft).selector, "objectArray"); assert.equal(collectionPresentation(draft).base, "RootSchema::ObjectArray");
  assert.match(describeDraft(draft), /array of Fish/);
  draft.collectionFamily = "objectSet";
  assert.match(describeDraft(draft), /set of Fish/);
});
test("dictionary requests preserve their supported settings and canonical family", () => {
  const draft = { type: "collection", collectionFamily: "externalDictionary", kind: "external", keys: [{ name: "key", type: "String", length: 25 }], loadFactor: 50 };
  assert.equal(definitionRequest(draft).kind, "external"); assert.equal(definitionRequest(draft).keys[0].length, 25);
  assert.equal(collectionPresentation(draft).keys, true);
  assert.equal(collectionPresentation(draft).selector, "external");
});
test("sizing alternatives emit one proven native field including explicit zero and preserve set Btree load factor", () => {
  const draft = { type: "collection", collectionFamily: "objectSet", sizingMode: "blockSize", sizingValue: 16, loadFactor: 66 };
  let request = definitionRequest(draft);
  assert.equal(request.blockSize, 16); assert.equal(request.expectedPopulation, undefined); assert.equal(request.loadFactor, 66);
  assert.equal(request.sizingMode, undefined); assert.equal(request.sizingValue, undefined);
  request = definitionRequest({ ...draft, sizingMode: "expectedPopulation", sizingValue: 0 });
  assert.equal(request.expectedPopulation, 0); assert.equal(request.blockSize, undefined);
  request = definitionRequest({ ...draft, sizingMode: "native", blockSize: 16, expectedPopulation: 1000 });
  assert.equal(request.blockSize, undefined); assert.equal(request.expectedPopulation, undefined);
  assert.equal(collectionPresentation(draft).tuning, true);
});
test("switching to a class or schema never emits hidden collection storage and mapping choices", () => {
  for (const type of ["class", "schema"]) {
    const request = definitionRequest({ type, name: "Example", mapFile: "alternate", collectionFamily: "objectSet", sizingMode: "blockSize", sizingValue: 16, loadFactor: 66, keys: [{ name: "name" }], membership: "Pets::Fish" });
    assert.equal(request.mapFile, undefined); assert.equal(request.blockSize, undefined); assert.equal(request.loadFactor, undefined); assert.equal(request.keys, undefined); assert.equal(request.membership, undefined);
  }
});
test("request preserves schema-qualified identities and all supported dictionary choices", () => {
  const draft = { type: "collection", schema: "Tests", name: "FishByName", membership: "Fish", membershipSchema: "App", kind: "member", lifetime: "persistent", superclass: "MemberKeyDictionary", duplicatesAllowed: true, loadFactor: 60, keys: [{ name: "owner.name", descending: true, caseInsensitive: true, locale: 2057 }] };
  assert.deepEqual(definitionRequest(draft), draft);
  assert.match(describeDraft(draft), /persistent dictionary of Fish/);
  assert.match(describeDraft(draft), /owner.name descending/);
  assert.match(describeDraft(draft), /duplicate keys allowed/);
});
