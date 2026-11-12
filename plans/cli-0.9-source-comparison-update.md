# Bundle the verified CLI 0.9.0 source comparison release

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/67
PR: https://github.com/darrenhull/Jade-VSCode-Extension/pull/68

## Scope

Update the extension's committed native package from the official stable CLI 0.8.0 release to 0.9.0 and increment the consumer patch version to 0.21.1. The new CLI command compares selected class source against Git and local CLS content. This package change does not add a new editor command or claim complete schema/resource synchronization.

Keep this independently reviewable from updater-policy PR #66. Do not copy its permissions, workflow changes or automated issue creation. Do not install into a user environment or open a database.

## Implementation

1. Use the existing main-branch release-update workflow to verify the official archive, version, distribution manifest and every runtime checksum before preparing the bot Draft PR.
2. Link manual tracking issue #67, preserve the bot's identity and add exact 0.21.1 user-facing notes linking CLI 0.9.0.
3. Verify that root/extension package versions and lockfile match, with the official native package and pin committed together.
4. Run the full database-free test suite, package the VSIX and exercise extracted native discovery with no Node on PATH. Publish nothing during PR validation.
5. Push changes, verify current-head CI and review comments, then mark Ready for automated review. Request owner review and enable protected squash auto-merge only after automated review is clear. Never approve or merge on the owner's behalf.

## Release identity

- Reviewed CLI tag: v0.9.0 at 46f99061f6fa6cb6ded68d9447d637ec21a1af7a.
- ZIP SHA-256: 14764e7599f51f2708030716eca5a51f75e0390130f99a54cd3a757daa58ae07.
- Distribution manifest SHA-256: 1b4f32d9e5e677a3065fe8f6953ea3b8d6bcc6b8695f16b590f0bf3511ae0574.
- Root independently verified official release assets and all 15 runtime entries; the existing updater verifies the consumer's committed copy as well.

## Validation

The existing current-version release-note test first failed on the generated dependency branch because its 0.21.1 notes were absent. After adding the matching notes, verification passed: full suite 1,129 passed / 45 connected skips, plus 18 isolated PowerShell contracts; VSIX packaging, official distribution receipt/runtime hashes, extracted no-Node/database-free discovery smoke and release metadata. Connected native tests remain opt-in and are not claimed by this package-only change.
