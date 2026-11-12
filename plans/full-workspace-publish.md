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