# Definition navigation for method calls and typed receivers

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/92

## Reproduction and boundary

The real registered definition provider is exercised with synthetic native-format CLS documents, not customer source. Ordinary unqualified own/inherited workspace method calls, explicit self calls, and typed workspace property receivers already pass on main. A representative subschema Object copy and the Class Workspace original-document offset bridge also resolve correctly. These passing controls are not claimed as newly fixed bugs.

Two confirmed gaps remain in the existing path:

- Local/parameter receiver symbols resolve semantically but have no source model/name selection, so Ctrl+click on a receiver cannot open its declaration.
- Cached RootSchema members such as JadeLog.fileName and JadeLog.log resolve semantically but have no source document. The provider previously discarded them. The cache contains declaration metadata, not native method bodies.

## Minimal implementation

- Let the existing parameter parser optionally report exact declaration name offsets. Existing callers retain the same output shape.
- Attach original document model/name offsets only to ephemeral method-context locals and parameters. Keep local shadowing, schema-qualified lookup and live unsaved models authoritative.
- Prefer existing real source locations. Only source-less verified RootSchema system symbols may use a small VS Code read-only content-provider document.
- Clearly label that document Native declaration metadata (read-only), with selected member signature and owning type. Do not fabricate JADE source, class numbers or method bodies. Unknown types remain explicitly unavailable.
- Cap metadata text at4096characters, encoded URI at16384characters and method parameters at128. Missing/ambiguous/cancelled/oversized targets fail closed.
- Reuse the existing source index and resolved member identity. No database connection, export, per-click workspace scan, sidecar registry or new type system.

## Validation

Meaningful RED sequence using the actual registered provider:

1. Initial8cases:5passing controls,3failures for local/parameter/shadowed receiver declaration navigation.
2. After the local fix:8/8pass. Added native fallback cases:2failures (JadeLog property and native method/inherited native call) with4passing precedence/ambiguity/missing/cancel/size guards.
3. Final20definition cases pass, including grouped names, unsaved replacement, shadowing, unrelated same-name schemas, actual Class Workspace service/binding bridge and representative Object subschema-copy lookup.
4. Focused language/navigation/index/source tests:54pass,0fail. This includes existing 30k event-coalescing, large-source and disposable-cache regressions. It is not a new native database performance benchmark.

Actual packaged VS Code UI proof, final integrated suite/package validation and fresh review are delivery gates owned by the packaging/review workflow. They remain pending at this implementation handoff. Proof must exercise standard read-only metadata documents and local declaration selection without opening a database. Version/pin metadata remains unchanged here while the prior0.22.8inspection patch completes independently.

## Limitations

A native declaration fallback requires a valid existing runtime-matched system cache. It does not retrieve native source or prove every customer method body can be opened. No new failure was reproduced for ordinary unqualified user-source methods; there may be a further customer-specific context absent from the supplied screenshots. The fallback preserves the native declaration/source distinction.

Focused provider test command: node --test tests/Navigation/Navigation_definition_tests.test.js

## Stacked0.22.9 integration proof

The isolated navigation changes were saved then stacked onto exact review-clear PR91 head8dc17865005dbd4b7d43a03a83d3a39e320961f6 while that PR was still open/unmerged. Its branch was not edited. Version0.22.9 metadata moves together; official CLI0.10.5 pin/payload remains unchanged. The parent merge is a delivery dependency.

Independent source review accepted the narrow parser/navigation/provider boundaries. The20real-provider cases pass after stacking; one final regular JavaScript phase passes1287 with46explicitnativeopt-inskips and zero failures. Unchanged PowerShell/C++ phases were not repeated. The actual0.22.9 VSIX passes all native hashes, exact current source/manifest/readme/changelog bytes and extracted outside-checkout discovery without Node on PATH or database connection.

A committed separate companion drives the unmodified packaged extension through actual vscode.executeDefinitionProvider and its normal content provider. A checksum-validated synthetic runtime/cache fixture follows the real disk identity path, not a product fallback or cache-get replacement. Five captured states show local declaration selection, selected JadeLog.fileName and log signatures in clearly labelled read-only metadata, ordinary own-method source and real-source precedence. All five were visually inspected. Native process calls are blocked; the synthetic library files are never loaded. Owned VS Code hosts exited and private profiles were cleaned. This is editor routing proof, not native compilation, a database benchmark or proof of native method bodies. Compact exact source/image/artifact hashes are in docs/test-evidence/definition-navigation-0.22.9.json.

Parent merge, current-head hosted checks/fresh review, required owner approval and separate0.22.9 release verification remain manager-owned gates. No user installation, customer database operation or publication occurred.
