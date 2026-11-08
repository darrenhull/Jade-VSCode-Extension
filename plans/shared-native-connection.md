# Share native connections across IDE tools

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/34
Draft implementation: https://github.com/darrenhull/Jade-VSCode-Extension/pull/44

## Outcome and boundaries

Open a configured target when needed and reuse its healthy native connection. The user should not disconnect Object Explorer manually before compilation, tests, Scratch Pad or debugging. Source and Working remain separate. No connection dashboard, scheduler, queue UI or normal-workflow setting is added.

The existing C++ CLI broker owns lifecycle, FIFO ordering, cancellation and native reconnection. The extension presents those operations through its existing `CliWorkingSession`; it does not implement a second connection manager. Compilation, tests and native read-only inspection can share one Working node using separate thread-affine application contexts. Source inspection retains its own native read-only node.

Structural loads, Scratch Pad and debugging use automatic native handoff followed by lazy reopening. Scratch Pad keeps the supported non-GUI Jade client so `write` output is delivered reliably. It does not claim uninterrupted physical-node reuse. Native FileCapture on a retained Object Manager node did not flush until node finalization; public documentation provides no supported force-flush or output-binding API. No private replacement or source rewriting was introduced.

## Implementation checklist

- [x] Write failing ownership/adapter tests before product changes. An idle inspector incorrectly claimed global operation ownership, and Scratch preparation disconnected two healthy native contexts.
- [x] Replace the exclusive inspection helper lease with a thin adapter over existing `inspect.*` operations. Send original project configuration plus explicit Source/Working target, not an already-derived Working configuration.
- [x] Use the first `inspect.catalog` response to confirm actual native read-only readiness, native OID format and opaque connection epoch. Reuse that catalogue once for an identical UI request; subsequent reads are native requests.
- [x] Remove automatic disconnects from normal compile, test and Scratch preparation. Preserve explicit native handoff for publication, external utilities, reset and debugger ownership.
- [x] Preserve target-qualified navigation, native cursor ownership, cancellation, shutdown and settings/project-file changes. Reject stale epoch replies without replaying old object IDs.
- [x] Distinguish explicit physical Disconnect from logical cancel/disposal. `inspect.close` with `args.disconnect:true` releases only the selected idle target. The backend refuses to terminate another consumer and cleans only the caller's context. It does not create a missing Working database merely to disconnect it.
- [x] Verify real native A -> B -> A execution, method-body reuse, structural reconnection, independent Scratch output and Source/Working separation in a disposable fixture.
- [x] Verify private VS Code debugger regression and inspection handoff: preserve a paused debugger, stack/frame locals, object expansion, cycles, native collections and subsequent lazy inspection reopening.
- [x] Commit this plan, source, grouped tests and editable/rendered architecture together. Capture actual changed UI in an owned private host.
- [x] Adopt the approved official CLI 0.5.0 release, verify its archive/executable/manifest and all runtime hashes, and require CLI 0.5.0 as the minimum supported native backend.
- [x] Prepare coordinated 0.18.0 version and user-facing feature-only release notes; verify the existing release-notes contract red then green.
- [x] Build the 0.18.0 VSIX with the official bundle, verify its extracted payload outside the checkout without Node or a database, and run the actual packaged extension in a private VS Code host.
- [ ] Complete current-head hosted CI/automated review, then request owner approval and protected squash merge. Live review status belongs in PR #44.

## Verification

Red-first regressions cover lazy-open deduplication, idle ownership, own-request cancellation, stale native epochs, old target replies, config changes, explicit Disconnect versus cancel/dispose, and shutdown when the shared service closes first. The complete run after rebasing onto approved main passed **952 JavaScript tests and 18 PowerShell contracts**, with **43 explicit optional skips** and zero failures. The same complete suite passed with the final official 0.5.0 bundle. Default tests explicitly skip the opt-in licensed native fixture.

The reusable `tests/CliInspectionTransport/CliInspectionTransport_native_tests.test.js` passed against the final official CLI 0.5.0 in 62.79 seconds on a fresh disposable Working database. It requires `JADE_SHARED_ADAPTER_FIXTURE`, `JADE_SHARED_ADAPTER_CLI`, and a private `JADE_TOOLS_STATE_DIRECTORY` within a disposable `jade-cli-integration-seed-*` fixture. The fixture supplies SharedConnectionPet and SharedConnectionTestsA/B. Every edited source file is restored and only the fixture broker is shut down; Source is never published.

| Observed operation | End-to-end | Native evidence |
| --- | --- | --- |
| Source / first Working startup | 1283 / 18534 ms | Separate native read-only identities; Working includes initial private backup/restore preparation |
| Test A -> B -> A | 1281 / 1170 / 1179 ms | Native runs 1178 / 1080 / 1090 ms; each selects one test, completes and passes; same epoch |
| Method-only build | 446 ms | Native load 368.6 ms, reconnect 0 ms; same epoch |
| Independent Scratch runs | 4916 / 5060 ms | Distinct output tokens; automatic handoff and lazy reopen |
| Structural change | 11511 ms | Reorganisation/load 8870.2 ms; reconnect 543.6 ms; changed epoch |
| Working disconnect | Succeeded | Source retains its native epoch |

The first Working startup includes cold private backup/restore preparation; it is not a warm per-test cost. Initial structural setup is separate from warm test reuse. Test reports contain real per-method outcomes and native log evidence, rather than cached execution results.

Official CLI 0.5.0 receipts:

- Approved release commit: `12b654c12319a28691e3667d08468759d5153f68`.
- Archive SHA256: `284477707cb64f09c1387bd3d3c7d6a6ddddf1807efe721fd24b9e8d1eb50925`.
- Executable SHA256: `fde8fd8cc41631bdb9f2f2b81f682b5109e497b9c014d7c3ad1a419f42648175`.
- Manifest SHA256: `3e287506e10866f2a1ce375e75556e9d0023b4ddd88653c05c159fb166e7e344`.

The extracted VSIX matches that official pin and every runtime hash. Its portable test discovers workspace tests with no Node on PATH and no database connection. The actual packaged 0.18.0 extension passes in an owned private VS Code host. The user's installed extension and windows were not replaced, closed or reloaded. Earlier candidate receipts remain explicitly historical in the sanitized verification JSON.

## UI and debugger evidence

The existing private debugger host passed breakpoint/F9 registration, stepping, string results, native stack, selected-frame locals, object expansion, cycles and native collection keys. The `--shared-connection` host additionally passes inspection-before-debug handoff, refusal to replace a paused debugger, and lazy inspection after debugging. It owns its profile, broker and cleanup. The corrected target-status host rerun also passed. Sanitized receipts are committed in `docs/verification/shared-native-connection.json`.

Visual inspection found a real target-status defect: the CLI's typed configuration does not include a UI-only `selection` field. A failing regression reproduced the connected view's incorrect settings prompt; the fix derives that presentation field from the original selected target. Corrected screenshots are stored under `docs/screenshots/shared-connection/`.

The architecture Draw.io and SVG remain editable and synchronized. The installed Draw.io exporter returned without writing output, so the skill's XML/vector fallback was used. Embedded XML round-trips to the source and an isolated Edge render was visually verified. Owned render profiles were removed afterward.

## Delivery status

Implementation, official native pin, default tests, portable VSIX smoke, actual native adapter and packaged private debugger/UI proofs are complete. Push verified work, finish repository automation, then mark PR #44 Ready to trigger automated review. Resolve all current-head findings before requesting owner approval or protected auto-merge. Live checks and approval are tracked in PR #44; this plan does not claim that a global installation or release has occurred.
