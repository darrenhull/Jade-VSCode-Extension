# Reliable reviewed CLI dependency updates

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/65

## Problem and scope

The updater opened Draft PRs without a real linked issue and bumped the extension version without matching changelog notes. Those PRs could not pass the repository's required issue/release-note checks. Fix the updater only; retain the current package version, CLI pin and installed environments.

## Implementation

1. Cover actual version preparation and the extracted PowerShell workflow with failing-first tests.
2. Find or create one version-specific tracking issue using paginated GitHub issue data. Reuse it on retries, validate the repository and issue identity, and add its closing reference to the Draft PR. Grant issues write only to the caller and called updater workflows.
3. Validate version/pin/changelog inputs before writes, prepare exact next-version notes linking the official CLI release, preserve historical text/newlines, and stage notes alongside the version and native pin.
4. Keep archive/hash checks, bot identity, Draft creation, owner approval and immutable releases unchanged. Do not install software or access a database.

## Validation

Failing-first evidence: the release-note test found unchanged prior notes; invalid pin preparation unexpectedly succeeded; the real workflow body lacked `Closes #65`. Issue helper initially did not exist.

Verified: full database-free suite 1,135 passed / 45 connected skips, plus 18 isolated PowerShell contracts; final focused suite 13/13 passed (including two additional failure/retry workflow cases); VSIX packaging, release metadata, distribution receipt/runtime hashes and extracted no-Node discovery smoke all passed. API interaction tests use injected `gh` responses and the real PowerShell body, not live issue creation. No native database was opened.

## Limitations

The existing updater concurrency group serializes automated runs, and exact issue lookup makes retries idempotent. GitHub does not provide an atomic create-if-absent issue endpoint: concurrent manual creation can still produce duplicates, which the helper reports rather than guessing. The consumer notes honestly identify and link the new CLI dependency; they do not invent editor features.
