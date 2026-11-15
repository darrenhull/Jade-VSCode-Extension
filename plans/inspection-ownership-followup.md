# Inspection configuration and connection ownership follow-up

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/90
Base: official main20e12f169a175326483dc62854054c70466c1d68 (released0.22.7). Do not alter the released tag or its artifacts. This is a new0.22.8 patch; the official CLI0.10.5 payload remains unchanged.

## Two post-merge findings

Forget selected cached runtime configuration before resolving current settings. A previously connected B could therefore be deleted after the selected workspace was changed to A and disconnected. Separately, a normal same-context Browse Instances request advances browseVersion for UI freshness, while native connection readiness treated that display counter as connection ownership and rejected the valid joined connection. Both were corroborated after PR89 merged;0.22.7 was not fresh-review-clear.

## Narrow repair

Keep selected workspace context in the existing inspectionScope when settings invalidate currentConfig; retain no stale runtime values. Forget resolves current settings for that selected scope, even while the old connection is finishing cancellation. Use one shared builtin workspace-membership guard when resolving a pinned inspection folder or Forget's selected folder. If the workspace has actually been removed from VS Code, reject before reading global/another-folder configuration, starting a new native connection or deleting a secure entry. Recheck workspace membership immediately before deletion. Offline Source/INI paths do not block Forget; no new filesystem/database existence checks are introduced.

Native connection ownership uses the existing captured connectionOperation identity, session generation, selected target, abort signal and disposal state. The browse display counter continues to guard browse requests, choosers and stale actions, but opening a chooser or joining the same connection does not invalidate native preparation/readiness. Real configuration, project and target transitions still cancel through the existing session/operation lifecycle and respect the native safe boundary. No new scheduler, store, registry or token framework is added.

Standard SecretStorage, scoped Forget, accepted replacement ordering, anonymous access, empty passwords and native authorisation remain unchanged. The application may still deny a class; these fixes do not establish that customer application credentials are authorised. Native-login hashing investigation is separate.

## Verification

The first ten regression scenarios on official main produced seven assertion failures and three passing negative controls. Failing cases: savedA/B selection after settings changes; selectedworkspaceA with an unrelated activeeditor; removed workspace; superseded asynchronous configuration; Forget during old B preparation cancellation; shared Working preparation; and preparation completing while its browse chooser remains open. The negative controls retained opposite-target, cross-project and actual-configuration-change cancellation. The fixture uses immutable configuration snapshots matching the real adapter and an opt-in automatic fake-client close, avoiding a manual test-only shutdown gate being mistaken for a native hang.

After the minimal repair, all ten pass. Additional cases cover the earlier configuration-resolution boundary while the browse chooser is open and Connect after a pinned folder has been removed; the latter was separately reproduced red before adding the shared guard. The A/B Forget proof explicitly uses unavailable Source/INI paths. Final affected checks:187 tests,186pass and1connectednativeopt-inskip across ObjectExplorer, object UI/30k catalogue, native-transport and SecretStorage groups, without opening a database. Full default checks, new packaged0.22.8 proof/UI, current-head CI and fresh automated review are integration gates owned by the coordinator and packaging worker. No user installation, Source change, database operation or immutable release mutation is authorised by this follow-up.

## Final local integration evidence

Independent review accepted the minimal source change and selected-workspace scope guard. One final regular JavaScript phase passes1313total:1267pass,46explicitnativeopt-inskips, zero failures on unchanged official CLI0.10.5. Unchanged PowerShell/C++ phases were not repeated. Version0.22.8 metadata moves together; no native payload/pin changes.

The actual0.22.8 VSIX passes all pinned native hashes, exact current source/manifest/README/changelog byte identity and extracted CLI discovery outside the checkout with no Node on PATH and no database connection. A committed separate companion drives the unmodified packaged extension with real VS Code SecretStorage and allowlisted fake native replies. It savesA+B, changesB back toA and proves Forget removes onlyA before reconnect; the same Working connection then finishes preparation while the actual Browse chooser remains open and serves the selected class/instance with one preparation. All four screenshots were visually inspected by worker and manager. Owned hosts exited and their private profiles were cleaned.

The companion’s initial observation issue was a Windows module-cache path spelling mismatch; corrected only in test instrumentation, without product changes or security fallback. Compact exact source/image/artifact hashes and limits are in docs/test-evidence/inspection-ownership-0.22.8.json. This does not establish licensed native backup performance or customer application authorization. Earlier unchanged initialization evidence is explicitly historical. Current-head hosted checks, fresh review, owner approval and patch release remain delivery gates.
