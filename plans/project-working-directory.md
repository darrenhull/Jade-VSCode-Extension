# Project-relative Working configuration

Closes #85. Depends on Jade CLI 0.10.4 (CLI #46/#47 and release-notes #48/#49).

The released CLI 0.10.3 rejects Working paths inside the source workspace. This change delivers the compatible native payload with the editor configuration that uses it.

1. Reproduce relative Working overrides resolving inconsistently and managed files entering source discovery. Resolve overrides from the selected project for builds, tests, Scratch Pad, debugging and Working inspection. Preserve absolute external paths.
2. Keep the Settings default empty to delegate automatic location, legacy-base selection and recreate generations to the native CLI. New bases use .jade/working; an explicit relative override resolves against the selected project. A literal editor default must not silently override native legacy/generation decisions.
3. Exclude managed .jade paths from indexing, test discovery and publication source scans, including explicit managed files. Preserve Source separation, saved-file and dirty-editor protection.
4. Bundle the verified official CLI 0.10.4 archive, pin receipt and native manifest together. Raise minimumCliVersion to 0.10.4 so packaging cannot ship this UI with the old path guard. Deliver extension version 0.22.6 with version-specific consumer notes.
5. Explain VS Code settings in .vscode/settings.json, disposable .jade/source-index metadata and persistent .jade/working data. Existing ready legacy bases and prior generations remain intact. Manually moved/unmanaged copies are refused and preserved; this release does not implement relocation or migrate unpublished database data.
6. Complete focused RED/GREEN, regression, actual VSIX integrity/portable checks and Settings screenshots from the unmodified packaged extension in an owned private VS Code profile. Link evidence in the PR. No user installation or database modifications.

Local evidence before the official payload: the relative resolver/source exclusions had meaningful failing-first regressions and 23 focused configuration/project/scope tests passed; the preceding full run passed 1187 JavaScript tests with 45 connected skips plus 18 PowerShell tests. The final 0.22.6 package attempt correctly refused the old 0.10.3 payload at its raised 0.10.4 minimum-version gate.

Final official-payload verification is recorded below when completed. Do not describe this branch as released or installed before those separate delivery gates pass.

## Final local verification

Official CLI 0.10.4 tag resolves to reviewed merge 2baf582; archive, raw manifest, executable and every runtime hash were verified before bundling. Final source regressions passed 1187 JavaScript tests with 45 connected skips, plus 18 PowerShell tests. The exact 0.22.6 VSIX passed receipt/runtime integrity and outside-checkout discovery with Node absent from PATH and no database connection. The checked-in opt-in Settings proof activated the unmodified packaged extension in an owned private profile, verified the empty automatic default and saved/displayed project-relative override, and captured both states. Both screenshots were visually inspected; owned profiles were cleaned.

Compact receipt: [project-working-directory.json](../docs/verification/project-working-directory.json). UI: [automatic location](../docs/screenshots/project-working/automatic-location.png), [relative override](../docs/screenshots/project-working/relative-location.png). No user installation, live database preparation or migration was performed. Hosted current-head CI and fresh review are separate PR gates.
