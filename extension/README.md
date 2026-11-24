# Jade Tools

Bundles [official Jade CLI 0.11.6](https://github.com/darrenhull/Jade-CLI/releases/tag/v0.11.6) with its verified ANSI and Unicode JOX runtimes and read-only inspection helpers.

Requires Visual Studio Code on Windows and a compatible installed ANSI or Unicode Jade runtime for database operations. The Jade IDE is not required.

Browse JOX schemas, classes and members in Object Explorer and Class Workspace. Open a method to edit its Jade source in a normal VS Code text editor. Native source identities and revision bindings map accepted saves back to the authoritative `.jox` file; `.jade/` contains ignored, regenerable projections and private runtime state.

Run **Jade: Set Up Project**, then choose **Create Working copy and extract sources**. Review Source and Working once. Native setup creates a fresh private Working copy and extracts sources once from that same copy. It preserves existing source files and Working data on conflicts. Source remains separate and is not published by setup or local testing.

For an existing Git checkout containing saved `sources/**/*.jox` files, **Set Up Project** detects the checkout and offers **Create Working from checkout** or synchronizes its existing Working copy. It detects missing machine settings first; a `jade.json` file is not required. Explicit machine paths in VS Code settings are honored; newly detected installation and seed paths are stored privately per folder, outside checked-in workspace files; choose the approved vendor-only seed separately using **Jade Native: Working Seed Directory**. Successful checkout selection is retained in private VS Code workspace state across reloads. Cancelling or refusing the preview leaves the active project mode unchanged, and an explicit Source-backed project retains its existing setup flow. The review shows the saved JOX root and the private Working target. Setup uses a verified vendor-only seed, not an application Source database; it never extracts or overwrites checkout files. After switching branches or editing files, use **Sync Workspace to Working** to apply the saved checkout and see the accepted commit and any saved file changes. Sync automatically saves modified Jade projection editors in the selected project before capturing the snapshot. Save modified raw `.jox` files manually before syncing; the command refuses unsaved raw JOX changes in the project. Unsupported changes are reported, not treated as successful sync or automatically reset.

Use **Run Local Test**, **Ctrl+F5**, or the Testing view. Inputs are saved before execution. The native provider uploads saved Git changes to Working and compiles them before running the selected native tests. Unchanged runs still execute tests without uploading the same source again. Normal Git commit/push remains available through VS Code Source Control; database publication is separate.

The qualified ANSI checkout flow covers saved-source initialization, synchronization and native tests; the existing Unicode method-edit and native-test flow remains available. Unsupported or unmappable declarations remain read-only or fail explicitly. Working data is persistent: executed application code can change it and can access resources allowed by the runtime.

Native Scratch execution is also qualified on ANSI. Standalone builds, structural editing, debugging and Source publication are not qualified by this release. Existing CLS workflows remain in the preserved Jade-cls distribution; this JOX variant does not convert a CLS project automatically.

The native runtime owns configuration, source interpretation, dependencies, compilation, tests and database ownership. No Node runtime is required by the packaged CLI. Database Objects retains its read-only Source/Working selection and native object identities.

Official CLI update checks run on a best-effort five-minute schedule; this is not a five-minute delivery guarantee. Dependency updates open as Draft pull requests for validation and review before release.

Independent tooling, not affiliated with Jade Software.
