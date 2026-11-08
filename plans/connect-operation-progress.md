# Connect operation progress and repeated activation

Issue: [#47](https://github.com/darrenhull/Jade-VSCode-Extension/issues/47)

## Observed behavior

The native InspectionSession already joins concurrent target preparation. A tests-first reproduction confirms three rapid Connect calls invoke target preparation once, but request the catalogue three times. Before preparation completes, the extension discards native output from inspect.target and has not yet set its inspection lock. The user receives little feedback while Source backup and Working restore run. This does not establish that repeat clicks caused every native backup failure.

## Implementation

1. Reproduce the pending-preparation window using a gated fake native operation. Assert one native preparation, one whole Connect operation, immediate progress, and no replacement operation after cancellation.
2. Share the complete Connect promise, including catalogue loading and command error presentation. Set a dedicated UI connecting context immediately; do not add another native connection manager or scheduler.
3. Forward the existing native output callback through inspectionTarget/resolveNative. Show actual output stages in VS Code progress, without guessed percentages. Keep Source/Working labels accurate and reflect Connecting/Cancelling in the existing database view.
4. Pass an AbortSignal to the existing request cancellation mechanism. Cancellation targets only this request, keeps the UI busy, and awaits the original native result. Native code owns the safe backup boundary; no force-stop, recovery, new-folder workaround or global shutdown is added.
5. Invalidate pending work safely on configuration changes, target changes, explicit disconnect, disposal and operation handoff. Preserve native failure causes and permit a deliberate retry after completion.
6. Verify focused/default regressions, exact packaged CLI receipt/hashes and portable no-Node discovery. Capture the actual running UI in a private VS Code host with gated fake preparation; explicitly distinguish that UI proof from a native backup test. Clean owned host artifacts.

## Validation

Initial red tests found three catalogue loads and no progress. Focused coverage verifies output forwarding, owned-request cancellation, safe-boundary waiting, repeated-click sharing, retry, Source labels, stale progress, configuration changes and pending controls. All 11 focused cases pass, including window disposal during pending preparation. The full default suite passes 966 JavaScript tests and 18 PowerShell checks (43 explicit opt-in skips); the packaged VSIX passes exact native hashes and portable discovery without Node or a database connection. Actual private-host screenshots cover backup, restore and pending cancellation; the gated fake resolver records one preparation for three joined Connect commands and keeps the operation pending until the original step completes. No developer database is opened by these tests.
