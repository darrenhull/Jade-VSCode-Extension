# Stream complete Source extraction into an empty project

Issue #63. This change extends the existing Extract All Sources command; it does not require a current class file. It builds on PR #62's typed service, per-file permissions and bulk index lease. Keep the work isolated on codex/agent/native-full-extract-extension; rebase the feature commits onto main after the prerequisite lands, retaining independent review and a real issue link.

## Native contract and capability gate

Use the agreed public source.extract DTO: scope all with no schemas or selection, or scope schemas with a nonempty schema-name array. version current and promotion client are explicit. Native Jade/CLI inventory and serialize all supported schema resources and choose their paths. The extension must not create a catalogue/source plan, parse native source to invent missing definitions, or route full scope through a selected-class fallback.

The verified packaged CLI must advertise sourceExtraction protocol 1, fullSchema true, scopes including all/schemas and versions current, with available true and connection-bound promotion permits. CLI 0.7.0 is selected-class-only and cannot pass this gate. The native full-schema release is planned as 0.8.0. Do not activate, publish or install an unsupported bundle.

Existing source.started/stage/permit/file/result events carry exact scope. Native inventory provides totals; before inventory show elapsed work, not fabricated percentages or zero-file completion. Per-file metadata artifact supplies schema, optional name, kind class/interface/schema and component source/forms/section/application/package. Supported outputs currently .scm/.sec/.cls/.ddx under schemas/<schema>/... plus schemas/<schema>.scm. Validate bounded safe paths and metadata. Never transport source bodies or a complete 30k file catalogue.

source.started.authoritative is always false. A full final result is authoritative only for passed code-zero completed current-version inventory with no veto/conflict/cancel. This means emitted inventory completeness, never permission to delete missing workspace files. A genuinely empty user inventory can finish successfully with zero files; it does not delete anything.

## UI, safety and scaling

Resolve the selected open project and existing configured destination without reading a CLS. Reuse live dirty-document and unsubmitted class-view draft protection at every native permit; keep it active during the disk-index lease. Check artifact identity for virtual class-view drafts. Refuse overlapping/foreign/stale permits and cancel on affected live edits. Native comparison preserves local bytes, unchanged timestamps and conflicts; no current disk hash becomes a baseline.

Promote one completed candidate at a time. Cancellation/failure can retain a successful prefix; unconfirmed outcomes are explicitly uncertain. Wait for native closure, then release the bulk disk lease and coalesce source/test/class refresh. No per-file UI rebuilding, directory rescans, output bodies, global watcher settings or full prepared staging tree.

## Tests and release sequence

Write failing tests for the actual Extract All command in an empty folder, full-capability rejection before changes, typed all/schema requests, native resource events, artifact/dirty veto, partial/cancel/connection loss and valid empty inventory. Preserve selected-class regressions. Use synthetic 30k metadata to prove bounded UI/refresh work without calling it a native benchmark.

When the complete native candidate is available, invoke the registered command with the actual packaged executable in an isolated Code host against an exclusively owned disposable database. Verify schema headers/sections/classes and Form DDX, repeated unchanged mtimes, local/unsaved edit protection and partial failures. Capture the running changed UI. Then consume the verified official full-schema CLI release, exact receipt/hashes, run all relevant tests and actual VSIX checks. No user Source changes, user installation or protected merge as part of implementation.
