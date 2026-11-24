# PR 143 delivery status

- Owner: Codex, on behalf of @darrenhull.
- Branch: codex/agent/git-first-setup-ux; issue: #144.
- Implementation: Source-free Git-first setup, runtime detection, existing Working reconciliation and fail-closed capability checks complete.
- Dependency: official Jade CLI 0.11.4, release source 391214971efc53cd159d71032bc1fb4db603b483.
- Package: extension 0.23.4; VSIX SHA256 1887bd84944a84ced1eabba5e906b2743d3994f710a563b2cd31979a06b5a574.
- Current verification before review fixes: 90 focused tests passed; actual bundled CLI configless checkout preview passed without a database; extracted VSIX portable smoke and exact manifest/EXE verification passed.
- TDD: actual CLI 0.11.3 refused the configless checkout; the same regression passes against the official bundled 0.11.4.
- Review fixes: four current-head findings addressed with red/green lifecycle coverage; 309 tests pass and 2 expected skips. Replacement VSIX portable smoke and exact official runtime verification passed.
- Follow-up review: native file-only configuration discovery selects explicit project mode; a later explicit project supersedes remembered defaults; private-state writes commit before active selection changes. Production-style fixtures and actual native read-only discovery pass.
- Outstanding: current-head hosted checks and automatic Codex review after push; actual running VS Code setup screenshot. Human review and auto-merge remain withheld until these gates clear.
- No extension installation, Source publication, merge or release performed.

- Latest review fixes: missing remembered runtime settings prompt detection again; uncommitted configuration is isolated to the setup call chain. Bundled upstream README caveat is documented on the PR; authenticated native payload is preserved.
