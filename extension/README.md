# Jade Tools

Edit, build, test and explore Jade applications in Visual Studio Code. Work with native Jade source files, see compiler errors in your editor, run unit tests and review changes before publishing them to your database.

A compatible **Windows Jade runtime** is required. The **Jade IDE is not required**. The extension includes its command-line tools; you do not need to install Node.js, Python or a separate CLI.

## Get started

1. Install the `.vsix` from the [latest GitHub release](https://github.com/darrenhull/Jade-VSCode-Extension/releases/latest) using **Extensions: Install from VSIX…**. Reload VS Code when prompted.
2. Open your Jade source folder. In Settings, set **Jade Native: Install Path** to your Jade installation, or run **Jade: Detect Runtime Settings** from the Command Palette.
3. Configure your Source database connection. Use **Jade: Extract All Sources** to pull source into a folder inside your workspace, or open an existing source checkout.
4. Open a class file and press **F5** to compile. Use **Testing** or **Run Local Test** above a test to run it.

GitHub VSIX updates are installed manually. Installing a newer VSIX updates the same extension; there is no need to uninstall it first.

## Develop in the editor

| Feature | What you can do |
|---|---|
| Jade language support | Use highlighting, completion, hover, signatures, definitions and references in native source files. |
| Compile | Press **F5** to save and build new and changed sources in the active project, including required dependencies. Use **Jade: Compile Current File** for a focused check. Compiler errors appear in **Problems** and **Jade Compile** output. |
| Scratch Pad | Open **Jade: New Scratch Pad** to try Jade code in Working without publishing a class. Choose a schema, press **Run**, and compare the last two runs. |
| Format | Run **Format Document** or **Format Selection** to indent CLS headers, declarations, collections, database mappings and complete method bodies. Editor tabs/spaces are respected; literal text and Jade tokens are preserved. |
| Test | Discover and run unit tests in **Testing**, use **Run Local Test**, and inspect individual failures and assertion messages. |
| Debug | Set gutter breakpoints, step through supported methods/tests, inspect call stacks and expand objects and collections. |

**Format Document:** `Shift+Alt+F` on Windows. **Format Selection:** `Ctrl+K`, then `Ctrl+F`. Formatting changes indentation; it does not fix syntax errors. Incomplete or unknown structures and encrypted source contents are preserved.

For a wrapped statement or declaration, include its first line in the selection so the following lines can be indented together.

**Error Lens** is installed alongside Jade Tools when Marketplace access is available. It displays compiler diagnostics beside their source lines and can be disabled or uninstalled independently. Offline users can install its VSIX separately.

## Scratch Pad

Choose **New Scratch Pad** under Tools, select a schema, type Jade code and press **Run**. Save the page to keep its code and optional notes in source control; run output is not saved with it. After two runs, use **Compare Previous Scratch Pad Run** to compare the code and results.

Each run has separate local variables. Changes your code commits to Working data can remain for later runs. Interactive input is unavailable, and F5 does not execute scratch code.

## Browse and create

Choose a workspace class from **Find Class**, the class catalogue or **Object Explorer** to open its **Class Workspace**. Its grouped member rail searches all members and shows up to 100 at a time. Use the kind filter and resolved inherited-member toggle to narrow the list; **Back to Classes** restores catalogue context.

Selecting a local method opens an editable canvas backed by its original source document, with completion, diagnostics, navigation and native undo. **Save writes the entire original file**, including changes in other methods; configured Auto Save applies. **Open Original Source** shows that same buffer. Build and Publish remain separate actions. A second class sharing the same physical file opens in a separate editor group so its page can keep its own selection while sharing the document.

For a method stored in another partial class file, the workspace switches to that real source file. Native save/cancel protection preserves the previous document; cancelling leaves its selection and edits intact. Each file keeps its own undo history, and the editor identifies the file being edited.

If a source update rejects an edit, a recovery card preserves the method draft across reopening. Review or copy it, explicitly restore it into the real document, or confirm its discard. Recovery checkpoints stay in VS Code's private workspace storage. Large methods and exhausted recovery capacity explain why protected inline editing is unavailable and offer **Open Original Source**.

Inherited methods in another file have an explicit **Open declaring class** action. Missing or ambiguous source stays unavailable with an explanation. **Instances** asks which database target to browse; it does not publish an unpublished class. Object and collection pages remain read-only snapshots, retain history and page state, and show their last values as stale after disconnection.

- **Jade: Create Schema, Class or Collection:** open the shared designer from Jade Tools or the Command Palette. Choose a project and schema, define a class, keyed dictionary, ordered object array or unique object set, and review the summary and native source before saving. Search schema-qualified superclasses, member classes and key properties. Use Back to adjust choices without losing the draft. A new schema's header stays beside its folder in the configured source subfolder.
- Review inherited keys and known property attributes, duplicate policy and lifetime permissions. Unknown metadata remains clearly identified; a default lifetime does not restrict other lifetimes. Sizing offers either expected population or entries per block with verified source bounds. Actual runtime allocation remains native-dependent. Binary comparison is supported; Latin1 and unproved placement/partition modes remain unavailable with reasons.
- Select an existing database file to review a new class and its class-map change together. Saving uses VS Code's standard edit/undo path for the existing schema SEC file and protects dirty buffers or source changed since review. It does not create database files, migrate existing data, compile, publish or create stored instances. Class maps and exclusive-instance owner placement are distinct.
- Type choices use workspace source, schema ancestry, extracted package exports and the verified RootSchema cache. Imported members retain their alias and exporter context, including inherited aliases. Key choices expose exported properties; imported classes cannot be superclasses. Missing cache/export metadata is explained. Native compilation remains authoritative.
- **Object Explorer:** search schemas and classes, navigate properties and methods, and open a focused member preview. **Open Original Source** opens the editable native file.
- **Database Objects:** choose **Source** or **Working**, search for a class, browse persistent instances, follow stored references and page through collections. This browser is read-only.
- **Jade: Create Keyed Collection:** retain the existing dictionary workflow for ordered composite keys and native CLS preview. Use the shared designer for arrays, sets and the expanded native rules. Dynamic indexes remain unavailable.
- **Jade: Create Schema:** create the native schema files and runtime classes in your workspace.

## Compile safely, publish deliberately

Builds, tests and debugging use a separate **Working** database. They do not publish your local source to **Source**. Executed Jade code can change Working data and access files or networks permitted by your runtime; Working is not an operating-system sandbox.

Use **Publish All Changed Files** or **Shift+F5** when you want to update Source. Review the destination and file changes before confirming publication. Build, test and publish commands save their source inputs.

The first build can take longer while Working is prepared. Later runs reuse verified loaded source; tests still execute on every run. Disconnect an inspection session if it holds a conflicting single-user connection.

## Useful commands

Open the Command Palette with `Ctrl+Shift+P` and type **Jade** to find the available commands, including:

- **Jade: Detect Runtime Settings**
- **Jade: Extract All Sources**
- **Jade: Create Keyed Collection**
- **Jade: Create Schema, Class or Collection**
- **Jade: Create Schema**
- **Jade: Refresh Type Cache**
- **Jade: Show Working Database**
- **Jade: Disconnect Build and Test Runtime**
- **Jade: Disconnect Database Objects**

Debugger support requires a compatible runtime. GUI application hosting, arbitrary watch expressions and editing stored values in the data browser are not available. Native Jade validation remains authoritative for collection definitions and source changes.

[Source, architecture and development documentation](https://github.com/darrenhull/Jade-VSCode-Extension) · [Report an issue](https://github.com/darrenhull/Jade-VSCode-Extension/issues)

Jade Tools is an independent third-party extension and is not affiliated with or endorsed by Jade Software Corporation Limited. Jade is a trademark of Jade Software Corporation Limited.
