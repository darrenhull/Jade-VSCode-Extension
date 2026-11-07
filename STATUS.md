# Jade Tools extension delivery checkpoint

Approved main baseline: 5a8d359 (merged host-artifact cleanup, Scratch Pad, Jade Tools branding and complete CLS formatting, version0.14.0).

## F5 changed-source build — PR11

F5 builds new and changed native sources in the owning workspace plus native-required dependencies. Dirty native source buffers are saved first. Unchanged input skips native loading. **Jade: Compile Current File** remains explicit and focused. Publishing remains separate and Source is not updated by this build operation.

Rebased onto approved cleanup main, preserving Scratch Pad configuration/diagnostic fixes, native F5 guard, formatter, branding and debug/publish bindings. Version0.14.2 reserves the next patch after the independent OID0.14.1 update; reconcile the latest approved main before release. The native pin remains main's verified official CLI0.4.0, without a downgrade or an artificial OID dependency.

Verification after rebase:

- Focused command/protocol/workspace ownership/save tests pass.
- Native CLI proof passes:8 initial inputs,0 unchanged loads, focused file excludes an unrelated error, workspace build reports native6026 on that original file, recovery includes a new class and unchanged load returns0.
- Actual isolated VS Code API host passes dirty-buffer saves, focused current-file behavior, original-file Problems, recovery and new/unopened-source inclusion. Private host/broker exits verified.
- Full default suite after approved cleanup integration:409 JavaScript +18 isolated PowerShell tests passed;36 connected/interactive tests explicitly skipped by default.
- Packaged VSIX receipt, native runtime hashes and outside-checkout no-Node test-discovery smoke passed.
- A real copied-INI safety regression was RED before adding shared preflight to the native/API test entry. Foreign mutable directories and missing journal/transient paths are rejected before native work. No production Source database was opened.

This is compile-scope/keybinding behavior, without a new visual control or layout; actual VS Code API/native diagnostic proof verifies the behavior. The user explicitly waived a new F5 screenshot; no CUA or native database was opened for this conflict resolution.

The late active extraction-snapshot regression remains fixed: both compile modes save the selected source first and abort before native work on save false/throw. Its eight regressions pass after rebase. Official CLI0.4.0 receipt/runtime hashes and the version0.14.2 VSIX outside-checkout/no-Node smoke pass. Scratch Pad implementation and formatter files are unchanged from approved main.

The subsequent CLI host-staging review finding is fixed: CLI, Workspace and incremental host modes all receive the private INI validator required by their integration fixture. The regression executes the actual host script and staged fixture modules with a tiny disposable seed and an intercepted process launch. Before the fix CLI mode failed with MODULE_NOT_FOUND while the other two modes passed; after the one-line copy-condition fix all three pass. No native process or database was opened by these regressions.

Pending: exact current-head hosted CI/review, protected owner approval, release and installation. The coordinator owns Ready/review/merge actions and verifies remote state; passing local tests alone is not delivery.

## Relocation

Relocated to C:\Git\Jade-VScode; the coordinator repaired and verified all Git worktrees. This worktree uses the new path. All Temp test fixtures are disposable and their small staging copies are cleaned after each regression. The user application source and stable MCP installation remain separate from this repository.


## Inherited approved host-artifact lifecycle

The approved HostTestArtifacts helper is unchanged, including finally cleanup, 2 GiB free-space admission, bounded compact evidence, private broker contexts, stopped-PID-zero handling and refusal to delete artifacts while an owned process remains alive. The incremental mode now uses that same lifecycle rather than restoring the old launcher.

Conflict-integration TDD ran the actual approved host script before adding incremental mode: four incremental checks failed while eight existing-mode checks passed. After adding incremental selection, fixture staging, report path and default-fixture exclusion, all 38 focused lifecycle/staging checks passed. These use tiny fake host fixtures, not a Jade database, real Code window or large copied fixture. The final VSIX receipt/runtime hashes and extracted no-Node discovery also pass.

No reusable database cache is introduced. The per-run space check is not an atomic cross-process reservation. Compact reports remain outside Temp in ignored `evidence/`; all small regression stages are disposed after each test.
