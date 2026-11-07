"use strict";
const lifetimes = ["persistent", "transient", "sharedTransient"];
const nativeFields = {
  class: { persistent: "persistent_allowed", transient: "transient_allowed", sharedTransient: "shared_transient_allowed" },
  subclass: { persistent: "subclass_persistent_allowed", transient: "subclass_transient_allowed", sharedTransient: "subclass_shared_transient_allowed" },
};
const sourceFields = {
  class: { persistent: "persistentAllowed", transient: "transientAllowed", sharedTransient: "sharedTransientAllowed" },
  subclass: { persistent: "subclassPersistentAllowed", transient: "subclassTransientAllowed", sharedTransient: "subclassSharedTransientAllowed" },
};
function lifetimeMetadata({ sourceOptions, nativeType, resolvedFlags } = {}) {
  const flags = { class: {}, subclass: {} };
  const sourceTokens = sourceOptions === undefined ? undefined : new Set(sourceOptions.split(",").map(value => value.trim()));
  for (const scope of ["class", "subclass"]) for (const lifetime of lifetimes) {
    let value;
    if (sourceOptions !== undefined) {
      const token = sourceFields[scope][lifetime];
      if (sourceTokens.has(token)) value = { value: true, provenance: "Source class header: " + token };
    } else {
      const resolved = resolvedFlags?.[scope]?.[lifetime];
      if (typeof resolved?.value === "boolean" && typeof resolved.provenance === "string" && resolved.provenance)
        value = { value: resolved.value, provenance: resolved.provenance };
      else if (typeof nativeType?.[nativeFields[scope][lifetime]] === "boolean")
        value = { value: nativeType[nativeFields[scope][lifetime]], provenance: "Native type metadata: " + nativeFields[scope][lifetime] };
    }
    flags[scope][lifetime] = value;
  }
  return flags;
}
function checkLifetimeRequest({ flags, superclassFlags, instanceLifetime, requestedAllowFlags } = {}) {
  const diagnostics = [];
  let checks = 0, unknown = false;
  function check(flag, scope, lifetime, message) {
    checks++;
    if (typeof flag?.value !== "boolean") { unknown = true; return; }
    if (!flag.value) diagnostics.push({ field: "lifetime", attribute: scope + "." + lifetime, message, provenance: flag.provenance });
  }
  // Defaults are deliberately not used as instance restrictions. Only an
  // explicitly requested instance lifetime or permission is tested here.
  if (instanceLifetime !== undefined) {
    if (!lifetimes.includes(instanceLifetime)) diagnostics.push({ field: "lifetime", attribute: "instanceLifetime", message: "Choose persistent, transient or shared-transient lifetime." });
    else check(flags?.class?.[instanceLifetime], "class", instanceLifetime, "The resolved class flags do not permit " + instanceLifetime + " instances.");
  }
  for (const scope of ["class", "subclass"]) for (const lifetime of lifetimes)
    if (requestedAllowFlags?.[scope]?.[lifetime] === true)
      check(superclassFlags?.subclass?.[lifetime], "subclass", lifetime, "The resolved superclass flags do not permit " + lifetime + " subclass instances.");
  return { status: diagnostics.length ? "invalid" : unknown || !checks ? "nativeRequired" : "valid", diagnostics };
}
module.exports = { lifetimeMetadata, checkLifetimeRequest };
