# Jade VS Code extension

Independent development workspace for the Jade Native Runner extension. Version 0.12.0 migrates the backend to the native C++ Jade CLI while retaining the existing VS Code interface.

This repository preserves the 0.10.1 extension source and native behaviour as the migration baseline. The original research folders are not build dependencies. The Jade CLI is versioned independently and supplied as an explicit pinned package artifact committed under `packages/`; the extension must not import sibling checkout source paths.

The extension itself uses VS Code's JavaScript extension host. Its backend is the native C++ `jade-cli.exe`, with no embedded Node runtime or JavaScript compiler/broker implementation. A compatible installed Jade runtime is still required; Jade owns compilation and execution.

## Build and test

Building and testing this development checkout requires Node.js 22 or later and npm:

```text
npm ci
npm test
npm run package
```

The default test command excludes native database opt-ins. Packaged VSIX output is written to `dist`, which is not committed. Actual-host and connected-native controls require explicit configuration and private fixture databases; see the test scripts and the release verification notes.

Native development belongs to the independent Jade CLI repository. The pinned Windows x64 distribution lives in `packages/jade-cli-win-x64/`. Packaging verifies its native-runtime identity and every manifest checksum before copying the executable and declared helpers into the VSIX. It excludes the old JavaScript SDK and any undeclared runtime files. For explicit candidate validation, set `JADE_CLI_DISTRIBUTION` to a native distribution folder; normal independent builds use the committed package. There is no sibling-checkout search or JavaScript CLI fallback. Vendor Jade DLLs, vendor SDK headers and databases are not included.

## User workflows retained

- F5 compiles local native source in an isolated working database.
- Test Explorer, CodeLens and Ctrl+F5 run native Jade tests and report individual failures.
- Shift+F5 and the publish controls retain explicit target review and confirmation.
- Object Explorer provides schema/class/member navigation and reusable focused previews.
- Database Objects provides read-only Source/Working inspection and paged collections.
- The keyed collection designer creates native source; compilation and publication remain separate actions.
- The experimental debugger retains its existing pinned native-runtime capabilities and limitations.

See the [extension's detailed documentation](extension/README.md) and [changelog](extension/CHANGELOG.md) for the existing feature scope. Repository separation does not add the missing array/set/index designers or general debugger features.

## Repository boundaries

`Jade-CLI` owns the native C++ CLI, broker and backend. `Jade-VSCode-Extension` owns VS Code commands, editor integration, views, Testing and debugger presentation. `Jade-Local-MCP` is the separately implemented adapter using the official MCP SDK; it calls the same native CLI service.

This repository can be cloned and built independently. Existing packaged third-party notices are preserved; the repository does not grant redistribution rights to the vendor's Jade runtime.

## Migration acceptance

The CLI migration is accepted only after standalone CLI compilation/testing and the actual VS Code extension paths produce equivalent native results, including compiler errors, failed assertions, cancellation, warm reuse and session handoff. Packaging and installation must verify that the extension contains the pinned CLI artifact and can run without the sibling CLI checkout.

## GitHub Actions and releases

`main` is the default branch and the target for review pull requests. Your code-owner approval is required before merging; automation must open a PR rather than push product changes directly to `main`.

The build runs once for a pull request and once after its reviewed merge to `main`; feature-branch pushes run only lightweight PR automation. Manual validation remains available. The required `build` job tests and packages the VSIX, then exercises its extracted native CLI without Node on PATH or a database connection. A successful `main` build publishes a new package version and checksums to GitHub Releases, targeting that approved commit. Already published versions remain immutable: later merges verify their tag belongs to approved main and download/check their required assets before skipping publication. This does not publish to the VS Code Marketplace.

This repository owns consumer release automation. The native CLI repository owns the CLI and Jade integration. `node scripts/update-cli.cjs --verify-lock` checks the pin version/tag, the exact manifest digest recorded when the official ZIP was verified, and every native runtime hash, including required helpers and debugger ABI metadata. The ZIP checksum is an installation receipt; verification does not reconstruct an archive from installed files.

Hourly polling discovers stable official CLI releases using this repository's scoped `GITHUB_TOKEN`. The updater authenticates metadata requests, checks official asset URLs and checksums, bounds sizes, rejects unsafe entries and atomically installs verified files. A dependency update bumps the consumer patch version and matching manifests/lockfile, then opens a PR requesting owner review and queues protected squash auto-merge. Its normal PR workflow performs the full validation once. GitHub may require the owner to approve the first workflow run for a bot-created PR. There is no additional workflow dispatch or cross-repository secret. A reviewed merge publishes the new consumer version after the main build succeeds; no Jade database is modified by this automation.

## Architecture diagram

![Architecture](extension/media/architecture.drawio.svg)

[Edit the diagram in draw.io](extension/media/architecture.drawio). The SVG is the rendered companion to the editable source.
