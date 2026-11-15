# Shared source-cache deployment gates

Target consumer version: 0.22.11. This deployment contains the shared native Git source-cache consumer and the corrected official Jade CLI 0.10.8 bundle from [PR 64](https://github.com/darrenhull/Jade-CLI/pull/64).

The separate proposed Working fastpath is future native work and is not part of this deployment or its gates. Ordinary selected tests and Scratch Pad runs already avoid frontend browser scans and redundant preparation; native operation reports pass through unchanged. Generic stored operation receipts are never used as fresh startup source proof.

## Required current-head verification

1. Update the genuine official 0.10.8 pin, distribution, manifest and minimum CLI version together. Verify trusted release origin and every runtime hash.
2. Build the actual VSIX with that bundle; validate its contents and run the portable artifact outside the checkout without Node on PATH.
3. Capture and visually inspect the running final interface's changed Initialise Workspace output and cache-setting description. Include screenshots and exact package/native identities in the PR.
4. Confirm required hosted checks, linked issue 98 and current-head automated review. Request owner review only after those gates clear; preserve protected owner approval.

The existing focused consumer checks and independent source review cover this integration. Do not run the full suite or a large-workspace benchmark by default. Historical private-package receipts and earlier screenshots are not current-head evidence. Verification does not authorize Source publication or a user installation.
