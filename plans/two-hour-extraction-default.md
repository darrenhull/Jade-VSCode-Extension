# Two-hour extraction default

Closes #80. The user requested a 7200-second extension default after a large source export hit the one-hour cutoff.

1. Add failing behavior checks for the contributed setting, native extraction fallback and full streaming request. Preserve explicit overrides.
2. Set the extension default to 7200 seconds, share the fallback between its extraction paths, and explicitly forward it in streaming requests so the CLI's independent one-hour default cannot take over when configuration omits the field. Do not change native helpers or the standalone CLI default.
3. Update current setting help/README and 0.22.4 release notes. Preserve range validation, cancellation and source-file protection; leave historical release notes intact.
4. Run focused extraction/protocol tests, package/integrity/no-Node smoke and inspect the actual Settings UI in an isolated extension-development profile. Include evidence. Batch one final push, then hosted CI and automated review before owner approval. No live database access or user-profile installation.

Object Explorer loading on the large workspace is an additional investigation; it must not delay this small default change or expand its product scope.