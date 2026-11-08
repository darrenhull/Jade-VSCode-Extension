# Jade object lifecycle and updating-method guidance

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/42

1. Capture the creation-order and updating-method gaps with failing guidance-delivery tests before changing the skill.
2. Check official Jade 2025 create, constructor, delete, parameter, updating and transaction documentation; validate examples against the installed 25.0.02 runtime.
3. Extend the existing five attached guides, with a concise entrypoint and native examples. Use create before invocation, automatic create constructors, parameterised create expressions, intentional lifetimes and native cleanup. Explain updating self separately from transactions and constant/input/io/output semantics. The user clarified updating methods, not GUI editing instructions.
4. Compile and execute exact positive fixtures in a separate owned Working database; retain actual compiler/runtime failures for new, null invocation, missing constructor arguments, missing updating and constant-parameter mutation. No Source publication, recovery or reset.
5. Run grouped regression tests, package the unique 0.17.9 guidance preview with the verified official CLI 0.4.3, and verify installed attachment assets before a user-requested normal reload. Preserve custom/dirty project skills and host-skill metadata.
6. Commit this plan with the guidance, fixtures and evidence in its own linked PR. Mark Ready to trigger Codex once validated; fix findings and request owner approval only when current checks/review are clear.

## Evidence

Red: all 3 lifecycle guidance/delivery tests failed on the original bundle (missing examples and transaction distinction). Green: the same 3 tests pass after the guide changes, including actual managed project installation. Native fixture build and positive/negative execution verification remain in progress; this PR stays Draft until that evidence and packaging checks are complete.


Native Jade 25.0.2.19 proof (2026-11-08): all four class fixtures compiled in an owned Working clone. Creation/setter output was Moo: calf then Moo: Daisy; parameterised constructor Moo: Bessie/base,named; superclass forwarding base,named,derived; input/io mutations Daisy then calf; explicit ordinary initialiser calf then Explicit then true after deletion; persistent transaction Stored. Deliberate errors were native 6027 (new), runtime 1090 (null invocation), 6451 (constructor arguments), runtime 1048 (persistent create outside transaction), 6097 (missing updating) and 6094 (constant parameter mutation). Native schema loader summarized the last two method diagnostics as loader exit 8510; original diagnostics were retained. Restoring valid sources compiled successfully after each failure. Source was never published.

Default regression: 971 tests plus 18 workflow tests passed, zero failures.
