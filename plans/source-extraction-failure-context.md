# Bounded native extraction failure context

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/71
Native producer: https://github.com/darrenhull/Jade-CLI/pull/42

## Outcome and boundary

Keep the native failure text and code, then show a copyable bounded history in Jade Source Pull output when extraction fails. This client formats native diagnostic metadata; it does not infer or change Jade execution, retry the export, bypass security, skip schemas or open a database.

## Implementation

1. Consume the native result.report contract after native close: fixed executionSchema/sourceVersion, current stage/targetSchema, lastSuccessfullySelectedSchema/currentType, lastOperation and recentOperations.
2. Keep the original report.error line first. A small stateless formatter allows only the agreed scalar metadata fields. Ignore unknown fields, nested payloads, configuration, credentials, source and OIDs. Bound each text field to 256 UTF-8 bytes, operations to the most recent 32 and total extra output to 16 KiB; preserve Unicode boundaries and prevent injected output lines. No successful per-item history or default 30,000-item logging.
3. Reuse the existing Source Pull controller output channel; no new control or native protocol. Formatter failure cannot replace the original native result.
4. The user subsequently authorized bundling the exact matching CLI candidate directly in this PR before official publication. Commit the complete final verified candidate distribution and existing archive/raw-manifest receipt with explicit source repository/PR/commit and officialRelease:false provenance. Its v0.10.1 tag is a version identity, not a claimed published release. Default CI/release packaging must reproduce that exact bundle; do not rely on a local environment override. Keep matching 0.22.1 feature notes and do not install into a user environment.
5. Validate current-head focused/default/package/portable checks, then mark Ready for fresh automated review. Address findings before requesting owner review and protected squash auto-merge.

## Failing-first verification

Before implementation, the registered failed Source Pull regression retained its error but failed because recent operation metadata was absent. The separate formatter tests also failed because no formatter existed. After the small formatter and one controller call were added, all 19 focused tests passed, including the existing 30,000-outcome no-spam regression. Coverage checks original error ordering/code, failed/success behavior, distinct execution/target/last-selected schemas, unknown/nested secret fields, malformed/oversized input, latest-32 selection, Unicode and total output bound.

## Remaining release gates

The implementation is prepared against released main a2e1e14 (extension 0.22.0 / CLI 0.10.0). The exact final CLI 0.10.1 candidate build and verified consumer packaging remain dependencies; official publication is no longer a prerequisite under the explicit user instruction. Native qualification is owned by CLI #42; database-free adapter tests are not a claim that the user's original Jade 1205 cause is reproduced or resolved. No installation, user database operation, configuration reset or overwrite is part of this change.

## Client UI and full-suite evidence

Database-free default suite: 1,162 passed / 45 explicit connected skips, plus all 18 isolated PowerShell contracts. No native user database was opened. The existing isolated Code host harness was extended with one opt-in failure-trace scenario (JADE_UI_FAILURE_TRACE=1); no new fixture framework was introduced. One successful screenshot was captured and visually inspected: docs/screenshots/source-extraction-failure-context/failure-output-ui-simulation.png. It shows the original simulated native failure first, followed by fixed execution schema, target/last-selected context and the recent operation ring in the actual Jade Source Pull output channel. Window/output explicitly say SIMULATED PROTOCOL / NO DATABASE; this verifies UI rendering, not a native failure reproduction. The owned host/profile was closed and cleaned. Receipt: tests/SourceExtractionFailureLog/receipts/failure-output-ui-simulation.json. An earlier harness attempt stopped cleanly on an unavailable focus command before capture; that command was removed, and no screenshot is claimed for the failed attempt.

The final native producer adds historyTruncated=true when its own ring or payload cap drops older entries. An additional failing-first regression proved that a surviving two-entry native history otherwise looked complete. The client now honors that explicit boolean alongside its own caps; all 20 focused tests pass. No new source-selection or extraction behavior is introduced.

## Exact directly bundled candidate

The final candidate is source commit 0cd613705082bf85c1b821c9ac29aab618a3c399 from Jade-CLI PR #42, package version 0.10.1. The complete tracked distribution was verified against all 17 archive entries before copying through the existing bundleCli path. ZIP SHA-256: 1f2d672a391912c8f6e3b394770973da65cb0e2769fc2bf9b85f3c874410d8b9. Executable SHA-256: e233ad5df08bf6e370bc0547b4a6b526177ab06c1ccf1afd87410314988a0635. Raw manifest SHA-256: e283413f29064c11288797aee9cdd4d6671b9131da72987f35506d6ce48fc84d. All 15 runtime hashes match. The existing pin additionally records officialRelease:false and source repository/PR/commit; its v0.10.1 tag identifies the version, not a published release. Minimum CLI is 0.10.1. Normal CI/release packaging reads the committed distribution without an environment override.

The native owner's receipt binds the exact final executable/source helpers to both-ABI injected failure-trace checks and complete public extraction parity (33 ANSI / 108 Unicode artifacts), repeated unchanged timestamps and retained local edits. These are small owned native fixtures, not a 30,000-class benchmark or reproduction of the customer's null receiver. Compact candidate binding: tests/SourceExtractionFailureLog/receipts/candidate-cli-0.10.1.json. Final consumer suite, VSIX byte verification and extracted no-Node smoke remain the next gates; no installation is authorized.
