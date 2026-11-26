# Jade Tools 0.23.10 — direct Working setup capability hotfix

- Fixes released 0.23.9 setup refusing the bundled CLI because it incorrectly required the legacy vendor-seed checkoutInitialization capability for existing Working mode.
- Both setup preview and provider initialization now require initialization, sync and reviewedWorkingSync for existing mode; explicit legacy git-first still requires checkoutInitialization. No CLI bytes or disabled legacy capabilities are changed.
- RED→GREEN tests use the real official CLI 0.11.8 doctor response. Direct setup preview reaches overwrite review before initialization; controlled initialization verifies reviewed identity and consent. Missing direct capability flags remain refusals.
- Actual published 0.23.9 VSIX reproduced doctor checkoutInitialization:false with initialization/sync/reviewedWorkingSync:true and successful native working.location for an owned root-schemas identity-only fixture. No working.initialize request or Jade DB open occurred. Disposable profile, broker and fixture were cleaned.
- Focused direct/legacy regression suite:168 passed, zero failures. Standard0.23.10 VSIX packaging passed (210 files,12.55MB). Current-head CI/review accompany the hotfix. Auto-merge off; owner approval required.
