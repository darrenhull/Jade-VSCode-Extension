# Local test completion reporting

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/95

The registered executeLocalTests command returns undefined when another IDE operation owns the busy flag. Test Explorer converts that absent result into a generic incomplete-method error, and no output is recorded. Scratch Pad owns the same flag while preparing/running. This is a deterministic product bug; it is not yet proof of the reported customer failure's exact cause.

- [x] Trace extension command, Testing outcomes, CLI native helper and log parser.
- [x] Reproduce the undefined busy result and exact generic Testing error with the actual registered callback. Completed native result without user writes remains passing.
- [x] Return and forward an explicit not-started result when busy; preserve the existing operation and all individual outcomes.
- [ ] Verify focused tests, full default suite, actual package/portable checks and actual UI evidence.
- [ ] Manager review, issue-linked PR, current-head CI and fresh review before owner approval.

No customer code/database is executed. Native parsing/assertions/framework behavior is unchanged unless separate evidence establishes a native defect. Jade Tests output is the diagnostic source; missing user-code writes do not imply missing test results.

Focused result: two intended busy regressions RED before the repair, then five command/result controls GREEN plus five existing discovery/batching/debug tests (10 total). The minimal guard adds no native execution or timeout changes. Combined UI/package/default-suite verification is owned by the issue94 integration worker before delivery.

Follow-up user report: independent test execution also remains pending indefinitely. The busy guard is a separate proven reporting defect, not an explanation or fix for that hang. Native lifecycle/deadline investigation continues separately.

Two additional held-promise regressions reproduced blank Testing output during source resolution/input discovery and while the native result is pending. Fixed stage/elapsed lines now reach Jade Tests and Testing output once at each boundary, without claiming native method execution has started. Seven focused controls and five existing discovery/batching/debug tests pass (12 total); native pass/failure messages remain unchanged.

The approved real ANSI control matrix on official CLI 0.10.6 passed: first assertion-only test 15,001ms; Working inspection held during unchanged test 1,185ms and method-body incremental load/test 1,717ms; trivial Scratch Pad 5,277ms and 4,993ms with inspection held. An explicit false assertion without user writes completed in 2,868ms with one per-method failure. This small fixture did NOT reproduce the independently reported customer hang. No shared-inspection pump/reset change is justified. Owned databases, backup, Temp assembly and native processes were cleaned; the public-safe receipt is tests/LocalTestCommand/receipts/windows-native-controls.json.

Final logging boundary: an additional held setContext(false) regression reproduced a native result already received while the UI cleanup promise remains pending. Result-received, releasing and released stages are distinct; ownership and existing awaits are unchanged. Eight focused controls plus five existing regressions pass (13 total). The independent customer hang remains unresolved.

Combined verification at source 24755b4: 1,303 regular tests passed, 47 explicit native opt-in skips, 18 isolated PowerShell tests passed and zero failures. The 0.22.10 VSIX passed official native runtime integrity, all 116 packaged JavaScript module byte checks, metadata/readme/changelog identity and outside-checkout no-Node discovery. Three actual unmodified packaged UI states were captured and visually inspected with a separate controlled-response companion: pending preparation, busy tests with their cause, and confirmed completion. The owned host exited and private profile was removed. This is not native execution/performance proof; the customer hang remains unresolved. See docs/test-evidence/scratch-pad-feedback-0.22.10.json.

The scoped reporting/cancellation delivery is tracked by https://github.com/darrenhull/Jade-VSCode-Extension/issues/96. Issues94/95 and CLI58 remain open for the genuine unreproduced native hang.
