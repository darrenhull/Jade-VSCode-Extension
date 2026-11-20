# JOX workspace sync: VS Code evidence

These captures show the implemented command running in the VS Code Extension Development Host with a disposable local JOX fixture. No Jade database was opened.

- [Current bundle](01-current-bundle-hidden.png): searching the Command Palette does not expose the command because the bundled CLI does not advertise JOX sync.
- [Qualified UI state](02-injected-capability-visible.png): an injected `sync: true` capability exposes the command in a trusted JOX workspace.
- [Progress and result](03-synthetic-sync-result.png): the command shows cancellable progress and a confirmed up-to-date notification after a synthetic broker response.

The injected states validate UI behavior, not the native loader or the packaged integration. Connected verification with the qualified CLI and a disposable Working database remains part of issue #136.
