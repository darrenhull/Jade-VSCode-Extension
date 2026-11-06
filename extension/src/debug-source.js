"use strict";
const { parseSource } = require("./source_symbols");
const { lexSource, parseParameters, signature } = require("./source-lex");
function sourceVariables(source) {
  const code = lexSource(source).code;
  return [
    ...new Set(
      [
        ...(signature(code)?.parameters || []),
        ...parseParameters(
          code.match(/\bvars\b([\s\S]*?)\bbegin\b/)?.[1] || "",
        ),
      ].map((value) => value.name),
    ),
  ];
}
function debugMethods(text, file, launchableOnly = true) {
  const model = parseSource(text, file),
    result = [];
  for (const cls of model.classes)
    for (const member of cls.members) {
      if (
        member.kind !== "method" ||
        member.bodyStart === undefined ||
        (launchableOnly &&
          (/\babstract\b/i.test(
            model.code.slice(cls.start, model.code.indexOf(";", cls.start)),
          ) ||
            member.parameters?.length ||
            member.typeMethod ||
            /\b(?:abstract|external)\b/i.test(member.flags || "")))
      )
        continue;
      const start =
          member.bodyStart +
          (text.slice(member.bodyStart).match(/^\s*/)?.[0].length || 0),
        body = text.slice(start, member.end - 1).trimEnd();
      result.push({
        ...member,
        unitTest: /\bunitTest\b/i.test(member.flags || ""),
        schema: model.schema,
        owner: cls.name,
        file,
        start,
        line: 1 + text.slice(0, start).split("\n").length - 1,
        body,
        variables: [
          ...new Set([
            ...(member.parameters || []).map((parameter) => parameter.name),
            ...parseParameters(
              lexSource(body).code.match(/\bvars\b([\s\S]*?)\bbegin\b/)?.[1] ||
                "",
            ).map((variable) => variable.name),
          ]),
        ],
      });
    }
  return result;
}
function leadingLines(source) {
  return (source.match(/^\s*/)?.[0].match(/\n/g) || []).length;
}
function nativeLocation(method, nativeSource, position) {
  const prefix = nativeSource.slice(0, Math.max(0, position));
  return {
    line: Math.max(
      1,
      method.line +
        (prefix.match(/\n/g) || []).length -
        leadingLines(nativeSource),
    ),
    column: prefix.length - prefix.lastIndexOf("\n"),
  };
}
function breakpointPosition(method, nativeSource, line) {
  const relative = line - method.line + leadingLines(nativeSource);
  if (relative < 0) return undefined;
  const lines = nativeSource.split("\n");
  if (relative >= lines.length) return undefined;
  return (
    lines.slice(0, relative).reduce((sum, l) => sum + l.length + 1, 0) +
    (lines[relative].match(/^\s*/)?.[0].length || 0)
  );
}
module.exports = {
  debugMethods,
  nativeLocation,
  breakpointPosition,
  sourceVariables,
};
