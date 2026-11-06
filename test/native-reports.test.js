"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  compilerDiagnostics,
  nativeTestReport,
} = require("../extension/src/native-reports");
const text =
  "schemaDefinition\nExample subschemaOf RootSchema partialDefinition;\ntypeHeaders\nChecks subclassOf Object transient;\ntypeDefinitions\nChecks completeDefinition\n(\n)\ntypeSources\nChecks (\njadeMethodSources\ncheck\n{\ncheck() unitTest;\nbegin\n    return self.missing;\nend;\n}\n)";
test("native compiler method line maps back to original CLS", () => {
  const errors = compilerDiagnostics(
    "Compile error 6026 (Unknown property or method) in file C:\\stage\\0.cls in Example::Checks::check at line 4:\n    return self.missing;",
    "C:/source/Checks.cls",
    text,
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 16);
  assert.equal(errors[0].compiler_error, 6026);
  assert.equal(errors[0].source, "C:/source/Checks.cls");
});
test("test reports require complete native counts and identify failed methods", () => {
  const selection = {
    schema: "Example",
    owner: "Checks",
    source: "Checks.cls",
    text,
  };
  assert.equal(
    nativeTestReport("total tests=1 failed=0 skipped=0 succeeded=1", selection)
      .results[0].status,
    "passed",
  );
  const report = nativeTestReport(
    " : Example::Checks::check: assertEquals - expected 19 but actual= 18 @ line 1\ntotal tests=1 failed=1 skipped=0 succeeded=0",
    selection,
  );
  assert.equal(report.results[0].method, "check");
  assert.match(report.results[0].message, /expected 19/);
  assert.equal(
    nativeTestReport("total tests=1 failed=1 skipped=0 succeeded=0", selection)
      .tests_completed,
    false,
  );
  assert.equal(nativeTestReport("", selection).tests_completed, false);
  assert.equal(
    nativeTestReport("total tests=0 failed=0 skipped=0 succeeded=0", selection)
      .tests_completed,
    false,
  );
});
test("native structural load errors point to the original CLS file line", () => {
  const output =
    "Loading schema file C:\\stage\\0.cls ...\nCompile complete\nLoading schema file C:\\stage\\1.cls ...\nAborting changes ...\nCompile Error 6023 - Unknown type\nAt line 41:\n allAgents : MissingType;\n";
  assert.equal(
    compilerDiagnostics(output, "First.cls", text, "C:\\stage\\0.cls").length,
    0,
  );
  const errors = compilerDiagnostics(
    output,
    "Broken.cls",
    text,
    "C:\\stage\\1.cls",
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].compiler_error, 6023);
  assert.equal(errors[0].line, 41);
  assert.equal(errors[0].source, "Broken.cls");
});
const hookText = text
  .replace("\n)\ntypeSources", "\n)\ntypeSources")
  .replace(
    "end;\n}\n)",
    "end;\n}\nfinalise\n{\nfinalise() unitTestAfter;\nbegin\n assertTrue(false);\nend;\n}\n)",
  );
test("one selected native test is failed by its teardown hook and maps the actual hook source", () => {
  const selection = {
      schema: "Example",
      owner: "Checks",
      source: "Checks.cls",
      text: hookText,
      methods: ["check"],
    },
    log =
      " : Example::Checks::finalise: assertTrue @ line 1\n : Call Stack:\nExample::Checks::finalise(1)\n : Test run total tests=1 failed=1 skipped=0 succeeded=0";
  const result = nativeTestReport(log, selection);
  assert.equal(result.tests_completed, true);
  assert.equal(result.cleanup_complete, true);
  assert.equal(result.results[0].status, "failed");
  assert.equal(result.results[0].method, "check");
  assert.match(
    result.results[0].message,
    /Example::Checks::finalise: assertTrue/,
  );
  assert.ok(
    result.results[0].line >
      hookText.split("\n").findIndex((line) => line === "finalise"),
  );
});
test("helper assertion failures are attributed using an unambiguous selected method in that failure call stack", () => {
  const selection = {
      schema: "Example",
      owner: "Checks",
      source: "Checks.cls",
      text,
      methods: ["check", "other"],
    },
    log =
      " : Shared::BaseChecks::assertData: assertEquals - expected 20 actual 10\n : Call Stack:\nShared::BaseChecks::assertData(20)\nExample::Checks::check(1)\n : Test run total tests=2 failed=1 skipped=0 succeeded=1";
  const result = nativeTestReport(log, selection);
  assert.equal(result.tests_completed, true);
  assert.equal(
    result.results.find((row) => row.method === "check").status,
    "failed",
  );
  assert.equal(
    result.results.find((row) => row.method === "other").status,
    "passed",
  );
  assert.match(
    result.results[0].message,
    /Shared::BaseChecks::assertData: assertEquals/,
  );
  assert.equal(result.results[0].source, "Checks.cls");
});
test("an ambiguous multi-method lifecycle failure remains incomplete and includes the actual failure details", () => {
  const selection = {
      schema: "Example",
      owner: "Checks",
      source: "Checks.cls",
      text,
      methods: ["check", "other"],
    },
    log =
      " : Example::Checks::finalise: assertTrue @ line 1\n : Call Stack:\nExample::Checks::finalise(1)\n : Test run total tests=2 failed=1 skipped=0 succeeded=1";
  const result = nativeTestReport(log, selection);
  assert.equal(result.tests_completed, false);
  assert.equal(result.cleanup_complete, false);
  assert.deepEqual(result.results, []);
  assert.match(result.error, /Example::Checks::finalise: assertTrue/);
});
test("failure attribution never borrows a selected caller from a later failure block", () => {
  const selection = {
      schema: "Example",
      owner: "Checks",
      source: "Checks.cls",
      text,
      methods: ["check", "other"],
    },
    log =
      " : Shared::BaseChecks::unknownHook: first failure\n : Call Stack:\nShared::BaseChecks::unknownHook(4)\n : Example::Checks::other: second failure\n : Call Stack:\nExample::Checks::check(10)\n : Test run total tests=2 failed=1 skipped=0 succeeded=1";
  const report = nativeTestReport(log, selection);
  assert.equal(report.tests_completed, false);
  assert.deepEqual(report.results, []);
  assert.match(report.error, /Shared::BaseChecks::unknownHook: first failure/);
});
