# PR 143 delivery status

- Owner: Codex, on behalf of @darrenhull.
- Branch: codex/agent/git-first-setup-ux; issue: #144.
- Implementation: Source-free Git-first setup, runtime detection, existing Working reconciliation and fail-closed capability checks complete.
- Dependency: official Jade CLI 0.11.4, release source 391214971efc53cd159d71032bc1fb4db603b483.
- Package: extension 0.23.4; VSIX SHA256 d7a7e7e2a2ff9d7ec84aeabc3173701569cd5e3a759494245210eb4f2da9c387.
- Current verification: 90 focused tests passed; actual bundled CLI configless checkout preview passed without a database; extracted VSIX portable smoke and exact manifest/EXE verification passed.
- TDD: actual CLI 0.11.3 refused the configless checkout; the same regression passes against the official bundled 0.11.4.
- Outstanding: current-head hosted checks and automatic Codex review after push; actual running VS Code setup screenshot. Human review and auto-merge remain withheld until these gates clear.
- No extension installation, Source publication, merge or release performed.
