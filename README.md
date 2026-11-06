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

The Build and release extension workflow runs the default tests and packages a Windows-tested VSIX on pushes, pull requests and manual runs. Before uploading it, `scripts/smoke-vsix.ps1` extracts that VSIX outside the checkout and checks bundled native CLI test discovery with no Node on PATH and no database connection. A version tag such as `v0.12.0` publishes that tested VSIX and `SHA256SUMS` to GitHub Releases. The tag, root package and extension manifest versions must match, and the tagged commit must be on reviewed `main`. Tags on unmerged feature commits cannot publish. This does not publish to the VS Code Marketplace. Hosted CI does not run connected Jade tests or access a developer database.

This repository owns CLI-consumer release automation; the CLI repository owns only the CLI and Jade integration. `node scripts/update-cli.cjs --verify-lock` verifies the pinned native manifest and all runtime hashes. Updates use this repository's `scripts/update-native-cli.ps1`. Other consumers can reuse the same implementation through an explicitly pinned extension automation checkout and `JADE_NATIVE_UPDATER_SCRIPT`. The updater accepts only official stable CLI releases, verifies the ZIP checksum, bounds download and expanded sizes, rejects unsafe archive entries and validates every native manifest hash before atomically replacing the runtime. Downgrades are rejected. Native updates must pass tests and package the VSIX before opening a reviewable dependency PR. They must not merge themselves, publish an extension or modify a Jade database.

CI is explicitly dispatched on the update branch; validation does not depend on pull-request events created by `GITHUB_TOKEN`. The repository must allow Actions to create pull requests. Hourly updates use only this repository's scoped `GITHUB_TOKEN`, so no cross-repository secret is required. Immediate dispatch from a different repository requires a GitHub App or token with access to this repository; polling is the default link.

After review and merge, publish a new extension release by bumping both package versions and the lockfile, commit the change, then push its matching version tag. The CLI is independently versioned and remains pinned in `packages/`; downloading a newer CLI does not silently replace the extension's backend.
## Architecture diagram

![Architecture](extension/media/architecture.drawio.svg)

[Edit the diagram in draw.io](extension/media/architecture.drawio). The SVG is the rendered companion to the editable source.
