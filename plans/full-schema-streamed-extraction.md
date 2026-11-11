# Stream complete Source extraction into an empty project

Issue #63. This change extends the existing Extract All Sources command; it does not require a current class file. It builds on PR #62's typed service, per-file permissions and bulk index lease. Work is isolated on codex/agent/native-full-extract-extension and rebased directly onto main after prerequisite PR #62 merged. Draft PR #64 links issue #63.

## Native contract and capability gate

Use the agreed public source.extract DTO: scope all with no schemas or selection, or scope schemas with a nonempty schema-name array. version current and promotion client are explicit. Native Jade/CLI inventory and serialize all supported schema resources and choose their paths. The extension must not create a catalogue/source plan, parse native source to invent missing definitions, or route full scope through a selected-class fallback.

The verified packaged CLI must advertise sourceExtraction protocol 1, fullSchema true, scopes including all/schemas and versions current, with available true, layout schema-ddx and connection-bound promotion permits. CLI 0.7.0 is selected-class-only and cannot pass this gate. The native full-schema release is planned as 0.8.0. Do not activate, publish or install an unsupported bundle.

Existing source.started/stage/permit/file/result events carry exact scope. Native inventory provides totals; before inventory show elapsed work, not fabricated percentages or zero-file completion. Per-file metadata artifact supplies schema, optional name, kind class/interface/schema and component source/section/application/package/schema-resources. Supported outputs currently .scm/.sec/.cls/.ddx under schemas/<schema>/... plus schemas/<schema>.scm. Validate bounded safe paths and metadata. Never transport source bodies or a complete 30k file catalogue.

source.started.authoritative is always false. A full final result is authoritative only for passed code-zero completed current-version inventory with no veto/conflict/cancel. This means emitted inventory completeness, never permission to delete missing workspace files. A genuinely empty user inventory can finish successfully with zero files; it does not delete anything.

## UI, safety and scaling

Resolve the selected open project and existing configured destination without reading a CLS. Reuse live dirty-document and unsubmitted class-view draft protection at every native permit; keep it active during the disk-index lease. Check artifact identity for virtual class-view drafts. Refuse overlapping/foreign/stale permits and cancel on affected live edits. Native comparison preserves local bytes, unchanged timestamps and conflicts; no current disk hash becomes a baseline.

Promote one completed candidate at a time. Cancellation/failure can retain a successful prefix; unconfirmed outcomes are explicitly uncertain. Wait for native closure, then release the bulk disk lease and coalesce source/test/class refresh. No per-file UI rebuilding, directory rescans, output bodies, global watcher settings or full prepared staging tree.

## Tests and release sequence

Write failing tests for the actual Extract All command in an empty folder, full-capability rejection before changes, typed all/schema requests, native resource events, artifact/dirty veto, partial/cancel/connection loss and valid empty inventory. Preserve selected-class regressions. Use synthetic 30k metadata to prove bounded UI/refresh work without calling it a native benchmark.

When the complete native candidate is available, invoke the registered command with the actual packaged executable in an isolated Code host against an exclusively owned disposable database. Verify schema headers/sections/classes and Form DDX, repeated unchanged mtimes, local/unsaved edit protection and partial failures. Capture the running changed UI. Then consume the verified official full-schema CLI release, exact receipt/hashes, run all relevant tests and actual VSIX checks. No user Source changes, user installation or protected merge as part of implementation.

## Checkpoint implementation

The actual Extract All command delegates to the full native route with scope all and no CLS selection. Before any extraction folder is created, doctor must advertise fullSchema true/available true/current/all/permit support; the current official 0.7 bundle therefore refuses safely. Native artifact paths and schema identity are validated, and only the agreed SCM/SEC/CLS/DDX resource layout is allowed. A successful empty native inventory remains zero files without deleting anything.

Failing-first tests now cover empty-folder command routing, class-only capability refusal, dirty schema header veto, all/schema transport and foreign-schema rejection. Synthetic 30k outcome tests coalesce notifications/logs and refresh once; a missing native outcome requests one terminal rescan. The registered class-view provider/recovery seam exposes synchronous project/schema/type pending metadata without copying draft source, including a backing filename different from the native output. Acknowledgement cannot clear a newer in-flight draft. Native full-scope qualification, actual native empty-folder Code host and official0.8 package gates remain outstanding; these fake-contract tests are not native extraction proof.

Preparation now has one continuous cancellable notification from native capability checks through source indexing and extraction. A local controller guard refuses repeated clicks while preparation is waiting; cancelling before native startup creates no Source files and releases that guard. The existing selected command remains supported. Targeted registered-command tests prove these behaviors, and the pre-checkpoint full default suite passed 1105 tests with 44 explicit opt-in skips plus 18 PowerShell tests.

The opt-in full native Code-host harness is prepared, but has not been run against a full-capability native candidate yet. It requires a native golden path/hash inventory, checks initial zero-source extraction and exact output hashes/unchanged mtimes, then uses a second empty project with a real path-associated untitled header for a native per-file veto. The editor guard now indexes all live documents sharing a target, so a clean saved tab cannot hide a dirty associated document. Failing-first targeted guard tests pass.

## Qualified aggregate resource layout

Full scope retains the native complete schema DDX at `schemas/<Schema>/schemaResources.ddx`, one per schema, with artifact kind schema/component schema-resources. It emits no individual Form DDX. The full capability gate requires `layout: "schema-ddx"`; malformed/individual full resource events are refused. Existing individual DDX requires a reviewed migration before any full promotion; no migration/deletion is automatic. A selected Form pull into an aggregate schema is refused before any promotion and offers **Refresh Schema Source**, which waits for current cleanup and explicitly requests only that schema. Native diagnostic markers are preserved under report.reason/schema/path. Whole-schema aggregate resource publication is unsupported until a reviewed resource plan; it must never be silently attached to a single-class publish. Backend large-DDX build support and actual new-layout golden qualification remain release gates.

Language indexing now shares the existing CLS/Jade/schemaDefinitions.sec predicate: full DDX and other schema resources are not reread/parsed as Jade. Uncertain native outcomes discover only destination language inputs once, preserving nested-snapshot exclusion and leaving unrelated project bodies alone. The index lease releases even if scheduling fails. Post-native editor refresh has a separate progress label and elapsed timing instead of retaining a native stage. Native golden verification hashes large aggregate files as streams.

Actual public capability doctor proof passed on the current official 0.7.0 service with an owned empty project, a stale missing program in jade.json and a deliberately empty fake database path: protocol metadata was returned without creating database files or requiring a CLS. Its private broker/proxy and owned fixture were cleaned. This check will be repeated against the exact full release; it does not qualify full extraction.

### Native local primitive overrides

Full native inventory can emit `kind: primitive`, `component: source` with an exact schema/name identity. These files contain local primitive definitions and methods without class type headers. The frontend accepts that native identity and protects class-view pending/recovered drafts by project/schema/type, including when the backing filename differs. Selected-class requests remain limited to classes/interfaces. A missing class header alone does not prove a primitive.

Read-only audit of the immutable ANSI CURRENT control found Boolean, Date, Integer, Integer64, Real, String and Time recognized by the existing editor parser as partial local overrides (1, 3, 12, 3, 2, 59 and 3 members respectively). No database was opened by this audit. Targeted metadata and recovery regressions failed before native primitive kind/identity support and pass afterward, including a registered class-view pending draft test; final aggregate-native full-host/package qualification remains outstanding.

Validation checkpoint: database-free default suite 1128 passed, 45 explicit opt-in skips, zero failures, plus 18 PowerShell tests passed. The additional primitive service-event round-trip passed separately (5 adapter tests). Full native UI, official CLI 0.8 package and aggregate golden verification remain outstanding.

Final host preparation: the full native host harness has a bounded 240-second test-only deadline for three real ALL operations (initial add, unchanged repeat, dirty-target refusal). Native qualification measured roughly 30 seconds for one 306-file pull, so the prior selected-class 120-second harness deadline was too tight for three runs plus cold Code startup. Selected tests retain 120 seconds; production extraction deadlines are unchanged. Root reports clean all-scope native Working build/rebuild passes; final exact candidate frontend host/package verification still follows the explicit native fixture handoff.
