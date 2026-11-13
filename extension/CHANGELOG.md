# 0.22.4 - Two-hour extraction default

- Allow Source extraction to run for two hours by default, including streaming extraction. Explicit workspace and user timeout overrides remain unchanged.
- Clarify that cancellation retains files already applied.

# 0.22.3 - Case-distinct source extraction

- Bundle released Jade CLI 0.10.3 so Extract All Sources preserves classes whose names differ only by case on Windows.
- Keep native class identities and source bodies unchanged, retain stable native index references and protect local edits and deletions.
- Report ambiguous legacy filename collisions before writing any files.

# 0.22.2 - Imported interface extraction

- Extract schemas containing imported interface references without stopping on a missing reflected schema owner.
- Preserve both imported aliases and declared class names when checking whether source removals or renames require a complete schema header.

# 0.22.1 - Source extraction diagnostics

- Inspect recent native extraction steps, the active schema context and the failing operation directly in Jade Source Pull output.

# 0.22.0 - Complete source workflow

- Extract and refresh complete current schema source, including native interfaces and schema resources.
- Review and publish complete workspaces after Working validation, using the same frozen source bundle for the target load.
- Stop publication if files are added, removed, changed or left unsaved while you review; keep inherited reference files out of misleading class-change lists.
- Distinguish source snapshots, native writing, content hashing/comparison and guarded file updates in progress reporting.

# 0.21.0 - Native full source extraction

- Extract complete current schema sources into a new empty project without selecting a class first.
- Stream native schema headers, sections, classes and Form definitions through individual editor protection checks.
- Show inventory progress and honest partial results while coalescing editor refreshes.

# 0.20.0 - Pull a selected class from Source

- Pull the current native class/interface source directly from a saved CLS file or Object Explorer without exporting every class.
- Retain local changes, unchanged timestamps and unsaved class-view edits, with clear conflict guidance.
- Show native extraction stages and partial/uncertain results, while refreshing editor indexes once after the operation.

# 0.19.3 - Clear source-pull progress

- Show discovery, actual file hashing, organization, comparison, source updates and editor refresh separately from native extraction.
- Record elapsed stage durations in Jade Extract output and stop native file-count scans after the extractor exits.

# 0.19.2 — Configurable extraction timeout

- Allow large-schema extraction to run for up to one hour by default, configurable with `jadeNative.extractionTimeoutSeconds`.
- Distinguish extraction timeouts from cancellation and preserve cancellation handling.

# 0.19.1 — First-run connection setup

- Offer Open Folder when connecting from an empty VS Code window.
- Guide unconfigured folders into Detect Runtime Settings and identify workspace folders clearly.

# 0.19.0 — Native runtime character sets

- Choose automatic detection, ANSI or Unicode for each workspace without adding default settings to source projects.
- Preserve native project preferences and report explicit runtime character-set mismatches clearly.

# 0.18.3 — Reliable preparation and readable native errors

- Reuse a verified completed backup after a failed restore or cancellation, avoiding another Source backup.
- Recover interrupted private Working preparation safely and show the read/write paths and reused snapshot time.
- Keep native error text readable and reject incompatible ANSI runtimes clearly before opening a database. ANSI runtime support is a separate upcoming update.

# 0.18.2 — Visible database connection progress

- Show backup, restore and connection progress while opening Database Objects.
- Share repeated Connect clicks and keep cancellation pending until the current native step finishes safely.

# 0.18.0 — Shared native connections

- Open Working automatically and keep its native connection available across Object Explorer, compilation and tests.
- Switch to Scratch Pad or debugging without manually disconnecting inspection; native handoff preserves output and debugger ownership.
- Disconnect the selected database while keeping the other target available, with clear protection for other active clients.
- Discard stale inspection handles after native reconnection and reopen inspection when you refresh.

# 0.17.9 — Native lifecycle guidance

- Guide Copilot to create objects before invoking methods, using native constructors and explicit lifetimes.
- Explain updating setters, object parameter usage and persistent transactions with native-verified examples.

# 0.17.8 — Automatic structural loading

- Compile supported property and class-structure changes in Working without manually disconnecting or resetting the database.
- Let native Jade perform required reorganisation and reconnect Working after a successful structural load.
- Keep the retained fast path for method-body-only edits, with original native errors preserved on failed loads.

# 0.17.7 — Copilot edits for Scratch Pad

- Edit any line in an existing code cell without appending duplicate bodies, including when only a word was selected.
- Edit Markdown and Mermaid source through VS Code's native notebook editor, with an explicit workspace-only setup action.
- Fix native cell errors with complete cell and diagnostic context attached to a short request.
- Supply expanded Jade syntax guidance, covering the official primitive inventory, descriptors, conversions and language syntax references.

# 0.17.2 — Class and object workspaces

- Open a class from search or Object Explorer to browse grouped members, filter inherited members and focus on one method or declaration.
- Edit local methods, properties and references in the class workspace with the original source document's save and undo history, completion and compiler diagnostics.
- Save the current file with a visible Save action and unsaved/saving/saved feedback.
- Review a local multi-class file split into separate class files, preserving supported native metadata and Undo without overwriting existing files.
- Keep editing scoped to the current file and recover rejected method edits after reopening the workspace.
- Browse instances through an explicit Source or Working choice, retaining class and project identity.
- Filter the current instance page with the same autocomplete and grid controls as class search.
- Navigate read-only object and collection snapshots with retained history, page state and clear disconnected status.
- See complete Scratch Pad compiler diagnostics and automatically hand over idle inspection connections before execution.
- Install Jade language, Mermaid and draw.io project skills with tested language examples, diagram guidance and official references, preserving project customisations.
- Switch Scratch Pad notes between Markdown source and a labelled preview action, and insert Mermaid diagrams using VS Code's renderer.
- Edit an existing Scratch Pad cell with Copilot, or prepare a fix request with the whole cell, current native error and Jade guidance.

# 0.16.0 — Collection families and native rules

- Create ordered object arrays and unique object sets alongside keyed dictionaries.
- Review inherited keys, known property attributes and class/subclass lifetime permissions, with unknown metadata clearly identified.
- Check proven aggregate String key limits and inherited-key compatibility before saving; select native Binary comparison where supported.
- Choose expected population or entries per block, with verified source bounds and clear native runtime sizing guidance.
- Select an existing database file and review both the new class and its schema mapping before saving. Dirty files and stale reviews block the write.

# 0.15.0 — Create schemas, classes and collections

- Create a schema, ordinary class or keyed dictionary from one designer under Jade Tools.
- Search schema-qualified superclasses and member classes, choose ordered dictionary keys and adjust supported advanced settings.
- Choose imported collection members by package alias and exporting schema, with key choices limited to exported properties.
- Review a plain-language definition and the exact native source before explicitly saving new files.
- Keep compilation and publication as separate actions; existing schema and collection commands remain available.

# 0.14.3 — Native object IDs

- See Jade's own object identifiers when browsing database objects, references and collections.
- Copy an ID from Jade and use it to inspect the same object in VS Code.

# 0.14.2 — Build changed workspace files with F5

- Press F5 from a Jade source file to build new and changed files across its workspace, including classes you have not opened.
- Save native source buffers before building and skip loading when nothing changed.
- Keep **Jade: Compile Current File** for a focused check. Publishing remains a separate action.

# 0.14.0 — Scratch Pad

- Try Jade code from Scratch Pad under Tools without publishing a class.
- Choose a schema, run saved or unsaved code, and see output and errors beside the code.
- Add notes and separate experiments; each run has its own local variables.
- Compare the code and output from your two most recent runs.
- Use Jade code completion while writing an experiment.

# 0.13.3 — Jade Tools and complete CLS indentation

- Format class and property declarations, collection keys, database mappings, package sections and method source structure using your editor's tabs/spaces settings.
- Format complete method bodies, including switch cases, multiline conditions and read-transaction blocks. Preserve literal text, Jade tokens and native metadata values.
- Correct selected declaration lines without changing neighboring lines, and keep Format Document idempotent and undoable.
- Present the extension as Jade Tools, with concise setup steps, supported features and commands in its Details page.

# 0.13.2 — Extension update maintenance

- Improve reliability checks when packaging and updating the extension.

# 0.13.0 — Jade method formatting and inline diagnostics companion

- Add Format Document and Format Selection for complete Jade method bodies, using editor tabs/spaces while preserving native declarations, metadata and literal contents.
- Keep unsupported or incomplete control structures unchanged; selection edits stay inside complete selected lines.
- Include Error Lens as an install-alongside companion that users can disable independently of Jade.
- Document GitHub VSIX installation and manual updates.
- Verify formatting through native before/after compilation/tests and the actual VS Code document/range/undo workflow.

# 0.12.1 — Independent release updates

- Bundle the official native CLI 0.3.0.
- Own the extension's release and update automation locally; check official CLI releases every five minutes and open reviewed dependency updates.
- Skip unchanged ZIP downloads after verifying the local runtime; repair corrupt payloads and patch-bump the consumer only for a new dependency.

# 0.12.0 — Native C++ CLI

- Replace the JavaScript CLI backend with the standalone native C++ CLI and helpers, without a separate end-user Node.js installation.
- Preserve the existing editor, testing, inspection, publishing and debugger workflows through thin native CLI adapters.

# 0.11.1 — CI and release automation candidate

- Build, test and package the VSIX in GitHub Actions; publish matching version tags only after the commit reaches the approved default branch.
- Reuse shared CLI workflows for verified dependency update pull requests and release ancestry checks.
- Pin CLI 0.1.1, including shared portable packaging and release validation support.
- Include editable draw.io and exported SVG architecture diagrams.

# 0.11.0 — Packaged Jade CLI

- Separate the VS Code product into an independent Git workspace with standalone build and packaging tools.
- Route native operations through the versioned Jade CLI backend while preserving the editor UI and native Jade semantics.
- Bundle the portable `jade-cli.exe`, shared SDK and native helpers; end users need no separate Node installation.
- Pin the CLI release archive in the extension repository for independent builds.
- Verify clean-checkout packaging, native compilation/tests, warm-session reuse, failure recovery, inspection and debugging through the CLI.

# 0.10.1

- Rename Workspace Classes to Object Explorer, with Database Objects kept distinct.
- Replace per-member virtual files/splits with one focused tab per schema/class; member selections reuse that class tab and preserve other tabs.
- Add persistent searchable class catalogue tabs with schema filtering, autocomplete and 100-row pages; source/database trees also page classes.
- Verify actual native 30k metadata acquisition and lazy database instance loading.
- Fix test-class switching by tracking successfully loaded source inputs, without caching test results; shared edits and failed loads remain validated.
- Verify A/B alternation and source-inventory persistence across worker restarts in the actual VS Code GUI.

# 0.10.0

- Keep one native working runtime for compilation and normal test runs, using JadeSchemaLoader and native XML test reporting.
- Reuse safe full/scoped method-body baselines and avoid duplicate dependency source reads. Preserve invalidation and error recovery.
- Add native MultiUser online quiesced seeding while source clients stay connected; retain SingleUser behaviour.
- Fix member clicks to open focused previews, with original CLS navigation available separately.
- Clarify collection fields and add bounded class/property autocomplete with keyboard support, inherited choices and stale-response protection.
- Retain native failure details, compiler locations, cancellation and process handoff controls.
- Document GUI timings, remaining limits and full feature planning catalogues.

# 0.9.0

- Add Workspace Classes, grouped Outline and live focused member previews.
- Add native VS Code call hierarchy, references and implementations with schema-aware workspace resolution, including closed files and unsaved edits.
- Add read-only Object Explorer with Working/Source selection, paged objects and keyed collections, source jumps, history, pinning and copy controls. Enforce native multiuser/production development security and credential checks.
- Extend the native debugger with caller locations, selected-frame locals, recursive object expansion, native collection entries, running pause, native test lifecycle and guarded private working-data writes.
- Add the Testing Debug profile, tracking actual native completion and teardown failures.
- Add non-GUI application launch configuration and native startup/finalizer support.
- Improve the collection designer with searchable controls, reference key paths, compatible dictionary subclasses, tuning, per-key locales and native source copy.
- Use native partial loads for method-body-only changes after a successful full build; retain full native dependency handling for structural changes.
- Move pull preparation off the extension UI thread, add observable progress and cancellation, and verify a 30,000-class native build/extraction control.
- Preserve experimental debugger ABI pinning and document remaining watch, exception, attach and designer limits.

# 0.8.0

- Harden the native debugger protocol, cancellation, owned threads, source-variable parsing and session cleanup; preserve 0.7.1 source in archives.
- Add a themed keyed collection designer with schema-aware membership, inherited properties, ordered member/external keys, native CLS preview and exclusive file creation.
- Verify native ordering, duplicates and lookups, debugger execution and cancellation, and actual VS Code debugger/designer hosts.
- Document the remaining debugger preview limits and the native finalization workaround after abort.

# 0.7.1

- Register Jade gutter breakpoint support so clicking beside line numbers and F9 can add breakpoints.
- Verify the editor breakpoint toggle in the real VS Code debugger smoke check.

# 0.7.0

- Experimental VS Code debugger backed by a separate native C++ helper; no Jade IDE or Python.
- Direct parameterless method launch, native breakpoints, stepping, locals and source locations.
- Launch configuration, command and Debug Method CodeLens; F5 compilation retained.
- Native debugger ABI checks pinned to the verified DLL build.

# 0.6.0

- Native project assembly through JadeJoinSchema; SCM/SEC/CLS/DDX synchronization.
- Create Schema scaffold, sibling schema headers, full reviewed workspace publication.
- Native deletion and data-preserving JCF class rename workflows.
- Automatic complete test builds for dynamic type lookup and package contracts.
- Actual database extraction versus Test Explorer verification.
- Private pull baselines, short native staging paths and native-format validation.
- Removed dormant Python/debug launchers from this implementation.

# 0.4.0

- Share one owned native DskParam value wrapper across arguments, properties,
  collection entries and dictionary keys; use native copying and comparison.
- Fix caller updates from io/output parameters and remove Integer-only direct calls.
- Verify Unicode SDK ABI and preserve complete Unicode cache constants.
- Keep compile/tests database-free; document headless versus offline operation.
- Add an architecture diagram showing native delegation and remaining custom services.

# 0.3.0

- Resolve cached primitive methods, including inline String.asDate.
- Execute source constructors/destructors and inherited parameterized constructors.
- Preserve Date, Decimal, Binary, UTF-8 and other primitive property values.
- Add Array/Set operations, iteration and external-key dictionary lookup.
- Compile class constant expressions and cache native system constants and keys.
- Handle expectedException, local/global handlers, continuation, resume and epilog cleanup.
- Refresh RootSchema metadata directly in C++, then disconnect for compile/tests.
- Report incomplete checks accurately, including method counts.

Verified against the installed Jade 25.0.02 DLL build. See README for runtime limits.

