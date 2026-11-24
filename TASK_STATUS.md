# PR 143 delivery status

- Owner: Codex on behalf of @darrenhull; branch codex/agent/git-first-setup-ux; issue #144.
- Feature: one-command setup detects saved JOX and machine settings, resolves explicit project modes natively, creates or reconciles private Working without creating jade.json or extracting Source.
- Dependency: exact official CLI 0.11.4, qualified source 391214971efc53cd159d71032bc1fb4db603b483; native payload unchanged.
- Package: extension 0.23.4; final VSIX SHA256 d8a34a91af2cff5a22e10a18aa2f40e16cb9af13b35e81f763ac583c6570e654.
- Lifecycle: setup owns its temporary workspace/provider; existing shared providers remain untouched until native success and private-state persistence. Adoption rechecks folder/configuration/previous ownership; failed adoption restores private selection. Deferred refresh follows settlement.
- Verification: 315 relevant tests pass, 2 expected skips; actual pinned-CLI configless/explicit configuration regression passes without opening a database. Final extracted VSIX portable smoke and exact native manifest/runtime validation pass.
- TDD: actual old CLI refused the configless request; review findings and lifecycle safety cases were reproduced failing before fixes, then verified green.
- Outstanding: current-head hosted checks and fresh automated review after push; actual running VS Code setup screenshot. Human review and auto-merge remain withheld until these gates clear.
- Authenticated upstream CLI README has an outdated blanket disclaimer; the exact manifest and extension README accurately describe ANSI checkout qualification. No mutation of authenticated vendor bytes.
- No normal extension installation, Source publication, merge or release performed.
