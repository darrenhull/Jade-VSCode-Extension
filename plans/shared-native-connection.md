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
- [ ] Replace the approved 0.4.3 dependency with a verified official shared-connection CLI release after its approval. The tested candidate is not an official pin.
- [ ] Complete final 0.18.0 version/release notes, official-bundle packaging and current-head checks/review. Only then request owner approval and protected squash merge.

## Verification

Red-first regressions cover lazy-open deduplication, idle ownership, own-request cancellation, stale native epochs, old target replies, config changes, explicit Disconnect versus cancel/dispose, and shutdown when the shared service closes first. The complete run after rebasing onto approved main passed **952 JavaScript tests and 18 PowerShell contracts**, with **43 explicit optional skips** and zero failures. The final official-bundle update will be checked separately. Default tests explicitly skip the opt-in licensed native fixture.

The reusable `tests/CliInspectionTransport/CliInspectionTransport_native_tests.test.js` passed against the coherent candidate in 44.88 seconds. It requires `JADE_SHARED_ADAPTER_FIXTURE`, `JADE_SHARED_ADAPTER_CLI`, and a private `JADE_TOOLS_STATE_DIRECTORY` within a disposable `jade-cli-integration-seed-*` fixture. The fixture supplies SharedConnectionPet and SharedConnectionTestsA/B. Every edited source file is restored and only the fixture broker is shut down; Source is never published.

| Observed operation | End-to-end | Native evidence |
| --- | --- | --- |
| Source / prepared Working startup | 834 / 760 ms | Separate native read-only identities |
| Test A -> B -> A | 1261 / 1185 / 1180 ms | Native runs 1159 / 1089 / 1092 ms; each selects one test, completes and passes; same epoch |
| Method-only build | 430 ms | Native load 342.8 ms, reconnect 0 ms; same epoch |
| Independent Scratch runs | 5134 / 5011 ms | Distinct output tokens; automatic handoff and lazy reopen |
| Structural change | 11416 ms | Reorganisation/load 8850.6 ms; reconnect 517.6 ms; changed epoch |
| Working disconnect | Succeeded | Source retains its native epoch |

Startup figures use an already prepared fixture, not a cold backup. Initial structural setup is separate from warm test reuse. Test reports contain real per-method outcomes and native log evidence, rather than cached execution results.

Tested candidate receipts:

- Executable SHA256: `a59cc61e6792614469b144b98c677b71ca03e185c195b416d43b3f6ad113b487`.
- Manifest SHA256: `a40efe74dc14c11a79134729e9f28ee89a054f1c96711ef89abaebfcebc289b0`.

These identify an unreleased candidate, not the official 0.4.3 distribution. The candidate was staged only in owned private VS Code profiles. The user's installed extension and windows were not replaced, closed or reloaded by this proof.

## UI and debugger evidence

The existing private debugger host passed breakpoint/F9 registration, stepping, string results, native stack, selected-frame locals, object expansion, cycles and native collection keys. The `--shared-connection` host additionally passes inspection-before-debug handoff, refusal to replace a paused debugger, and lazy inspection after debugging. It owns its profile, broker and cleanup. The corrected target-status host rerun also passed. Sanitized receipts are committed in `docs/verification/shared-native-connection.json`.

Visual inspection found a real target-status defect: the CLI's typed configuration does not include a UI-only `selection` field. A failing regression reproduced the connected view's incorrect settings prompt; the fix derives that presentation field from the original selected target. Corrected screenshots are stored under `docs/screenshots/shared-connection/`.

The architecture Draw.io and SVG remain editable and synchronized. The installed Draw.io exporter returned without writing output, so the skill's XML/vector fallback was used. Embedded XML round-trips to the source and an isolated Edge render was visually verified. Owned render profiles were removed afterward.

## Delivery status

Actual adapter and private debugger/mixed-role proofs are complete. Final delivery waits for the approved official native bundle, final consumer packaging/checks and automated review. PR #44 remains Draft and owner review/auto-merge are withheld until those gates clear. A successful private candidate proof does not imply that the globally installed extension includes this feature.
