# Pinned Jade CLI build

`jade-tools-cli-0.1.1.tgz` is the exact CLI build bundled by extension 0.11.1. It is committed so this repository builds independently, without a sibling CLI checkout or a separately installed Node runtime for end users.

SHA-256: `AC20474CB885E19AC5752987CFA97616F8EB3AAB84A4D144A0CCB2271474409C`.

The archive contains `jade-cli.exe`, the shared SDK, owned native helpers, native helper sources and notices. Jade vendor DLLs, databases and private configuration are excluded. `package-lock.json` pins this archive's integrity.

`npm ci` installs the local archive. `npm run package` includes its runtime bundle in the VSIX. Future CLI release updates are validated by the shared updater, tested and proposed through pull requests; they do not merge or publish themselves. Keep the archive and lockfile together when upgrading.
