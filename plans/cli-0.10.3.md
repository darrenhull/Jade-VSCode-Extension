# Bundle official CLI 0.10.3

Closes #78. Follow-up to source extraction issue #77 and Jade-CLI PR #45.

1. Use the maintained native updater against official release v0.10.3, published 13 November 2026. Verify trusted URLs, SHA256SUMS, archive bounds, distribution version and every runtime hash. Expected official ZIP SHA256: 37aefcd58faed940c5986dc0553c9c267656dadf4f60420cebc426d511da6a90.
2. Bump the consumer patch version from 0.22.2 to 0.22.3 with the maintained version script. Add matching release notes. Do not change protocol/UI behavior, workflows or the installed environment.
3. Check the dependency pin, run the full default extension tests, package the actual VSIX, validate release metadata and run the extracted no-Node smoke. Compare the VSIX runtime bytes with the verified official distribution, including both source helpers already qualified natively on the CLI PR.
4. Batch the final code/distribution/version/notes/verification receipt into one push and bot-authored Draft PR. Finish exact-head CI, then mark Ready for fresh automated review. Request human approval only after that review is clear. Do not merge or install on the user's behalf.

The CLI fix changes only conflicting physical filename references through native indexes. Both native class identities and serialization remain unchanged; local edits/deletions remain protected. CLI #45 includes connected ANSI/Unicode extraction, repeat, indexed staging, Join and reload evidence. No additional live database operations are needed for this consumer-only update.