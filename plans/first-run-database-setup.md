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


## Current lifecycle and resource-scope regressions

Three additional integration cases were first reproduced as failures: cancelling Connect while either setup information prompt is pending must not execute its later Create/Open Folder or Detect Runtime action, and an active CLS outside all workspace folders must not bypass workspace selection or pass an undefined folder to runtime setup. Minimal cancellation/disposal guards and the existing workspace-folder picker now preserve both constraints. All 56 focused first-run/wizard, Connect-progress and character-set cases pass. No new UI or connection abstraction was added.


## Final current-head verification

The final 0.19.1 implementation passes 17 first-run/wizard cases and 56 cases when combined with current connection-progress and character-set regressions. The full default suite passes 1013 JavaScript and 18 PowerShell checks, with 43 explicit native opt-in skips. The packaged VSIX matches the official CLI 0.6.0 manifest and every runtime asset and passes portable discovery without Node on PATH or a database connection. All three actual private VS Code setup states were recaptured and visually inspected against the current implementation, including its retained connection progress. Owned private hosts/profiles and temporary package extraction were cleaned. The independent read-only audit found no further concrete acceptance-criteria omission after the cancellation/scope fixes. User settings, installed extensions, brokers and databases remain untouched. Current-head CI and fresh automated review precede the protected owner-approval handoff.


## Pre-native guidance cancellation

Two bounded regressions proved Connect cancellation remained pending until the informational setup prompt was dismissed. A small presentation helper now races only these pre-native information prompts with the existing operation AbortSignal and always removes its listener. Cancelled/old prompt responses cannot execute actions or affect a subsequent Connect; two additional repeated-operation cases prove that isolation. No native backup cancellation or connection ownership behavior changed. All 60 focused cases pass; the full suite/package are rechecked on this final helper before Ready.

