# Refreshing the native JADE IDE after publishing

Publishing through VS Code updates the selected database through JADE's native loader. A successful load confirms that operation; it does not confirm that another open IDE window has refreshed. Compilation and tests use the separate Working database.

## Before publishing

1. Run **Jade: Set Up Project**, or **Jade: Initialise Workspace** for configuration-only setup. Check the configured Source database and INI. Preparing Working does not publish local files to Source.
2. In the native IDE, check that its database and Current/Latest schema selection match the publication you intend to inspect. A Latest-only structural change may not appear in a Current view.
3. Preserve unsaved IDE method text. Publication and refresh are separate from deciding whether to keep or replace that draft.
4. Use the extension's publish review to confirm the exact target and saved inputs. Wait for the native completion or original diagnostic; structural loading and reorganisation can take longer. Do not interpret a timeout or partial outcome as a completed publication.

## If the IDE still shows old definitions

In the relevant native IDE browser, use **View → Refresh**. The JADE User Guide documents this action for multiuser browsers displaying changes from another user. Check the selected schema version again before treating a missing class or method as a refresh failure. Preserve any unsaved editor text and resolve a native lock or conflict explicitly.

The extension does not send a separate remote IDE-refresh command. No supported public command for refreshing every already-open native browser and editor has been established. Do not rely on automatic repaint after publication.

**Jade: Refresh Object Explorer** updates the VS Code source index and Object Explorer. **Jade: Refresh Database Objects** retrieves the connected inspection view. Neither command is the native IDE's **View → Refresh**. Rebuilding the source index does not synchronise an unsaved native IDE editor or recreate Working.

## Documented scope

The 2025.0.01 User Guide, printed pages 91 and 267, distinguishes manual multiuser browser refresh from dynamic singleuser browsers. Its discussion of conflicting unsaved method text on pages 275–276 is not a promise about every external-loader case. The older [7.0 release information, PAR58840](https://secure.jadeworld.com/developer-centre/latest/70/ReleaseInfo.pdf) specifically covers discovery of newly externally loaded schemas; it does not establish automatic class, method and editor synchronisation.

See the official [schema-loader overview](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/jadscmload/ch1usingschemaloadutility/overview.htm) and [batch-loader completion behaviour](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/jadscmload/ch1usingschemaloadutility/loadschemaformsbatchmode.htm). Native loader completion and UI refresh must be observed separately.

## Disposable verification procedure

This procedure is provided for qualification; its runtime matrix has **not been run** for issue [#106](https://github.com/darrenhull/Jade-VSCode-Extension/issues/106). It requires an explicitly owned disposable target, not a user's Source or unpublished Working database.

1. Record runtime version, character set, database/INI/server identity and schema-version selection. Validate all mutable INI paths and the cleanup plan. Use multiuser mode for simultaneous IDE and loader clients; stop on locks or recovery requirements.
2. Create a small probe schema, class and method in that target. Export a baseline through the native tools. Open its schema, class and method lists and a clean method editor.
3. Load one method-body change through the native loader. Retain the original result and independently export the changed definition as the database-content oracle. Observe for a bounded ten seconds without clicking, then record reselect, **View → Refresh** and reopen as separate observations. Loader success alone is not an IDE refresh result.
4. Repeat separately for an added method, added class, renamed/deleted entity and added schema. Confirm Current/Latest and reorganisation completion before interpreting missing entries.
5. Repeat the method change with unsaved IDE text. Preserve it; record any conflict or stale-source warning. Do not force takeover, discard text or recover a database to complete the matrix.
6. If required, test singleuser behaviour in its own valid lifecycle, without opening a concurrent second singleuser client. Close owned clients before removing owned disposable artifacts.

For each case record the target, changed-input hash, native result and exported-content oracle; selected schema version; automatic, reselect, refresh and reopen outcomes; dirty-buffer state; and elapsed time. Until those rows are observed, class/method auto-refresh and dirty-editor behaviour remain unqualified. No private notification hook is required or proposed by this guide.
