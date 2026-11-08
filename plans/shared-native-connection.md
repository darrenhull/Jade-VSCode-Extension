# Reuse the native connection across IDE tools

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/34

## Outcome

Open the requested project's native connection when it is needed and reuse it while healthy. Object Explorer, compilation, tests and Scratch Pad must not require manual disconnection simply because the user changes tools. Source and Working remain distinct targets. This change adds no connection dashboard, scheduler, queue UI or connection setting.

## Native boundary

The existing C++ CLI broker owns native connections, request ordering, cancellation and actual reconnection. The extension already owns one CliWorkingSession; inspection currently bypasses its operation service through an exclusive helper lease. Route inspection through the existing `inspect.*` service namespace instead, using the original project configuration and explicit target. Do not send an already-resolved Working configuration as Source configuration, and do not implement a second connection manager in JavaScript.

Native implementation and disposable proof are prerequisites: read-only inspection must retain its native read-only guard while sharing a compatible Working node with execution. Native connection identity/epochs must reject stale cursors after structural reconnection. The first existing inspect.catalog request confirms actual native read-only readiness and returns an additive opaque connectionEpoch. Reuse that initial catalogue once for an exact matching UI request; later catalogue requests go to native code. Do not infer a database connection merely from the CLI stdio process. The native proof remains a prerequisite; no unsupported command is shipped as a placeholder.

## Implementation sequence

1. Write red-first adapter and ownership regressions. Prove that an idle inspector does not claim the extension's active-operation flag and that switching ordinary tools does not call global disconnect.
2. Replace the inspector helper lease with a thin transport over the shared CliWorkingSession. Reuse native target/configuration identity, native OID capability and explicit read-only confirmation; preserve errors, source locations and request cancellation.
3. Remove automatic inspection/native disconnect hooks from normal compile, test and Scratch Pad preparation. Retain exclusive handoff for external native utilities, publication, reset and the debugger helper lease. A paused debugger must never be silently terminated.
4. Preserve database selection, schema/project identity, history snapshots, cursor release and close/dispose behavior. Configuration changes must not reuse another target's connection or accept stale replies.
5. Verify actual native cross-tool reuse and A -> B -> A tests against disposable Working data. Tests execute every time; successful input/session reuse is not cached test results. Verify structural close/reopen using CLI #13, read-only Source inspection and debugger handoff.
6. Commit this plan with code and grouped tests, and bundle only a verified compatible native CLI. Keep the PR Draft while implementation or required native proof is incomplete. Mark Ready to trigger Codex once verified, resolve all current-head findings, then request owner approval behind protected checks.

## Verification ledger

Red-first regressions run before product edits: the connected idle Object Explorer claimed global execution ownership (true instead of false), and Scratch Pad preparation disconnected the inspector and retained native helper (two releases instead of zero). Both tests failed for the intended behavior. Native mixed-role shared-node proof has now passed in the native owner: a shared node supports read-only and writable thread-affine application processes with the read-only transaction guard intact. Eight thin service-transport tests pass for actual catalogue readiness, original-config/target identity, native capabilities, per-session close, own-request cancellation, stale replies and epoch changes. The adapter is not wired into product activation or bundled yet; ownership regressions remain red until integration. Record actual installed/package behavior and timing boundaries before review handoff.