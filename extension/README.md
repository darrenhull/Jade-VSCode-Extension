# Jade Tools

Bundles [official Jade CLI 0.11.0](https://github.com/darrenhull/Jade-CLI/releases/tag/v0.11.0) with its verified Unicode JOX runtime and read-only inspection helpers.

Requires Visual Studio Code on Windows and a compatible installed Unicode Jade runtime for database operations. The Jade IDE is not required.

Browse JOX schemas, classes and members in Object Explorer and Class Workspace. Open a method to edit its Jade source in a normal VS Code text editor. Native source identities and revision bindings map accepted saves back to the authoritative `.jox` file; `.jade/` contains ignored, regenerable projections and private runtime state.

Run **Jade: Set Up Project**, then choose **Create Working copy and extract sources**. Review Source and Working once. Native setup creates a fresh private Working copy and extracts sources once from that same copy. It preserves existing source files and Working data on conflicts. Source remains separate and is not published by setup or local testing.

Use **Run Local Test**, **Ctrl+F5**, or the Testing view. Inputs are saved before execution. The native provider uploads saved Git changes to Working and compiles them before running the selected native tests. Unchanged runs still execute tests without uploading the same source again. Normal Git commit/push remains available through VS Code Source Control; database publication is separate.

The current qualified flow covers original method-body edits and selected native tests on a Unicode Jade runtime. Unsupported or unmappable declarations remain read-only or fail explicitly. Working data is persistent: executed application code can change it and can access resources allowed by the runtime.

Standalone builds, structural editing, Scratch execution, debugging and Source publication are not qualified by this release. Existing CLS workflows remain in the preserved Jade-cls distribution; this JOX variant does not convert a CLS project automatically.

The native runtime owns configuration, source interpretation, dependencies, compilation, tests and database ownership. No Node runtime is required by the packaged CLI. Database Objects retains its read-only Source/Working selection and native object identities.

Official CLI update checks run on a best-effort five-minute schedule; this is not a five-minute delivery guarantee. Dependency updates open as Draft pull requests for validation and review before release.

Independent tooling, not affiliated with Jade Software.
