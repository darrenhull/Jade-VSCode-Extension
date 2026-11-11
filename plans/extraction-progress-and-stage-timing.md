# Accurate extraction progress at large database scale

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/59

Keep existing native batch extraction and source safety intact. Distinguish native process activity from discovery, actual snapshot hashing, organization, comparison, application and editor refresh. The observed CLS count is only a native-stage observation, never a hashed or completion count. Use monotonic elapsed stage durations; throttle progress and stop recursive observation once native execution exits. No percentage without a real total.

Tests first reproduce the stale native label and prove actual hash counters, failure/cancellation isolation and stage transitions. Existing worker cancellation, conflict, dirty-editor and unchanged-source tests remain required. Use disposable filesystem fixtures; no developer database or installed environment changes. Default tests do not run a 30k export. This fixes reporting, not native extraction throughput or incremental export. Screenshot evidence must show the running host and distinguish fixture execution from real Jade work.

## Final behavior and validation

The optional native lifecycle observer is presentation-only: exceptions cannot replace the original native result. Snapshot discovery and completed hash/byte counters update in O(1) per file; UI emission is throttled to 250ms plus stage/final events. Leaving native extraction closes its watcher and prevents further directory scans, including a pending scan reverting the display. The stage clock uses performance.now; logs record monotonic milliseconds and readable durations. Application remains synchronous and non-cancellable as before; its notification paints first and dirty editors are checked again immediately before application. Refresh is separately visible even when no source changed.

Red evidence: three new focused cases failed on the prior code (stale native observation after phase change, observed count retained on comparison, absent post-exit hash events). Green evidence covers original timeout/cancel, snapshot cancellation, actual native-exit/hash counters, observer exceptions, 30k throttling, late scan, dirty editor review and unchanged source bytes/timestamps. The full default suite passed 1,051 JavaScript tests (43 explicit skips) and 18 PowerShell tests. No developer database was opened.

The opt-in `tests/PullProgress/PullProgress_host_fixture.cjs` runs the changed product progress function in an owned, isolated real VS Code host. Counts are explicitly synthetic, and this is not an end-to-end native extraction or performance test. Hashing and refresh screenshots are under docs/screenshots/extraction-progress. Both were visually inspected; private host/user-data directories were removed after exit. Run with JADE_TEST_CODE pointing to Code.exe. No installed extension, user workspace or runtime configuration is changed.
