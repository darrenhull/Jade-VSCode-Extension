# Host-test artifact lifecycle checkpoint

Development-only change on `codex/agent/test-artifact-lifecycle`, based on approved main `c3bc61e`. No user feature version or native dependency changes.

Implemented a finally-owned disposable stage, 2 GiB free-space admission check, bounded compact evidence, private native context for every host mode, direct owned Code process/PID registration, cancellation/timeout handling, graceful verified native shutdown and process-exit confirmation before removal. Refuses changed ownership, symlinks and live survivors. It never inventories other runs or user folders.

TDD: lifecycle import was initially RED, then four child lifecycle cases RED before implementation. Eighteen small tests now pass, including actual host-script success/failure wiring with a fake Code child and tiny fake extension. No Jade database, real Code window, large fixture or broad cleanup was used. Full hosted CI remains the next gate. Existing Temp cleanup approval-review rejections were not retried.

No reusable database cache is introduced; future caches must follow the root policy under `%LOCALAPPDATA%/JadeTools/test-cache`. The per-run free-space check is not an atomic cross-process disk reservation. Compact reports are kept outside Temp in ignored `evidence/`.
