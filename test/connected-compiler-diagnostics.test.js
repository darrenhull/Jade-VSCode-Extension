const test = require("node:test"),
  assert = require("node:assert/strict");
const { compilerDiagnostics } = require("../extension/src/native-reports");
test("connected native loader timestamps preserve original method locations and structural failures without native line numbers", () => {
  const source =
    "schemaDefinition\nExample subschemaOf RootSchema partialDefinition;\ntypeHeaders\nChecks subclassOf Object transient;\ntypeDefinitions\nChecks completeDefinition\n(\n)\ntypeSources\nChecks (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\n return self.missing;\nend;\n}\n)";
  const body = compilerDiagnostics(
    "2026/11/06 07:29:13: Compile error 6027 (Unknown identifier) in file C:\\stage\\one.cls in Example::Checks::check at line 4:\n2026/11/06 07:29:13: return self.missing;",
    "Checks.cls",
    source,
    "C:\\stage\\one.cls",
  );
  assert.equal(body[0].line, 16);
  const structural =
    "2026/11/06 07:29:13: Loading schema file C:\\stage\\one.cls ...\n2026/11/06 07:29:13: Aborting changes ...\n2026/11/06 07:29:13: Compile Error 6022 - Unknown class\n";
  assert.equal(
    compilerDiagnostics(structural, "Checks.cls", source, "C:\\stage\\two.cls")
      .length,
    0,
  );
  const errors = compilerDiagnostics(
    structural,
    "Checks.cls",
    source,
    "C:\\stage\\one.cls",
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].compiler_error, 6022);
  assert.equal(errors[0].line, 1);
});
