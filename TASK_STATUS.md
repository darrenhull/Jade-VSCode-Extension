# PR 143 delivery status

- Owner: Codex on behalf of @darrenhull; branch codex/agent/git-first-setup-ux; closes issue #144.
- Extension 0.23.4 now pins official CLI0.11.6; minimum required CLI0.11.6. The normal release installer records the verified archive and manifest receipt.
- Saved Git JOX setup uses native discovery and machine runtime settings, creates or reconciles private Working without creating jade.json or extracting Source, and preserves explicit project modes.
- Every checkout, including complete explicit projects, stages a separate provider and CLI owner. Rejection preserves shared snapshots, configuration and editors. Acceptance adopts cold state or refreshes an identical live provider after acceptance.
- Reviewed sync requires qualified sync plus reviewedWorkingSync, sends expectedWorkingIdentity, revalidates settings/configuration before native dispatch, and requires matching report.reviewedWorkingIdentity. Native refusal preserves original no-write evidence.
- TDD: the setup ownership and reviewed-sync regressions were reproduced before fixes. A qualified ANSI nativeScratch=true distribution exposed a previous hardcoded false-only validator; a new failing test now passes while malformed/mismatched producer declarations remain refused.
- Validation: normal repository tests passed: 1,911 passed, 52 intentional skips, no failures across 1,963 cases; normal VSIX packaging succeeded. No additional manual release/VSIX/build-agent verification gate. Prior focused setup suite passed101 tests with2 intentional skips.
- Delivery: push then Ready/fresh Codex review while hosted CI runs; human owner review remains protected. No merge, extension publication, normal installation or Source publication performed.

- Fresh review follow-up: initialization rechecks native configuration and settings after inspection release/progress entry; dirty live projection editors are refused before review and before dispatch without implicit saves; retained-stage cleanup is inside acceptance rollback. All three regressions were RED before fixes;50 focused tests now pass. Changelog matches CLI0.11.6 and qualified ANSI Scratch.

- Acceptance-order follow-up: changed-view creation is reported as Working-created without persisting/adopting a rejected provider; a memento that mutates before storage rejects is restored within the rollback block. Both cases reproduced RED, then109 focused onboarding/provider tests passed.

- Latest lifecycle review: failed fork shutdown remains owned and propagates to parent shutdown; native Working creation is recorded before a closed-folder rejection. Detected checkout machine paths persist privately per folder and survive registration reload, with explicit VSCode settings taking precedence; Source detection remains unchanged.221 focused tests pass including private-state rollback and actual status-only process ownership. Hosted README presentation failure corrected.

- Native outcome/scoping follow-up: private runtime fallback applies only to an accepted configless checkout or a natively resolved Git-first project whose exact configuration-file bytes remain unchanged. Source-backed configuration receives no stale checkout fallback. Sync refusal/success evidence is captured before folder checks and survives later acceptance failures. Three cases were RED before fixes;200 focused tests pass.

- Private-default finalization: preview and staged provider share explicit-settings precedence; accepted records persist only detected runtime defaults plus an exact configuration fingerprint, never explicit overrides. Reload restores only an unchanged natively accepted Git-first file. Three cases reproduced RED;203 focused tests pass.

- Final discovery merge cases: a changed accepted explicit Git-first file cannot silently reaccept its old detected defaults; missing-path detection merges into the already resolved configuration so selecting a seed does not discard a valid installation. Both cases were RED, then205 focused tests passed.

- Cleanup acceptance checks now revalidate the open folder and reviewed configuration after retained-stage shutdown. Independent private-state restores are all attempted even if one fails, preserving original failure and aggregated cleanup evidence. Both review cases and the adjacent configuration-change race reproduced RED;208 focused tests pass.

- Explicit-project preview now starts with no unaccepted private defaults and captures its exact file fingerprint before asynchronous discovery. Dispatch/acceptance recheck that reviewed fingerprint; persisted acceptance uses the reviewed value. New-file and byte-only edit regressions reproduced RED, then211 focused tests passed. PR remains Ready while fixes are reviewed under the updated process.

- Runtime/session ownership follow-up: explicit detected defaults persist only in their fingerprint-bound accepted record; configless defaults require an accepted configless checkout. Adopted projects own their dedicated CLI fork, release it on folder retirement/replacement/disposal, and reopen with a fresh fork. Failed release remains visible; shared-session reopen cycles still release native scopes. Review cases reproduced RED;313 focused tests pass. PR stays Ready.

- Stage allocation now rechecks the open folder after native preflight and cleans partial construction before a binding exists. Abort attempts every cleanup, releases its lease, and aggregates all failures with the original native error. Three new cases reproduced RED;316 focused tests pass.

- Preview requires both qualified sync and reviewed-target enforcement before offering existing-Working confirmation. Unknown-profile discovery fails closed for detected configless checkouts; explicit files may use the existing native profile-repair initializer, then must retry discovery successfully before choosing a flow. Failed repair retains the original discovery cause. Three cases reproduced RED;319 focused tests pass.

- Successful native profile repair restarts complete preview discovery once, including settings and exact-file baselines. A repair that rewrites the file is reviewed as the repaired project rather than rejected against the old fingerprint; repeated unknown-profile failures do not loop. Regression reproduced RED;320 focused tests pass.

- Temporary setup workspace forwards the shared inspection-release hook dynamically before sync. Reviewed settings/configuration are still checked after release, so reopening inspection cannot bypass release or the reviewed-target guard. Regression reproduced RED;321 focused tests pass.

- Checkout operations now await an in-flight refresh keyed by the live previous project (and any staged refresh), then recheck folder/configuration before dispatch. Working reopen also rechecks after capability discovery. Held-refresh overlap and post-refresh changed-review cases reproduced RED;323 focused tests pass.
