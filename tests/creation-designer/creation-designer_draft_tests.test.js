"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { moveKey, definitionRequest, describeDraft, canSave, choicePresentation, diagnosticPresentation } = require("../../extension/media/creation-designer");
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
test("request preserves schema-qualified identities and all supported dictionary choices", () => {
  const draft = { type: "collection", schema: "Tests", name: "FishByName", membership: "Fish", membershipSchema: "App", kind: "member", lifetime: "persistent", superclass: "MemberKeyDictionary", duplicatesAllowed: true, loadFactor: 60, keys: [{ name: "owner.name", descending: true, caseInsensitive: true, locale: 2057 }] };
  assert.deepEqual(definitionRequest(draft), draft);
  assert.match(describeDraft(draft), /persistent dictionary of Fish/);
  assert.match(describeDraft(draft), /owner.name descending/);
  assert.match(describeDraft(draft), /duplicate keys allowed/);
});
