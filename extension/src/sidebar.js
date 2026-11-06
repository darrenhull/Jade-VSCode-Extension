"use strict";
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const {
  resolveExtractConfig,
  resolveExtractionDirectory,
  startExtract,
  applySourceUpdate,
} = require("./extract");
const { createPullProgress, preparePullSources } = require("./pull-progress");

function registerSidebar(vscode, context, options) {
  const output = vscode.window.createOutputChannel("Jade Extract");
  context.subscriptions.push(output);
  let lastExtraction = context.workspaceState?.get("jadeNative.lastExtraction");
  let events;
  const refresh = () => events?.fire();
  async function workspaceFolder() {
    const folders = vscode.workspace.workspaceFolders || [];
    const active =
      vscode.window.activeTextEditor &&
      vscode.workspace.getWorkspaceFolder(
        vscode.window.activeTextEditor.document.uri,
      );
    if (active) return active;
    if (folders.length === 1) return folders[0];
    if (folders.length > 1)
      return (
        await vscode.window.showQuickPick(
          folders.map((folder) => ({ label: folder.name, folder })),
          { title: "Choose Jade workspace settings" },
        )
      )?.folder;
    throw new Error(
      "Open a workspace folder and configure its Jade runtime first.",
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jadeNative.changeExtractionFolder",
      async () => {
        try {
          const folder = await workspaceFolder();
          if (!folder) return;
          const value = await vscode.window.showInputBox({
            title: "Jade extraction folder",
            prompt:
              "Working source folder within this workspace, for example src or /src. Use . for the workspace root.",
            value: options.settings(folder).extractionDirectory || ".",
            validateInput: (text) => {
              try {
                resolveExtractionDirectory(folder.uri.fsPath, text);
              } catch (error) {
                return error.message;
              }
            },
          });
          if (value === undefined) return;
          const destination = resolveExtractionDirectory(
            folder.uri.fsPath,
            value,
          );
          const relative =
            path
              .relative(folder.uri.fsPath, destination)
              .split(path.sep)
              .join("/") || ".";
          await vscode.workspace
            .getConfiguration("jadeNative", folder.uri)
            .update(
              "extractionDirectory",
              relative,
              vscode.ConfigurationTarget.WorkspaceFolder,
            );
          refresh();
          void vscode.window.showInformationMessage(
            `Jade extraction folder: ${relative}`,
          );
          return relative;
        } catch (error) {
          void vscode.window.showErrorMessage(error.message);
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jadeNative.extractAllSources",
      async () => {
        let locked = false;
        let temporary;
        try {
          await options.beforeOperation?.();
          if (options.isBusy())
            throw new Error("A Jade operation is already running.");
          const folder = await workspaceFolder();
          if (!folder) return;
          const settings = options.settings(folder);
          const config = resolveExtractConfig(settings);
          const parent = resolveExtractionDirectory(
            folder.uri.fsPath,
            settings.extractionDirectory,
          );
          if (options.isBusy())
            throw new Error("A Jade operation is already running.");
          await options.setBusy(true);
          locked = true;
          const destination = parent;
          temporary = fs.mkdtempSync(
            path.join(os.tmpdir(), "jade-source-pull-"),
          );
          const staging = path.join(temporary, "incoming");
          output.clear();
          output.show(true);
          output.appendLine(
            `Extracting all user schemas from ${config.databasePath} ...`,
          );
          output.appendLine(`Destination: ${destination}`);
          const identity = require("node:crypto")
            .createHash("sha256")
            .update(
              path.resolve(destination).toLowerCase() +
                "::" +
                path.resolve(config.databasePath).toLowerCase(),
            )
            .digest("hex");
          const baselineDirectory = path.join(
            context.globalStorageUri.fsPath,
            "source-baselines",
          );
          const baselineFile = path.join(baselineDirectory, identity + ".json");
          let previous;
          try {
            previous = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          const legacyManifest = path.join(
              destination,
              "extract-manifest.json",
            ),
            legacyBytes = fs.existsSync(legacyManifest)
              ? fs.readFileSync(legacyManifest)
              : undefined;
          const prepared = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Pulling Jade sources",
              cancellable: true,
            },
            async (progress, token) => {
              const observed = createPullProgress(progress, {
                directory: staging,
                watchRoot: temporary,
              });
              let operation;
              const subscription = token.onCancellationRequested(() =>
                operation?.stop(),
              );
              try {
                if (token.isCancellationRequested)
                  return { result: { success: false, cancelled: true } };
                operation = startExtract(config, staging, (text) =>
                  output.append(text),
                );
                const result = await operation.completion;
                if (!result.success) return { result };
                const preparation = await preparePullSources(
                  {
                    rawDirectory: staging,
                    organizedDirectory: path.join(temporary, "organized"),
                    destination,
                    previous,
                  },
                  { token, report: (phase) => observed.phase(phase) },
                );
                return { result, ...preparation };
              } finally {
                subscription.dispose();
                observed.dispose();
              }
            },
          );
          const { result, organized, plan } = prepared;
          output.appendLine(`ExtractorExitCode=${result.code}`);
          if (result.cancelled) {
            output.appendLine(
              "Extraction cancelled. Working source was not changed.",
            );
            return { ...result, destination };
          }
          if (!result.success)
            throw new Error(
              `Jade extraction failed (exit ${result.code}). See Jade Extract output.`,
            );
          const checkDirtyEditors = () => {
            const dirtyPaths = new Set(
              vscode.workspace.textDocuments
                .filter(
                  (document) =>
                    document.isDirty && document.uri.scheme === "file",
                )
                .map((document) =>
                  path.resolve(document.uri.fsPath).toLowerCase(),
                ),
            );
            const dirtyUpdates = plan.files.filter(
              (file) =>
                (file.originalPath ||
                  !["keep", "unchanged"].includes(file.action)) &&
                dirtyPaths.has(
                  path.resolve(file.originalPath || file.target).toLowerCase(),
                ),
            );
            if (dirtyUpdates.length)
              throw new Error(
                "Save your editor changes before pulling updates to: " +
                  dirtyUpdates.map((file) => file.path).join(", "),
              );
          };
          checkDirtyEditors();
          let replaceConflicts = false;
          if (plan.conflicts.length) {
            const choice = await vscode.window.showWarningMessage(
              `${plan.conflicts.length} local source file(s) differ from the database.`,
              {
                modal: true,
                detail: plan.conflicts.map((file) => file.path).join("\n"),
              },
              "Keep Local Files",
              "Replace Listed Files",
            );
            if (!choice) {
              output.appendLine(
                "Source update cancelled. Working source was not changed.",
              );
              return {
                ...result,
                destination,
                success: false,
                cancelled: true,
              };
            }
            replaceConflicts = choice === "Replace Listed Files";
          }
          checkDirtyEditors();
          const applied = applySourceUpdate(plan, replaceConflicts, {
            writeManifest: false,
          });
          fs.mkdirSync(baselineDirectory, { recursive: true });
          fs.writeFileSync(
            baselineFile,
            JSON.stringify(plan.manifest, null, 2) + "\n",
          );
          if (
            legacyBytes &&
            fs.existsSync(legacyManifest) &&
            fs.readFileSync(legacyManifest).equals(legacyBytes)
          ) {
            const legacy = JSON.parse(
              legacyBytes.toString("utf8").replace(/^\uFEFF/, ""),
            );
            if (
              legacy.database &&
              Array.isArray(legacy.files) &&
              legacy.extractor
            )
              fs.unlinkSync(legacyManifest);
          }
          // A native bulk pull can overflow/coalesce filesystem watcher events.
          // Rescan completed source explicitly instead of relying on those events.
          await vscode.commands.executeCommand("jadeNative.refreshTests");
          await vscode.commands.executeCommand("jadeNative.refreshClassView");
          for (const legacy of plan.retainedLegacy || [])
            output.appendLine(
              `Kept locally edited legacy export: ${legacy.path}. Preserve or move those edits before deleting it; local compile/navigation ignores full SCM copies.`,
            );
          lastExtraction = destination;
          await context.workspaceState?.update(
            "jadeNative.lastExtraction",
            destination,
          );
          refresh();
          const userClasses = plan.manifest.files.filter((file) =>
            file.path.endsWith(".cls"),
          ).length;
          output.appendLine(
            `Kept ${organized.schemas.length} user schemas, ${userClasses} class/type files and ${plan.manifest.files.length} working source files under schemas/<schema>/.`,
          );
          output.appendLine(
            "Full SCM/MUL exports, verified aggregate DDX copies and empty inherited/system type files are excluded from the workspace.",
          );
          output.appendLine(
            `Updated ${applied.written} files; kept ${applied.kept} locally edited files.`,
          );
          void vscode.window
            .showInformationMessage(
              `Jade working source updated: ${applied.written} files written, ${applied.kept} local edits kept.`,
              "Show Sources",
            )
            .then((choice) => {
              if (choice === "Show Sources")
                return vscode.commands.executeCommand(
                  "revealInExplorer",
                  vscode.Uri.file(destination),
                );
            });
          return {
            ...result,
            destination,
            fileCount: plan.manifest.files.length,
            ...applied,
          };
        } catch (error) {
          if (error.code === "JADE_PULL_CANCELLED") {
            output.appendLine(error.message);
            return { success: false, cancelled: true };
          }
          output.appendLine("Extraction failed: " + error.message);
          output.show(true);
          void vscode.window.showErrorMessage(error.message);
          return { success: false, error: error.message };
        } finally {
          try {
            if (
              temporary &&
              path.dirname(path.resolve(temporary)) ===
                path.resolve(os.tmpdir()) &&
              path.basename(temporary).startsWith("jade-source-pull-")
            )
              await fs.promises.rm(temporary, { recursive: true, force: true });
          } finally {
            if (locked) await options.setBusy(false);
          }
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("jadeNative.openLastExtraction", () => {
      if (lastExtraction)
        return vscode.commands.executeCommand(
          "revealInExplorer",
          vscode.Uri.file(lastExtraction),
        );
    }),
  );
  if (!vscode.window.registerTreeDataProvider) return;
  events = new vscode.EventEmitter();
  context.subscriptions.push(events);
  function item(label, command, icon, description) {
    const row = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
    );
    row.command = { command, title: label };
    row.iconPath = new vscode.ThemeIcon(icon);
    row.description = description;
    return row;
  }
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("jadeNative.tools", {
      onDidChangeTreeData: events.event,
      getTreeItem: (row) => row,
      getChildren: () => {
        const folder =
          (vscode.window.activeTextEditor &&
            vscode.workspace.getWorkspaceFolder(
              vscode.window.activeTextEditor.document.uri,
            )) ||
          vscode.workspace.workspaceFolders?.[0];
        const directory = folder
          ? options.settings(folder).extractionDirectory || "."
          : undefined;
        return [
          item("Scratch Pad", "jadeNative.newWorkspace", "notebook", "Run native Jade Workspace code"),
          item(
            "Disconnect Build/Test Runtime",
            "jadeNative.disconnectTestRunner",
            "debug-disconnect",
            "Release the private working connection",
          ),
          item(
            "Verify Pulled Tests",
            "jadeNative.verifyPulledTests",
            "testing-run-icon",
          ),
          item(
            "Add Class Rename Migration",
            "jadeNative.addClassRename",
            "edit",
          ),
          item("Create Schema", "jadeNative.createSchema", "new-file"),
          item(
            "Create Keyed Collection",
            "jadeNative.createKeyedCollection",
            "list-tree",
          ),
          item(
            "Debug Application",
            "jadeNative.debugApplication",
            "debug-start",
            "Native non-GUI lifecycle",
          ),
          item(
            "Publish Workspace Schemas and Resources",
            "jadeNative.publishWorkspace",
            "cloud-upload",
          ),
          item(
            "Extract All Sources",
            "jadeNative.extractAllSources",
            "cloud-download",
            "Update working source",
          ),
          item(
            "Change Extraction Folder",
            "jadeNative.changeExtractionFolder",
            "folder",
            directory,
          ),
          ...(lastExtraction
            ? [
                item(
                  "Show Source Folder",
                  "jadeNative.openLastExtraction",
                  "folder-open",
                  path.basename(lastExtraction),
                ),
              ]
            : []),
          item(
            "Publish All Changed Files",
            "jadeNative.publishChangedFiles",
            "cloud-upload",
            "Changed CLS files",
          ),
          item(
            "Show Working Database",
            "jadeNative.showWorkingDatabase",
            "database",
          ),
          item(
            "Recreate Working Database",
            "jadeNative.recreateWorkingDatabase",
            "refresh",
          ),
          item(
            "Detect Runtime Settings",
            "jadeNative.discover",
            "settings-gear",
          ),
        ];
      },
    }),
  );
}
module.exports = { registerSidebar };
