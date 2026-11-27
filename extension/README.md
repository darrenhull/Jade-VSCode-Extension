# Jade Tools

For a Git checkout containing saved JOX, **Jade: Set Up Project** uses the configured database as **Working** and reads source from disk. The root schemas/ and sources/schemas/ layouts are detected automatically; other layouts use a source-root picker. Review the local paths and confirm that initial synchronization may overwrite unexported Working changes. This route does not create another database, make a backup, extract source, or require a clean seed. Unsupported CLI packages refuse this route before database preparation. An explicitly declared workingMode: source-backed project retains the separate extraction workflow. If connection profiles are ambiguous, choose one in VS Code; the workspace remembers that choice.

An optional project `jade.json` can select the schema folder:

```json
{
  "sourceFormat": "jox",
  "schemaPath": "schemas"
}
```

`schemaPath` is relative to the Git repository root and defaults to `schemas`. Nested paths such as `src/jade/schemas` are supported; the current native engine requires the final folder to remain named `schemas`. Setup preserves this file, validates that the folder stays inside the checkout and contains saved JOX, and asks the native CLI to validate local storage before synchronization. Renamed schema-folder leaves are refused rather than silently compiled from another location.

Bundles [official Jade CLI 0.11.10](https://github.com/darrenhull/Jade-CLI/releases/tag/v0.11.10) with its verified ANSI and Unicode JOX runtimes and read-only inspection helpers.

Large JOX preparation now honors its configured deadline. ANSI and UTF-8 values can coexist in a file without converting saved sources. File-local semantic projection problems are listed as warnings while other files remain available; Project Setup shows the complete warning count and opens the full local diagnostic report on request. Native JadeGit still receives the original saved source and reports its own load failures.

CLI 0.11.8 no longer advertises vendor-seed initialization for explicit `workingMode: "git-first"` projects. Migrate to the default existing-Working mode by configuring an existing local Working database, or explicitly select `workingMode: "source-backed"` to create a private copy from a separate Source database. If neither database is available, provision one with your installed Jade tools before setup.

Scratch Pad runs in the configured existing Working database in default mode. Persistent changes committed by a Scratch script remain in that database; this is not an isolated or rollback-only session. Explicit source-backed mode uses its private Working copy.

Requires Visual Studio Code on Windows and a compatible installed ANSI or Unicode Jade runtime for database operations. The Jade IDE is not required.

Browse JOX schemas, classes and members in Object Explorer and Class Workspace. Open a method to edit its Jade source in a normal VS Code text editor. Native source identities and revision bindings map accepted saves back to the authoritative `.jox` file; `.jade/` contains ignored, regenerable projections and private runtime state.

To initialize explicitly from a separate Source database, declare workingMode: source-backed in the project configuration and use the separate extraction workflow. Choose **Create Working copy and extract sources** for that explicit mode. This is not the default for a Git JOX checkout. Source remains separate and is not published by setup or local testing.

After switching branches or editing saved files, use **Jade: Sync Workspace to Working**. Native Jade compares against its accepted loaded baseline and applies the saved checkout changes. Save raw JOX files first; unsupported changes and incomplete loads remain failures rather than readiness claims.

Saved-source preparation uses a fifteen-minute fallback. Configure `jadeNative.sourcePreparationTimeoutSeconds` per user or workspace when a different fallback is needed. An explicit native/project `timeoutMilliseconds` remains authoritative; native test execution keeps its separate timeout.

Use **Run Local Test**, **Ctrl+F5**, or the Testing view. Inputs are saved before execution. The native provider uploads saved Git changes to Working and compiles them before running the selected native tests. Unchanged runs still execute tests without uploading the same source again. Normal Git commit/push remains available through VS Code Source Control; database publication is separate.

The qualified ANSI checkout flow covers saved-source initialization, synchronization and native tests; the existing Unicode method-edit and native-test flow remains available. Unsupported or unmappable declarations remain read-only or fail explicitly. Working data is persistent: executed application code can change it and can access resources allowed by the runtime.

Native Scratch execution and native debugging are qualified on matching ANSI installations. Debugging requires the packaged exact DLL/ABI profile; other character modes or builds are refused. Standalone builds, structural editing and Source publication are not qualified by this release. Existing CLS workflows remain in the preserved Jade-cls distribution; this JOX variant does not convert a CLS project automatically.

The native runtime owns configuration, source interpretation, dependencies, compilation, tests and database ownership. No Node runtime is required by the packaged CLI. Database Objects retains its read-only Source/Working selection and native object identities.

Official CLI update checks run on a best-effort five-minute schedule; this is not a five-minute delivery guarantee. Dependency updates open as Draft pull requests for validation and review before release.

Independent tooling, not affiliated with Jade Software.

Raw `.jox` files use XML highlighting, with Jade highlighting inside each `JadeMethod` source region (including CDATA). Open a saved method projection from Object Explorer, select a method in Class Workspace, or place the cursor inside a saved raw JOX method and press **F5** / **Jade: Debug Method**. Breakpoint and stack locations use native source mappings back to that editor; XML markup is not compiled as CLS. Save raw files before debugging.

Debugging remains capability-gated: the CLI must explicitly support the selected Working mode and provide its matching native debugger helper and ABI profile. Older or unqualified CLI packages show an update/qualification message before a session starts. Declaring the VS Code debugger does not enable an unsupported native runtime. Existing CLS debugger routing is preserved.
