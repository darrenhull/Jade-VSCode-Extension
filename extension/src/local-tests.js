'use strict';
function testLenses(source) {
  const entries = [];
  const header = /^\s*(\w+)\s+(?:subclassOf\s+\w+|completeDefinition|partialDefinition)\b/m.exec(source);
  if (!header) return entries;
  const section = /^\s*typeSources\s*$/m.exec(source);
  if (!section) return entries;
  const tail = source.slice(section.index + section[0].length);
  for (const match of tail.matchAll(/^(\w+)\s*\r?\n\{\r?\n([^{};]+);/gm)) {
    if (/\bunitTest\b/.test(match[2]) && !/\bunitTestIgnore\b/.test(match[2])) {
      entries.push({ offset: section.index + section[0].length + match.index, method: match[1] });
    }
  }
  if (entries.length) entries.unshift({ offset: header.index, method: undefined });
  return entries;
}

module.exports = { testLenses };
