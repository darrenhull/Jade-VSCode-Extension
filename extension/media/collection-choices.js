(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JadeCollectionChoices = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function choices(records, query, limit = 100) {
    const name = String(query || "").toLowerCase(),
      exact = [],
      prefix = [],
      other = [];
    for (const record of records) {
      const value = record.name.toLowerCase();
      if (value === name) exact.push(record);
      else if (value.startsWith(name) && prefix.length < limit)
        prefix.push(record);
      else if (value.includes(name) && other.length < limit) other.push(record);
    }
    return [...exact, ...prefix, ...other].slice(0, limit);
  }
  return { choices };
});
