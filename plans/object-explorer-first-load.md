# Object Explorer first-load performance

Closes #81. User confirms Object Explorer classes/methods load successfully but mainly the first load is very slow.

## Evidence and scope

Read-only trace: the tree waits for its workspace index, builds paged class rows, then discovers schema resources before showing the root schema list. Schema discovery currently opens each header as a VS Code TextDocument and invokes language.ready on the first source project. That can initialise native system-type metadata even though listing schema/resource filenames needs only header text. Reads are sequential. The initial synthetic memory-only30,000-class/8-method fixture measured3.23s indexing,48.5ms row creation,66.7ms browser preparation and17.8ms first-page creation on Windows/Node24.22.1; it excludes disk, VS Code host and actual customer source sizes. It does not reproduce the14-minute customer refresh or prove the root cause there.

## Plan

1. Reproduce unnecessary header document opens/system-metadata initialisation and serial reads in provider-level tests. Cover real native-style header content and at least30,000 class metadata rows.
2. Read unopened headers through workspace filesystem I/O with bounded parallelism, preserving input order and UTF8/UTF16 BOM decoding. Prefer already-open header buffers so unsaved edits retain current behavior. Do not initialise native types simply to list schemas/resources. Preserve schema/project identity, sorting, resource paths, inherited class files and paging.
3. Measure before/after root loading separately from indexing using the same fixture. Record platform/latency controls/limitations. Run focused class-view/index/language regressions and actual private UI verification; no live database needed.
4. Per explicit user direction, deliver this with the two-hour timeout in existing PR #82 as extension 0.22.4. Combine the existing timeout head before final verification/push, retaining one review cycle and avoiding conflicting release metadata. Commit plan, code, meaningful tests and compact evidence together. No user IDE installation or database write.
## Accepted scope update

The user explicitly requested a persistent index and chose a project `.jade` folder containing disposable plugin files. Add a source metadata cache under `.jade/source-index`, with an internal Git ignore file; loss/corruption/version mismatch must cause rebuilding, not source changes. Cache rows support quick browsing while saved files are checked in the background. File size/mtime is a UI-cache reuse hint; native build/publish still read authoritative saved source. Live dirty buffers must override cached rows and must never be persisted as saved source.

The SourceIndex currently keeps metadata only in memory. `isNestedSnapshot` also repeats synchronous `.jade-extraction` existence checks for every ancestor of every file. Scope marker memoisation to a single directory-discovery pass so later passes still see created/removed markers. Include this cold-load reduction along with avoiding schema document opens/native type-cache warmup. Show explicit indexing/validation status instead of an unexplained loading wait.
## Verified final behavior

- The disposable `.jade/source-index` cache has32 bounded shards, internal Git ignore files, parser-content fingerprint invalidation and guarded ordinary paths. Missing/corrupt caches rebuild. Size/mtime reuse is a browsing hint; manual Refresh forces source reads and native operations do not trust this metadata.
- Adds/deletes/moves update incrementally. Disk deletion does not discard a live dirty buffer. Dirty editor models are not stored as saved source. Background validation removes files absent after restart.
-19 focused tests cover caching, deletion/move, corruption, linked paths, Git exclusion, bulk leases, snapshot changes, header decoding, dirty headers and paging. Three timeout REDs plus snapshot/header/event REDs were verified before their fixes.
- Final integrated suite1180 passed/45 connected skips plus18PowerShell contracts. Packaged VSIX/native integrity/no-Node smoke and release metadata pass. The exact combined VSIX was exercised in new private VS Code profiles, including Settings7200 and30,000-class Object Explorer cold/warm UI,100-row paging and zero native system-type loads.
- Real Windows filesystem benchmark:30,000 generated files/8methods each, baseline repeat rebuild10.07s/30,000 reads, initial new index10.61s, cache save0.65s; cached browsing1.11s, remaining background metadata validation3.07s, zero source rereads. Cache86.8MB. This excludes VS Code IPC, enterprise policy and customer source sizes; it is not a JADE extraction benchmark.
- Actual packaged UI: cold first tree32.57s; warm cached tree2.35s with zero source rereads. Warm validation was intentionally gated for the status screenshot, so that UI timing is not an unrestricted benchmark. Screenshots and precise receipts are checked in under docs/screenshots/object-explorer and docs/verification/object-explorer-index.json.

The database event/hash-table proposal was discussed as a question only and is not implemented here.
Reproduce the opt-in 30,000-file fixture with `node --expose-gc tests/SourceIndexCache/SourceIndexCache_benchmark.cjs --execute`. Set JADE_INDEX_BASELINE_MODULE to a previous checkout module for an actual previous-version baseline; otherwise the comparison is an uncached rebuild of the current engine. The recorded receipt used released0.22.3 code as the baseline. Actual packaged UI proof: set JADE_TEST_CODE to installed Code.exe and run `node tests/SourceIndexCache/SourceIndexCache_ui_fixture.cjs --execute` after packaging. Both fixtures own and clean disposable roots.
Final startup-race regression: a watcher save/delete occurring during cache hydration must take precedence over disk cache rows. The failing test reproduced deleted metadata returning during hydration; per-path change tracking now preserves both deletes and newer saved models. All19 focused regressions and the complete1180-pass/45-skip plus18 PowerShell suite pass after this fix. The rebuilt exact VSIX passed cold/warm30k UI and7200 Settings checks again.
