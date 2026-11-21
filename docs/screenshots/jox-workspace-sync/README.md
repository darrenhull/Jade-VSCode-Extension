# JOX workspace sync: VS Code evidence

The original captures show the implemented command running in the VS Code Extension Development Host with a disposable local JOX fixture. No Jade database was opened for these three captures.

- [Current bundle](01-current-bundle-hidden.png): searching the Command Palette does not expose the command because the bundled CLI does not advertise JOX sync.
- [Qualified UI state](02-injected-capability-visible.png): an injected `sync: true` capability exposes the command in a trusted JOX workspace.
- [Progress and result](03-synthetic-sync-result.png): the command shows cancellable progress and a confirmed up-to-date notification after a synthetic broker response.

The injected states validate UI behavior, not the native loader or the packaged integration.

## Connected private VSIX

The installed private VSIX bundled CLI 0.11.3 with the locally qualified Jade 2025 R1 ANSI runtime. It created a real disposable Working database from the saved checkout without any application Source database, then reopened the accepted generation:

- [Review the checkout and Working target](04-git-first-setup-review.png).
- [Watch the native setup run](05-git-first-setup-progress.png).
- [Review the accepted generation before reopening](06-git-first-reopen-review.png).
- [See the completed setup and reopen](07-git-first-reopen-complete.png).

In the same fixture, the packaged CLI applied a checked-out commit from another branch and then a saved, uncommitted JOX edit. It refused an unsupported resource rather than reporting that Working was up to date:

- [Sync a checked-out commit](08-git-first-branch.png).
- [Sync one saved edit on top of the commit](09-git-first-saved-edit.png).
- [Show the reason an unsupported resource was refused](10-git-first-refusal.png).
- [Return to the original commit after removing the unsupported resource](11-git-first-recovered.png). After the previous isolated test broker released Working, a fresh extension host uploaded the restored checkout and confirmed the original commit with zero saved overlays.

These captures are connected release-candidate evidence for issue #136, not proof for the current public CLI pin or a future hosted binary.
