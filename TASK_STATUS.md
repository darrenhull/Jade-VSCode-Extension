# JOX activation fix0.23.7

- Owner: Codex on behalf of @darrenhull; branch codex/agent/debugger-manifest-activation; closes issue149.
- Official0.23.6 released VSIX reproduced a real VSCode activation exception before opening Jade: its manifest does not declare jade-native-experimental, but JOX registration attempted to register that adapter.
- Fix: register the adapter only when this extension actually owns the debugger contribution. Keep unqualified debugging and breakpoint advertising disabled; preserve the explicitly declared adapter route and native qualification checks.
- TDD:2 ownership controls failed before the fix; all13 focused registration/debugger regressions passed afterward.
- Real isolated VSCode candidate host (official package plus only the guarded module) activated and reached disposable8JOX Working setup. Connected setup/sync/Scratch/test and current-head package CI are still pending at this checkpoint. No Source database configured or published.
- Keep PRDraft until connected evidence and normal CI pass; then trigger fresh automated review and request owner review after findings are addressed. Auto-merge remains off. No release or user installation performed by this branch.