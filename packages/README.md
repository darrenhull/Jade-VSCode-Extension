# Pinned Jade CLI release

`jade-tools-cli-0.1.0.tgz` is the exact CLI release used by extension 0.11.0. It is intentionally committed so this repository builds independently, without a sibling CLI checkout or a separately installed Node runtime for end users.

SHA-256: `CB4B0345DB5E9EFE97A40065093A70EC38099006C7B1BF081AE67B83C56CE7F4`.

The archive contains `jade-cli.exe` with its runtime embedded, the shared SDK, owned native helpers, native helper sources and notices. Jade vendor DLLs, databases and private configuration are excluded. `package-lock.json` also pins the archive's integrity.

`npm ci` installs this local archive. `npm run bundle:cli` copies its runtime into the extension, and `npm run package` includes that bundle in the VSIX. Update the archive and lockfile together when upgrading the CLI; do not edit generated vendor files.
