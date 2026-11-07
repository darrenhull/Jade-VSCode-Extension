"use strict";
// Authoring modes map only to independently proved native source forms.
function normalizeKeyComparison(key, effectiveType, keyIndex) {
  if (key.comparison === undefined || key.comparison === "native") return key;
  function reject(message, metadataStatus = "known") {
    throw Object.assign(Error(message), { field: "keys", keyIndex, keyName: key.name, attribute: "comparison", code: "JADE_COMPARISON_UNAVAILABLE", metadataStatus });
  }
  if (key.comparison !== "binary") reject(key.comparison === "latin1" ? "Latin1 comparison is unavailable: its native source form has not been verified." : "Choose a supported key comparison mode.");
  if (effectiveType !== "String") reject("Binary comparison requires resolved String key metadata; " + (effectiveType ? effectiveType + " is unsupported." : "the key type is unknown."), effectiveType ? "known" : "nativeRequired");
  const normalized = { ...key, caseInsensitive: false };
  delete normalized.locale;
  return normalized;
}
module.exports = { normalizeKeyComparison };
