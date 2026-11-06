# Pinned native Jade CLI

`jade-cli-win-x64/` contains the official native C++ CLI release pinned in `jade-cli-pin.json`. It is committed so this repository builds independently and end users do not need Node or a sibling CLI checkout.

The pin records the release version/tag, the verified official ZIP SHA-256 and the SHA-256 of its exact extracted `distribution.json`. The archive checksum is an installation receipt. The raw manifest digest and declared executable/runtime hashes verify the installed payload; required helpers and debugger ABI metadata must be present.

`node scripts/update-cli.cjs --verify-lock` validates this contract. Packaging copies only the verified native distribution into the VSIX. Vendor Jade DLLs, databases and private configuration are excluded. Future official CLI releases are proposed through reviewed dependency PRs; successful reviewed main builds publish a new consumer version. Published versions are never overwritten.
