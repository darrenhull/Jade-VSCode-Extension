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
