# Shared source-cache deployment gates

Target consumer version: 0.22.11. Keep the single deployment PR Draft until its actual native dependency and current-head checks are verified.

## Native dependency

The source checkpoint deliberately retains the last official extension pin, Jade CLI 0.10.6. It is not a shippable package with that older pin. The existing consumer requires format-2 source refresh/prepare/browser-update capabilities and native Git setup confirmation.

[Jade CLI PR 64](https://github.com/darrenhull/Jade-CLI/pull/64) corrects Git-root/path handling. The approved native follow-up will use compact verified Working and Git proofs to skip unchanged index/model preparation and inspect changed candidates only. That follow-up is a native responsibility; this source checkpoint does not claim it is implemented, released or measured.

After the final native work is reviewed and released, update the official native pin, distribution and manifest together in this same deployment PR. Verify trusted release origin and every manifest hash; use its actual version and release identity. Do not label a private candidate as an official release or create a separate dependency deployment PR for the same work.

## Required current-head verification

1. Rerun targeted consumer and actual native-process cache/Git-setup controls against the final matching distribution. Preserve dirty buffers, literal paths, changed/deleted source handling, cancellation, error positions and owned broker exit/cleanup.
2. Build the actual VSIX with the verified final native bundle. Validate contents and hashes and run the portable artifact outside the checkout without Node on PATH.
3. Capture and visually inspect the running final interface's changed Initialise Workspace output and cache-setting description. Include the current screenshots and exact package/native identities in the PR.
4. Confirm required hosted checks, linked issue and current-head automated review. Request owner review only after those gates clear; preserve protected owner approval.

Use focused local checks. Do not run the full suite or a large-workspace benchmark by default. Historical private-package receipts and earlier screenshots are not current-head evidence. Build/test/verification never authorize Source publication or a user installation.
