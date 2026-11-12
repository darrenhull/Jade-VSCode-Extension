# Deliver imported interface extraction support

Issue: https://github.com/darrenhull/Jade-VSCode-Extension/issues/73
Native implementation: https://github.com/darrenhull/Jade-CLI/pull/44

## User outcome and scope

Deliver the native imported-interface owner fix in one extension 0.22.2 package. Preserve complete extraction, local-edit/dirty-editor/conflict guards, native failure context and existing Source/Working boundaries. This is a small native distribution update with customer-facing release notes; no UI redesign, adapter rewrite, installation or user database operation is included.

## Implementation and provenance

1. Start from reviewed main 1d5c969 (extension 0.22.1), preserve the authenticated native-package -text guard, and synchronize root/extension/lock versions with exact 0.22.2 release notes.
2. Wait for the native owner to qualify the final CLI 0.10.2 candidate on both ABIs, including the reproduced imported-interface case, native inventory/export behavior and portable packaging. Do not copy an intermediate or stale dist.
3. Under the user's explicit direct-candidate authorization, verify the supplied archive hash, exact raw manifest and every runtime entry, then commit the complete distribution and pin with officialRelease:false, source repository, PR44 and exact source commit. Its version tag is an identity, not a claimed official release. Default CI/release packaging must reproduce the committed bytes without a local override.
4. Verify the actual 0.22.2 VSIX against all native hashes and tested diagnostic adapter bytes; exercise extracted no-Node/database-free discovery, release metadata and the default suite. Native DB proof remains owned by the CLI coordinator using owned fixtures.
5. Push the linked Draft promptly. Once local gates clear, mark Ready to trigger fresh Codex in parallel with hosted checks. Fix any findings; request owner review and protected squash auto-merge only after exact-head review/checks pass. Verify the merged main release, downloadable asset and component bytes separately. Do not install.

## Current checkpoint and remaining gates

The exact locally qualified0.10.2 candidate has now replaced the prior0.10.1 distribution. Final consumer package/default checks and current-head CI/review remain before owner approval; this is not a metadata-only update. Record the actual native source commit/hashes, native proof binding, final consumer tests, CI/review and release verification as they complete. Do not claim this consumer preparation itself reproduces the user's database or fixes every external native exception.

## Exact qualified native handoff

Bundled source commit34b00f0de7e0479ff615879f2e762ab56bcfe3f8 from CLI #44, version0.10.2. The actual archive and all17 contained files were independently verified before copying through existing bundleCli. ZIP SHA-256209ca595813c051f172a52e443756b824f13ad167aa621ca686acf3c4848c775; executable3f231118cc9309787e06104f890d2cbf3188d47b04efbfd840bb089bc559f935; exact rawmanifest8a04494c335273ec44241d634d5124fecfe8b36b98a54c6a2b02e62f9d0d107a. All15runtime hashes match. The complete tracked package/pin carries officialRelease:false and repository/PR/commit provenance; minimum CLI is0.10.2 and native-package -text remains unchanged.

Native proof binds both ABI helpers to exact stock-output parity (129ANSI/204Unicode artifacts), imported names/order/CLS, repeated unchanged mtimes, real local edits, selected Form CLS/DDX and native failure/cancellation. ProjectModel/SourceModel/SourceSectionIndex focused groups pass (16/6/1), including real-stock imported source staging fixes. Native imported Join exits0. Imported load1010 also occurs on the independent untouched stock native export/Join control, so this package does not claim imported Build/Publish success or hide that baseline fixture/runtime limitation. No 30,000-class native performance claim is made. Compact binding: tests/NativeBundle/receipts/imported-interface-cli-0.10.2.json.

Preliminary unchanged-client default verification passed1,164 tests/45explicit connected skips plus18PowerShell contracts before the native replacement. The final actual VSIX/native-byte/portable checks are run on the committed candidate; their final hashes/results are recorded in the PR and durable release-verification receipt, avoiding unnecessary runtime changes or review restarts.
