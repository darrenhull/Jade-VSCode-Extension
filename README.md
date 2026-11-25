# Jade Tools

For a Git checkout containing saved JOX, **Set Up Project** uses the configured database as **Working** and reads source from disk. The root schemas/ and sources/schemas/ layouts are detected automatically; other layouts use a source-root picker. Review the local paths and confirm that initial synchronization may overwrite unexported Working changes. This route does not create another database, make a backup, extract source, or require a clean seed. Unsupported CLI packages refuse this route before database preparation. An explicitly declared workingMode: source-backed project retains the separate extraction workflow. If connection profiles are ambiguous, choose one in VS Code; the workspace remembers that choice.

Bundles [official Jade CLI 0.11.7](https://github.com/darrenhull/Jade-CLI/releases/tag/v0.11.7) with matching ANSI and Unicode JOX runtimes and read-only inspection helpers.

Requires Visual Studio Code on Windows and a compatible installed ANSI or Unicode Jade runtime for database operations. The native CLI detects its character mode and rejects an explicit mismatch. The Jade IDE is not required.

Browse JOX schemas, classes and members in Object Explorer and Class Workspace. Open a method to edit its Jade source in a normal VS Code text editor. Native source identities and revision bindings map accepted saves back to the authoritative `.jox` file; `.jade/` contains ignored, regenerable projections and private runtime state.


**Jade: Sync Workspace to Working** appears in the Command Palette only when the bundled CLI advertises qualified JOX sync. It sends the selected project's saved JOX snapshot to its existing Working database. Save any dirty raw `.jox` editors first. Sync does not run tests, write to Git, or publish to Source. The bundled ANSI runtime qualifies sync and checkout initialization. Reviewed setup sync requires native enforcement of the exact Working identity shown in the confirmation.

Saved-source preparation uses a fifteen-minute fallback. Configure `jadeNative.sourcePreparationTimeoutSeconds` per user or workspace when a different fallback is needed. An explicit native/project `timeoutMilliseconds` remains authoritative; native test execution keeps its separate timeout.

Use **Run Local Test**, **Ctrl+F5**, or the Testing view. Inputs are saved before execution. The native provider uploads saved Git changes to Working and compiles them before running the selected native tests. Unchanged runs still execute tests without uploading the same source again. Normal Git commit/push remains available through VS Code Source Control; database publication is separate.

The current qualified flow covers original method-body edits and selected native tests on matching ANSI or Unicode Jade runtimes. Unsupported or unmappable declarations remain read-only or fail explicitly. Working data is persistent: executed application code can change it and can access resources allowed by the runtime.

The bundled ANSI runtime also qualifies native Scratch execution. Standalone builds, structural editing, debugging and Source publication are not qualified by this release. Existing CLS workflows remain in the preserved Jade-cls distribution; this JOX variant does not convert a CLS project automatically.

The native runtime owns configuration, source interpretation, dependencies, compilation, tests and database ownership. No Node runtime is required by the packaged CLI. Database Objects retains its read-only Source/Working selection and native object identities.

Official CLI update checks run on a best-effort five-minute schedule; this is not a five-minute delivery guarantee. Dependency updates open as Draft pull requests for validation and review before release.

Independent tooling, not affiliated with Jade Software.
