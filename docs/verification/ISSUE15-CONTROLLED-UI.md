# Native catalogue paging: controlled packaged UI

This checkpoint verifies presentation and client requests using **actual packaged source modules** with wrapped QA activation and a controlled modern/legacy inspection service. It does not qualify the native runtime, a real database, native ownership semantics or native-scale performance.

The package was built from source `1df3aa579ee326871f4aa09162459cb9aa0c6561`, SHA-256 `59738a67dac75936f8a2848dc9d70ebeab687498a447550ab5bccd0db0b8cbce`. All 120 shipped JavaScript modules match that source. The tracked official native pin remains 0.10.10 and its manifest/runtime hashes verify. This is a private QA artifact, not a publishable consumer bundle for the new native contract.

The six actual running screenshots are in [native-catalogue-pages](../screenshots/native-catalogue-pages/):

1. Schema directory and an empty schema; the class list requests only 100 rows.
2. First catalogue page: 100 rows of 40,001 **synthetic transport** classes, not a generated source corpus or real native benchmark.
3. Remote query reaches `LargeSchema::Class39999` beyond the first page.
4. Exact native identity lookup reveals offset 39,900 and the correct visible page caption.
5. Explicit Refresh acquires a replacement controlled snapshot; the removed row disappears and its old OID is blocked before transport dispatch.
6. Missing native capability produces the update-required error and settles loading rather than keeping a spinner.

Screen review exposed and fixed three integration defects with real RED/GREEN controls: toolbar Refresh did not reacquire the snapshot; off-page reveal published the old schema caption; failed native refresh left the catalogue loading. The final 186 affected checks pass. Earlier harness startup/module-exclusion/context-getter mistakes were QA-only failures; no proposed API was enabled. The final host completed and its owned processes/profile/extensions/stage were removed.

Read the [packet/package/cleanup receipt](../test-evidence/issue15-controlled-ui.json). All catalogue requests have limits 1..100; the initial capability probe is limit 1. No native executable, database, kernel, Source backup, load, recovery or user main profile was used.

## Remaining native gates

The schema directory currently counts each containing schema list, whereas class filtering follows each native row's schema. The containing-schema versus owner-schema invariant, inherited/subschema/import visibility and includeSystem behavior are not established by this controlled dataset. Resolve those facts through authoritative retained metadata or the separately reviewed bounded existing-Working qualification before accepting a production ownership rule. No guessed grouping or fail-whole-catalogue rewrite was made.

Snapshot invalidation covers explicit Refresh, reacquisition, connection epoch and selected-target transitions. It does **not** establish notification-driven detection of external mutations on an unchanged multiuser connection. Use explicit Refresh to recover stale native metadata; automatic external-change behavior remains unqualified.

A coherent native #90 dependency (coordinated with #17), actual native qualification, genuine official consumer pin, final portable package/current-head CI and reviews remain pending. This evidence does not make #15 Ready or close its broader acceptance criteria.

The same VSIX was used for a separate notification-settlement observation. The actual refresh command promise had resolved, while VS Code briefly retained its completed progress toast: it was last observed at794ms and absent by902ms after command completion. The final error screenshot was replaced only after the toast disappeared. This establishes a transient presentation delay in this controlled run, not a still-pending connection or a universal display-time guarantee. No product, package or tests changed for this recapture.
