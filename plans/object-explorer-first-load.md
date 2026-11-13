# Object Explorer first-load performance

Closes #81. User confirms Object Explorer classes/methods load successfully but mainly the first load is very slow.

## Evidence and scope

Read-only trace: the tree waits for its workspace index, builds paged class rows, then discovers schema resources before showing the root schema list. Schema discovery currently opens each header as a VS Code TextDocument and invokes language.ready on the first source project. That can initialise native system-type metadata even though listing schema/resource filenames needs only header text. Reads are sequential. The initial synthetic memory-only30,000-class/8-method fixture measured3.23s indexing,48.5ms row creation,66.7ms browser preparation and17.8ms first-page creation on Windows/Node24.22.1; it excludes disk, VS Code host and actual customer source sizes. It does not reproduce the14-minute customer refresh or prove the root cause there.

## Plan

1. Reproduce unnecessary header document opens/system-metadata initialisation and serial reads in provider-level tests. Cover real native-style header content and at least30,000 class metadata rows.
2. Read unopened headers through workspace filesystem I/O with bounded parallelism, preserving input order and UTF8/UTF16 BOM decoding. Prefer already-open header buffers so unsaved edits retain current behavior. Do not initialise native types simply to list schemas/resources. Preserve schema/project identity, sorting, resource paths, inherited class files and paging.
3. Measure before/after root loading separately from indexing using the same fixture. Record platform/latency controls/limitations. Run focused class-view/index/language regressions and actual private UI verification; no live database needed.
4. Keep this separate from timeout PR82. Finish this patch against main after82 merges, choosing the next extension patch version once and avoiding conflicting release metadata. Commit plan, code, meaningful tests and compact evidence together before one final push/review. No user IDE installation or database write.