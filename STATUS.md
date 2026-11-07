# Jade Tools native object identity checkpoint

PR12 is rebased onto approved F5 main d3f8b98 (version 0.14.2). This update is version **0.14.3** and pairs the official native CLI **0.4.1** with the native-ID transport and Object Explorer adapters. Source and Working identities remain target/session bound. Native strings pass through unchanged; legacy packed IDs are accepted as input only and native response identities own history, titles and Copy ID.

The rebase preserves approved workspace-wide F5, explicit current-file compilation, active-snapshot saves, Scratch Pad, full CLS formatting, debugger/publish bindings and the complete host-artifact cleanup lifecycle. NativeObjectIdentity capability guards remain paired with the official manifest and runtime hashes.

## Conflict verification

- Actual approved-main host script plus combined mode tests reproduced three native-OID failures while 35 lifecycle and existing-mode cases passed.
- The merged script passes all 38 cases: formatting, Workspace, incremental and native-OID staging/report cleanup, real module dependency loading, stopped broker PID zero and surviving-process safety.
- The new host delta adds native-OID selection, private fixture staging, report path and mode exclusion while retaining incremental handling and all private contexts/finally cleanup.
- Full default suite: 422 JavaScript + 18 isolated PowerShell tests passed, 36 explicitly guarded tests skipped, zero failures.
- Official CLI receipt/runtime hashes and packaged 0.14.3 VSIX outside-checkout discovery without Node on PATH pass. No database is opened by these checks.
- Earlier connected Source/Working native-ID proof covers the unchanged official native helper. This rebase does not change its bytes or native runtime implementation.

Pending: exact-head hosted CI and fresh review-thread check. The coordinator independently performs the Ready/owner-review/protected squash handoff. Approval, publication and installation are separate states.

All source is under C:\Git\Jade-VScode. No user application file, Source database or GUI was changed by this conflict resolution. Tiny test stages are disposable and cleaned; compact logs stay in the managed local evidence directory. No large native fixture was created.
