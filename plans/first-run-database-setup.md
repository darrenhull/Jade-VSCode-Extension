# First-run database connection

Issue: [#45](https://github.com/darrenhull/Jade-VSCode-Extension/issues/45)

## Problem

Connect treated workspace folders as database-setting profiles. In an empty VS Code window it displayed an empty picker, with no useful way forward.

## Implementation

1. Add failing Object Explorer regressions for empty-window setup, cancellation, duplicate workspace names and the existing configured single-folder path.
2. Offer Create or Open Folder before resolving configuration when no folder is open. Explain that the source folder can be new/empty and that runtime setup then selects the separate Jade installation folder.
3. Label multi-root selection as a workspace-folder choice and display each path.
4. Mark only missing runtime settings with a typed configuration error. Offer the existing Detect Runtime Settings command, passing the selected folder URI through to its existing wizard. Keep detected installations and an explicit Browse choice together, identifying the installation root by bin/jom.dll. Other configuration failures retain their cause.
5. Keep cancelled selection/setup out of the error channel and never start a native operation during setup.
6. Verify the running private VS Code host, capture actual setup UI, run regressions and package checks. Keep the installed approved extension unchanged until release.

## Validation

Red: four of five initial regressions failed against approved 0.18.0, demonstrating the empty picker, misleading label and cancellation errors. Green: 14 focused first-run/wizard cases; full default suite passes 969 JavaScript tests and 18 PowerShell checks (43 explicit opt-in skips). Private VS Code hosts verify the actual empty-window guidance, unconfigured-folder guidance and detected-installation/Browse picker; screenshots are checked in under docs/screenshots/first-run. The packaged VSIX passes exact native receipt/hash checks and portable discovery without Node or a database connection. Owned host profiles and smoke artifacts are removed after verification.

No connection manager, new configuration format, database operation or profile system is introduced.

## Rebase onto approved 0.19.0

Resolved the PR against approved main 92afb836, retaining the official CLI 0.6.0 distribution, characterSet/default-precedence support and the current single-flight connection/progress/cancellation path. The workspace picker keeps its active cancellation token while gaining clear labels and folder paths. The shared Object Explorer fixture retains its native target progress callback and preserves typed configuration failures. Release version is 0.19.1; no downgrade to the original 0.18.1 proposal. Setup UI wording is unchanged. Focused first-run, wizard, connection-progress and character-set regressions pass 53/53; full suite and refreshed private UI/package verification follow before Ready. Installed environment remains untouched.

