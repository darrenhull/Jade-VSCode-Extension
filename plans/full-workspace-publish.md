# Complete extraction and reviewed native workspace publication

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/69

## User outcome and boundaries

Extract all native schema source into the project, edit it, then use the registered Publish Workspace command to review and load the frozen complete native project into the selected target. Preserve aggregate schema DDX and native SEC/CLS semantics using Jade's existing joiner and loader. Selected-class comparison alone does not deliver this workflow.

The full workspace route already discovers aggregate DDX and calls native join/load; the class-only aggregate refusal is not evidence that full publication is missing. Do not build another serializer, category planner or publication CLI protocol. No live user database publication or installation is authorized by this implementation test.

## Minimal implementation

1. Replace the target review's legacy JadeBatchExtract Every plus organisation with one private complete snapshot from the existing qualified source.extract client. Enforce its scope/capability/authoritative result and owner-bound per-file permissions; no fallback or second export.
2. Preserve the same frozen native joined bundle across Working validation and approved target load. Re-scan the complete source file set after approval and check dirty associated saved/untitled editors and pending custom source buffers before any target writes. Reject added/deleted/changed inputs. Remove the local-hash-only early return that skips target inspection.
3. Accept and accurately label CLI reconciliation stages without weakening scope, ownership, permission, outcome or cancellation validation.
4. Retain each private staging bundle until its native consumers exit, clean it on success/cancel/failure, validate ownership before removal, and preserve the primary native/source error if cleanup fails. Keep busy state and review directory cleanup in finally.

## Failing-first evidence and current verification

The actual source extraction adapter rejected git-baseline/local-snapshot/hash-and-compare/guarded-apply as invalid progress. The registered full-publish command used the old target export rather than the provided streaming service. After replacing that boundary, tests demonstrated that new files and saved/associated-untitled editors made dirty during approval still reached target load. Deleted inputs failed with a raw missing-file error. Complete rescanning and live editor checks now refuse all those changes before target load.

Focused registered command tests pass (6), including unchanged aggregate-resource full join/load through a stub native boundary and added/deleted/changed/dirty input refusal. The native lifecycle owner additionally reproduced partial-stage/join and Working-runner leaks before fixing them; its 32 focused lifecycle/cache/security tests pass, including descendant-junction handling and primary-error preservation. These tests do not establish native source roundtrip correctness.

## Required remaining gates

- Actual unchanged extracted-to-native full publication through the registered command on separate owned disposable Working and target databases, run only by the native coordinator. Include aggregate DDX and _exposedListDefinitions.sec, resource/class parity and cleanup evidence. No user Source publication.
- Preliminary full database-free suite passed at 39272c8: 1,149 passed / 45 connected skips plus 18 isolated PowerShell contracts; VSIX packaging, current official 0.8 receipt/runtime checks, no-Node/database-free portable smoke and release metadata passed. Repeat final packaging/native checks after the required official 0.10 dependency is pinned; this preliminary package is not the deliverable.
- Keep the linked PR Draft during implementation/native validation; mark Ready once gates clear to trigger Codex, clear actual findings, then request owner approval and protected squash auto-merge.

## Release dependency

CLI PR #40 must qualify, pass review/owner approval, merge and publish official CLI 0.10. After independently verifying that release, fold its exact archive/distribution pin into this complete-workflow PR with a new extension feature version and honest feature notes. Do not merge source-only changes on existing extension 0.21.0, prematurely pin an unreleased commit, or ship a separate comparison-only package as the outcome. Preserve held dependency PRs until their changes are explicitly superseded by this complete reviewed package.

## Honest publication guarantee

Source bytes and file membership are frozen and rechecked locally before publication; the exact validated bundle is loaded. Target review is a point-in-time native snapshot. It does not hold an atomic database compare-and-apply lease against an external writer during the approval dialog. No second full target export or invented native lock is added. Complete schema loads are authoritative within selected schemas; earlier successful schema loads can remain if a later schema fails, as the existing confirmation already states.

The full-publish scanner still retains bytes, decoded text and parsed models for both complete local and target snapshots. Its 30,000-class memory use is unmeasured; per-file native extraction does not imply bounded full-publish memory. Do not infer real native scale performance from mocked tests.

The profiling helper is separate and opt-in; it is not a release prerequisite or evidence of real 30,000-class export performance. Avoid expanding this change into a synchronization framework.

## Native coordinator driver

Only the native coordinator may execute this against its prepared fixture:

```powershell
$env:JADE_PUBLISH_OWNED_NATIVE='1'
node tests/ProjectTools/ProjectTools_fullPublish_native_tests.cjs `
  <candidate-cli.exe> <owned-temp-stream-seed> <extracted-workspace> `
  <working-config.json> <separate-target-config.json> <durable-evidence-directory>
```

The driver refuses missing opt-in, paths outside the owned seed, missing control files or identical Working/target databases. It invokes the registered Publish Workspace command, requires explicit fixture approval before target load, disallows the legacy Every application, records a bounded log/receipt, uses a private broker and cleans its run after shutdown. The coordinator additionally verifies actual native resource/class parity after publication. Driver syntax checking is not an actual native roundtrip claim.
## First actual native publication checkpoint

The coordinator ran the real registered command with an actual saved ProbeItem.name descriptor edit (String[50] to String[51]), separate original Source/Working/target databases, aggregate DDX and exposure sections. Native JadeJoinSchema returned zero but the frontend rejected `ThinExportProbe::Application` before any loader/target write: stock native output includes empty inherited placeholder files that the expanded join legitimately omits.

Reproduced that exact shape with a failing join regression, then reused the existing `isEmptyInheritedType` helper to exempt only empty inherited shapes from local-definition coverage. Real extracted Application/Object specimens both satisfy that helper. Substantive inherited overrides remain strictly required; no class-name allowlist or serializer rewrite was added. Twelve focused join/lifecycle/full-publish tests pass. The test driver now reports the primary native failure before any frozen-bundle assertion. The coordinator must rerun the actual edited publication/readback gate; this checkpoint is not a publication success claim.
The next actual native attempt progressed past inherited placeholders but exposed the same validator's interface assumption: ProbeInterface is a native numbered interfaceDefs block and is intentionally not represented by the editor's class parser. Its staged interfaceDefs index was present; no target load had begun. Added a failing native-interface inclusion test plus an omitted-interface rejection test, then recognized the existing lexer-masked/top-level numbered native interface shape already used by selected-interface identity. Fourteen focused join/lifecycle/full-publish tests pass; native rerun remains the authority for the end-to-end gate.
The following native attempt completed real Working validation of the edited descriptor, then correctly refused review extraction because its private destination lay outside the original source workspaceRoots. Reproduced that configuration mismatch in the registered command test. The internal review request now clones only its own workspaceRoots/cwd to the newly created owned snapshot destination, preserving DB/INI/scope and the original project configuration. CLI containment remains unchanged; eight focused publication regressions pass. The native coordinator is rerunning the same owned command; no target publication was reached in this failed attempt.
## Actual edited-source publication and native readback passed

The coordinator reran the registered Publish Workspace command against separate owned Unicode Source/Working/target databases using CLI 0.10 private candidate a957bce. The actual saved edit changed ProbeItem.name from String[50] to String[51]. Working validation and exactly one approved target load consumed identical frozen joined SCM/DDX/MUL bytes (SHA-256 33991377214318d9e2c746cf2f49c6dda5ad52a72a544fd9c1450058deb24c77). The Source extraction session released successfully for the target native.run load. No legacy Every path ran, busy state released and owned staging cleaned.

Independent native readback proved original fixture Source retained String[50], target contained String[51], and complete exposure/DDX hashes matched across both. Aggregate DDX SHA-256: 30ac0693996b5a59fee2df60194e62ac82f3172ff7e59d6f3c57de65c382e273. Exposure SHA-256: 94b983db082ece09297b1b497fd22c2e2e93bcde2dce7a9bf10dbf2e42a499e4. Compact public-safe receipt: tests/ProjectTools/receipts/owned-native-full-publish.json. No config, database path or native log is committed.

This proves actual edited native publication on the small Unicode fixture, not a 30,000-class performance/memory result, an atomic external-writer lease, an ANSI UI publication run, official release qualification or installation. Both-ABI native serializer matrices are independently owned by CLI #40. Current-head default/package/UI review evidence and the official CLI 0.10/new extension version release chain remain required.
## Review-display and actual Code UI evidence

A further failing-first review regression showed that native empty inherited Object/Application reference files can be advertised as added/deleted local classes when a source project omits them. Review catalogs now use the existing isEmptyInheritedType shape helper to suppress only those display rows. Substantive inherited overrides remain visible; extraction files, rename inventories and native publication inputs are unchanged. Eight focused publication/review tests pass.

One actual isolated Code Development Host screenshot was captured and visually inspected: docs/screenshots/full-workspace-publish/source-progress-ui-simulation.png. The changed progress notification clearly says "Hashing and comparing source content". The window title, document and output explicitly label simulated protocol/no database. This verifies real UI rendering only: no Jade/native process or database was opened, and no user extension installation changed. The private host/profile/extension staging closed and were cleaned. Compact receipt: tests/ProjectTools/receipts/source-progress-ui-simulation.json. Reproducible opt-in harness: tests/SourcePullIntegration/SourcePullIntegration_progress_ui_fixture.cjs with JADE_TEST_CODE pointing to the existing Code executable. Actual native correctness is established separately by the edited publication/readback receipt, not this screenshot.
## Official complete-workflow feature package prepared

CLI #40 merged with owner approval and published stable v0.10.0 at reviewed main 41b5816025a0dc23a5db7fdc3b6382b5f78cb2f0. The native coordinator independently verified the complete release/tag/archive/runtime hashes. The extension-owned bounded updater then downloaded and verified that official archive directly into this feature branch; its pin binds ZIP 173283d0ae189a640425010ff3b8caf485be8d108ac4a61fa4f9a4ab4759ba7e and raw distribution manifest fc1e359bdc25d0af7c9eefad41b0324b6af68dcee110fb2602e4737a52638b34.

This complete workflow is versioned 0.22.0 with minimum CLI 0.10.0, feature-only notes and corrected extraction/publication instructions. The existing release-note test first failed with missing 0.22.0 notes, then passed after adding them. Final local default suite: 1,154 passed / 45 explicit connected skips plus 18 isolated PowerShell contracts. Official pin/raw receipt/runtime verification, VSIX packaging, extracted no-Node/database-free discovery and release metadata passed. Local VSIX SHA-256: 7e06244514a89a2bf48b2db8269f19b54e866caf0e9ef43dabfa4df923f46b24. Compact binding: tests/ProjectTools/receipts/official-cli-0.10-package.json.

Prior real native edit/publication/readback proof stays explicitly bound to private candidate a957bce; it is not relabelled as an official-asset execution. Exact official-package native compatibility is being handled separately by the native coordinator. Hosted current-head CI and fresh Codex review remain required before owner approval. No user installation or Source publication is part of packaging.