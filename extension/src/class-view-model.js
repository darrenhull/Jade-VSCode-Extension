"use strict";
const { parseSource } = require("./source_symbols");
const { label: symbolLabel } = require("./language-model");
function classSections(text, file, parsedModel) {
  const model = parsedModel || parseSource(text, file),
    sections = [
      ...model.code.matchAll(
        /\b(constantDefinitions|attributeDefinitions|referenceDefinitions|jadeMethodDefinitions|externalKeyDefinitions|memberKeyDefinitions|typeSources)\b/g,
      ),
    ];
  const sectionAt = (offset) =>
    sections.filter((s) => s.index < offset).at(-1)?.[1];
  return model.classes.map((cls) => {
    const groups = new Map(
      [
        "Properties",
        "References",
        "Methods",
        "Type methods",
        "Constants",
        "Collection keys",
        "Inheritance",
      ].map((label) => [label, []]),
    );
    for (const member of cls.members) {
      const section = sectionAt(member.selection),
        label =
          member.kind === "method"
            ? member.typeMethod
              ? "Type methods"
              : "Methods"
            : section === "constantDefinitions"
              ? "Constants"
              : section === "referenceDefinitions"
                ? "References"
                : section === "externalKeyDefinitions"
                  ? "Collection keys"
                  : "Properties";
      groups.get(label).push({
        ...member,
        kind:
          label === "Constants"
            ? "constant"
            : label === "References"
              ? "reference"
            : label === "Collection keys"
              ? "key"
              : member.kind,
        detail: symbolLabel(member)
          .slice(member.name.length)
          .trim()
          .replace(/^:\s*/, ""),
        file,
        owner: cls.name,
        schema: model.schema,
      });
    }
    const membership = new RegExp(
      "\\b" + cls.name + "\\s+of\\s+(\\w+)\\s*;",
    ).exec(model.code)?.[1];
    for (const section of sections.filter((s) =>
      ["memberKeyDefinitions", "externalKeyDefinitions"].includes(s[1]),
    )) {
      const end =
          sections.find((s) => s.index > section.index)?.index ??
          model.code.length,
        block = model.code.slice(section.index, end);
      const definition = new RegExp(
        "\\b" +
          cls.name +
          "\\s+(?:completeDefinition|partialDefinition)\\s*\\(",
      ).exec(block);
      if (!definition) continue;
      const start = section.index + definition.index + definition[0].length,
        stop = model.code.indexOf(")", start);
      for (const match of model.code
        .slice(start, stop)
        .matchAll(/^\s*(\w+)(?:\s*:\s*(\w+)(?:\[[^\]]*\])?)?([^;]*);/gm)) {
        const selection = start + match.index + match[0].indexOf(match[1]);
        if (groups.get("Collection keys").some((m) => m.name === match[1]))
          continue;
        groups.get("Collection keys").push({
          name: match[1],
          kind: "key",
          detail: (match[2] || "member key") + match[3],
          selection,
          start: selection,
          end: start + match.index + match[0].length,
          file,
          owner: cls.name,
          schema: model.schema,
        });
      }
    }
    if (cls.parent)
      groups.get("Inheritance").push({
        name: cls.parent,
        kind: "base",
        detail: "Superclass",
        selection: cls.selection,
        start: cls.start,
        end: cls.end,
        file,
        owner: cls.name,
        schema: model.schema,
      });
    return {
      ...cls,
      selection:
        model.code.slice(cls.selection, cls.selection + cls.name.length) ===
        cls.name
          ? cls.selection
          : model.code.indexOf(cls.name, cls.start),
      file,
      schema: model.schema,
      id: (model.schema || "") + "::" + cls.name,
      membership,
      groups: [...groups]
        .map(([label, items]) => ({
          label,
          items: items.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.items.length),
    };
  });
}
function memberPreview(text, file, owner, name) {
  const cls = classSections(text, file).find((c) => c.name === owner),
    member = cls?.groups
      .flatMap((g) => g.items)
      .find((m) => m.name === name && m.kind !== "base");
  if (!member) return;
  const start = member.bodyStart ?? member.start,
    end = member.bodyStart === undefined ? member.end : member.end - 1;
  return {
    ...member,
    text: text.slice(start, end).trim(),
    title: cls.id + "::" + name,
  };
}
module.exports = { classSections, memberPreview };
