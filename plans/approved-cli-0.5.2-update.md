# Approved CLI 0.5.2 extension update

Issue: #53. Delivery PR: #52. Supersedes the older unmerged CLI 0.5.1 dependency update #50 after this replacement is validated.

## Scope and sequence

1. Use the existing release updater to verify the official CLI 0.5.2 release, its trusted asset URLs, archive digest, bounded extraction and every native manifest asset. Keep the reviewed 0.18.2 extension source; bump the consumer patch to 0.18.3.
2. Record user-facing backup retry and diagnostic improvements inherited from CLI 0.5.1/0.5.2. Do not claim ANSI execution support: this release still rejects an incompatible ANSI runtime before connecting.
3. Run the existing default regression suite, pin/manifest verification, build and actual portable VSIX smoke without Node or a database. No new implementation tests are needed for a distribution-only update; existing runtime integrity and packaged-client tests exercise the changed boundary.
4. Commit this plan, the official runtime pin/distribution, release notes and a sanitized verification receipt. Link the real issue. Mark Ready only after verification; resolve automated-review findings, then request owner approval with protected checks intact.
5. Keep the ANSI feature PR #51 independent. After this patch merges, rebase it onto approved main and adopt the separately reviewed official CLI 0.6 release before its own readiness.

No database is opened, recovered, reset or published. No local installation is part of this PR. No UI changes are included.

## Verified result

Official archive and executable digests match GitHub release metadata; every pinned runtime asset matches its official manifest. The default suite passed 970 JavaScript and 18 PowerShell tests, with 43 explicit native opt-in skips. The 0.18.3 VSIX passed portable discovery outside the checkout without Node on PATH or any database connection. Receipt: docs/verification/approved-cli-0.5.2.json. No new UI or installation was performed.

