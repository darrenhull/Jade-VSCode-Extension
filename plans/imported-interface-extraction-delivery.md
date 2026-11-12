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

The version/notes/plan are prepared against main while native PR44 qualification continues. The current distribution remains the previously released 0.10.1 candidate until the final 0.10.2 handoff is verified; this Draft must not be merged as a metadata-only release. Record the actual native source commit/hashes, native proof binding, final consumer tests, CI/review and release verification as they complete. Do not claim this consumer preparation itself reproduces the user's database or fixes every external native exception.
