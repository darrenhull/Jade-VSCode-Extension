# Jade VS Code extension

Independent development workspace for the Jade Native Runner extension. Version 0.11.1 is a release candidate that routes native operations to the separately packaged Jade CLI while retaining the existing VS Code interface.

This repository preserves the 0.10.1 extension source and native behaviour as the migration baseline. The original research folders are not build dependencies. The Jade CLI is versioned independently and supplied as an explicit pinned package artifact committed under `packages/`; the extension must not import sibling checkout source paths.

End users do not need a separate Node.js installation. The extension includes the standalone `jade-cli.exe` and its runtime files; a compatible installed Jade runtime is still required.

## Build and test

Building and testing this development checkout requires Node.js 22 or later and npm:

```text
npm ci
npm test
npm run package
```

The default test command excludes native database opt-ins. Packaged VSIX output is written to `dist`, which is not committed. Actual-host and connected-native controls require explicit configuration and private fixture databases; see the test scripts and the release verification notes.

Native helper development belongs to the independent Jade CLI repository. Its production sources and portable native build script reproduce the helpers supplied in the pinned CLI package. Rebuild/repack the CLI, update the explicit package artifact here and then package the extension. Vendor Jade DLLs, vendor SDK headers and databases are not included. Any locally retained compatibility sources or binaries are not an alternative active backend.

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

`Jade-CLI` owns the shared native backend and CLI implementation. `Jade-VSCode-Extension` owns VS Code commands, editor integration, views, Testing and debugger presentation. `Jade-Local-MCP` owns the future MCP adapter and remains a planning scaffold until separately implemented.

This repository can be cloned and built independently. No remote is configured by the local workspace split. Existing packaged third-party notices are preserved; the repository does not grant redistribution rights to the vendor's Jade runtime.

## Migration acceptance

The CLI migration is accepted only after standalone CLI compilation/testing and the actual VS Code extension paths produce equivalent native results, including compiler errors, failed assertions, cancellation, warm reuse and session handoff. Packaging and installation must verify that the extension contains the pinned CLI artifact and can run without the sibling CLI checkout.

## GitHub Actions and releases

The Build and release extension workflow runs the default tests and packages a Windows-tested VSIX on pushes, pull requests and manual runs. A version tag such as `v0.11.1` publishes that tested VSIX and `SHA256SUMS` to GitHub Releases. The tag, root package and extension manifest versions must match, and the tagged commit must be on the approved default branch. Tags on unmerged feature commits cannot publish. This does not publish to the VS Code Marketplace. Hosted CI does not run connected Jade tests or access a developer database.

Update pinned Jade CLI checks the latest stable [CLI release](https://github.com/darrenhull/Jade-CLI/releases) hourly. It can also be run immediately from Actions with a `cli_tag`, or by a `jade-cli-released` repository-dispatch event. The shared CLI SDK updater verifies official release URLs, SHA-256, archive paths, package identity and version before changing the committed archive. The lockfile, tests and VSIX are verified before an update pull request is opened. The update never merges itself, publishes an extension, or modifies a Jade database.

CI is explicitly dispatched on the update branch; validation does not depend on pull-request events created by `GITHUB_TOKEN`. The repository must allow Actions to create pull requests. Hourly updates use only this repository's scoped `GITHUB_TOKEN`, so no cross-repository secret is required. Immediate dispatch from a different repository requires a GitHub App or token with access to this repository; polling is the default link.

After review and merge, publish a new extension release by bumping both package versions and the lockfile, commit the change, then push its matching version tag. The CLI is independently versioned and remains pinned in `packages/`; downloading a newer CLI does not silently replace the extension's backend.
## Architecture diagram

![Architecture](extension/media/architecture.drawio.svg)

[Edit the diagram in draw.io](extension/media/architecture.drawio). The SVG is the rendered companion to the editable source.
