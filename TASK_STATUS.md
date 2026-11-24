# PR 143 delivery status

- Owner: Codex on behalf of @darrenhull; branch codex/agent/git-first-setup-ux; issue #144.
- Feature: one-command setup detects saved JOX and machine settings, resolves explicit project modes natively, creates or reconciles private Working without creating jade.json or extracting Source.
- Dependency: exact official CLI 0.11.4, qualified source 391214971efc53cd159d71032bc1fb4db603b483; native payload unchanged.
- Package: extension 0.23.4; final VSIX SHA256 7c69ebb04f079a3cfb3098c3f7f5ce81e70aba981a4cfd4fd67a72c7f6e55a6c.
- Lifecycle: setup owns its temporary workspace/provider; existing shared providers remain untouched until native success and private-state persistence. Adoption rechecks folder/configuration/previous ownership; failed adoption restores private selection. Deferred refresh follows settlement.
- Verification: 339 relevant tests pass, 2 expected skips; actual pinned-CLI configless/explicit configuration regression passes without opening a database. Final extracted VSIX portable smoke and exact native manifest/runtime validation pass.
- TDD: actual old CLI refused the configless request; review findings and lifecycle safety cases were reproduced failing before fixes, then verified green.
- Outstanding: current-head hosted checks and fresh automated review after push; actual running VS Code setup screenshot. Human review and auto-merge remain withheld until these gates clear.
- Authenticated upstream CLI README has an outdated blanket disclaimer; the exact manifest and extension README accurately describe ANSI checkout qualification. No mutation of authenticated vendor bytes.
- No normal extension installation, Source publication, merge or release performed.

- Final boundary cases: infer checkout only with VS Code Git membership; natively recheck reviewed mode/config before operations; stage machine settings until native success with scoped rollback; preserve missing-profile repair. No installed-extension connected-test gate was added.

- Settings ownership and watcher regressions: native paths expand independently from raw saved values; compare-and-swap prevents overwriting user setting edits; only successful owned writes roll back. Adoption recreates watchers in accepting workspace; temporary setup creates none.

- Timing regressions: preview settings baseline precedes asynchronous discovery/preview; deferred detection snapshots raw/effective settings before any picker and rejects concurrent selection edits.

- Activation handoff regression: real automatic Sync registration now probes capabilities without binding the shared project; the first setup remains cold, while accepted source refresh updates availability. Live Source guards remain unchanged.

- Acceptance remains atomic when watcher creation fails: resources prepare before ownership transfer. Runtime repair retains resolved installation/seed fields and prompts/persists only missing fields.

- Explicit project configuration is re-resolved before acceptance and again after awaited persistence; changes during native initialization or private-state write roll back without adopting a stale provider.

- Complete explicit checkouts also run post-native discovery without a staged binding. Deferred guard/write/rollback calls fetch fresh WorkspaceConfiguration snapshots between field writes.
