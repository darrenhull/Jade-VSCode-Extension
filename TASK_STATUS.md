# Scratch user-schema patch0.23.5

- Owner: Codex on behalf of @darrenhull; branch codex/agent/scratch-schema-session from main d933c56; closes issue145.
- Minimal extension adapter change: prepare an operation-owned native source snapshot with the selected schema before workspace.run. The CLI remains unchanged at0.11.6.
- Shared Explorer provider configuration/snapshot stay unchanged. Native Working identity is checked across schema selection; captured private source/session owns execution, cancellation and cleanup.
- TDD: actual adapter/provider regression reproduced the published RootSchema refusal because native execution uses cached prepare configuration and ignores a later schema-only run override. The schema-bound prepare→run case now emits distinctive output; cancellation and identity refusal regressions pass.
- Normal test workflow:1961 passed,52 intentional skips,0 failed across2013 cases.
- Connected ANSI25.0.1 proof: Scratch compiled/executed in CliJoxManagedF4Schema and emitted SCRATCH_0235_USER_SCHEMA_NATIVE_OUTPUT; no source upload, shared provider preserved. Setup123399ms; Scratch4463ms (JADE client3549ms).
- Git A→B proof: exactly one controlled method file synced in the same Working identity d40d9bc72dfc29c04cee391e, zero saved overlays and clean HEAD/tree. Planned B test produced the expected native assertion failure, confirming B actually executed despite sync not claiming readiness. Sync137195ms; B test8690ms. No separate readiness bug found.
- All owned processes exited, approved vendor seed unchanged, disposable DB/checkout removed. Small local evidence retained outside Temp; no developer Source was configured/opened or published.
- Remaining: one normal package build, bot-authored linked PR, current-head hosted CI and automated review. Keep PR Ready while checks run. No merge/publication or redundant manual artifact verification.
