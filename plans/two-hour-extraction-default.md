# Two-hour extraction default

Closes #80. The user requested a 7200-second extension default after a large source export hit the one-hour cutoff.

1. Add failing behavior checks for the contributed setting, native extraction fallback and full streaming request. Preserve explicit overrides.
2. Set the extension default to 7200 seconds, share the fallback between its extraction paths, and explicitly forward it in streaming requests so the CLI's independent one-hour default cannot take over when configuration omits the field. Do not change native helpers or the standalone CLI default.
3. Update current setting help/README and 0.22.4 release notes. Preserve range validation, cancellation and source-file protection; leave historical release notes intact.
4. Run focused extraction/protocol tests, package/integrity/no-Node smoke and inspect the actual Settings UI in an isolated extension-development profile. Include evidence. Batch one final push, then hosted CI and automated review before owner approval. No live database access or user-profile installation.

The user subsequently requested all fixes in PR #82. The final 0.22.4 change also includes the disposable .jade source index, Object Explorer first-load improvements and explicit indexing status, covered by plans/object-explorer-first-load.md and issue #81.

Validation: three intended RED failures (setting, native fallback, streaming forwarding); 24 focused tests GREEN. Full suite1166 passed/45connected skipped plus18PowerShell contracts. Packaged VSIX/native integrity/no-Node smoke and release checks pass. Actual packaged Settings UI in a new private profile reports defaultValue=7200 and effectiveValue=7200; screenshot docs/screenshots/extraction/two-hour-default.png. Receipt docs/verification/two-hour-extraction-default.json. User profile and database were not modified.
