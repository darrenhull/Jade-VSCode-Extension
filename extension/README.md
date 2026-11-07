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

- **Jade: Create Schema, Class or Collection:** open the shared designer from Jade Tools or the Command Palette. Choose a project and schema, define a class or keyed dictionary, and review the summary and native source before saving. Type to search visible schema-qualified superclasses, member classes and key properties. Use Back to adjust choices without losing the draft. Creating a schema uses the configured source subfolder and keeps its header beside the schema folder.
- The shared designer creates new files only; it does not create stored object instances, compile or publish. Existing files and unsaved buffers are protected. Arrays, sets, unproved comparison modes and further index/storage options remain outside this first release.
- Type choices use workspace source and schema ancestry plus the existing verified RootSchema cache. If that cache is unavailable, the designer explains the reduced choices. Imported-package aliases are not yet resolved by this source catalogue; native compilation remains authoritative for visibility and lifetime compatibility.
- **Object Explorer:** search schemas and classes, navigate properties and methods, and open a focused member preview. **Open Original Source** opens the editable native file.
- **Database Objects:** choose **Source** or **Working**, search for a class, browse persistent instances, follow stored references and page through collections. This browser is read-only.
- **Jade: Create Keyed Collection:** choose the collection and member class, select ordered composite keys and preview the native CLS source. The designer supports keyed dictionaries; arrays, sets and dynamic indexes do not have dedicated designers.
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
