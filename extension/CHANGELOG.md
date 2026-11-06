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
