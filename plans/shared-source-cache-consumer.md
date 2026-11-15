# Shared native source-index consumer

This extension adapts the native format-2 source index described by [Jade CLI issue 60](https://github.com/darrenhull/Jade-CLI/issues/60). The native CLI owns Git discovery, source proofs, Working preparation and all shared-cache writes. Browsing metadata remains advisory and cannot establish successful compilation, test execution or publication.

## Implemented consumer behavior

- The existing CliWorkingSession supplies one lazy, database-free capability query. Unsupported capabilities report an update/initialization action; shared mode never falls back to a second index or JavaScript writer.
- SourceIndexCache validates root, repository, object format, native version and parser identity. Saved metadata uses its original raw-byte digest, including UTF16 source; no timestamp is invented as source proof.
- Startup asks native preparation once for each root, then checks the returned ready Git generation against the owning v2-0.json header before and after reading shards. Unchanged saved models need no source read. Changed rows are read and parsed; deleted rows disappear while unsaved open editors remain.
- Explicit Initialise Workspace and Class View refresh use one native refresh for the selected root, and pass that immediate receipt into the cache reload. Receipts from older build/test operations cannot replace fresh startup proof.
- Optional browsing updates are bounded native deltas with digest checks, canonical Windows paths and validated accepted/stale acknowledgements. Source bodies and scratch snapshots are never persisted in browsing metadata.
- Ordinary build/test commands preserve selected and owned dirty-source saves, abort on save failure, and leave complete discovery to native preparation. Selected tests do not await a whole-browser rebuild. Scratch Pad retains its existing exact snapshot and saved dependency semantics.
- Debug keeps its existing source discovery for source maps. Publication retains its separate reviewed snapshots and target guards.

## Evidence and delivery status

The source implementation reuses the prior consumer branch, rebased by cherry-pick onto current main 1ba36b1. The integration's focused cache/input/diagnostic/setup/Scratch Pad/test/debug checks passed: 174 total, 171 passed, three explicit connected skips, zero failures. These default checks open no database.

Receipts and screenshots named private/candidate or referring to older source/native hashes are historical evidence for those exact candidates. They do not verify the final deployment branch or official release.

See [deployment gates](shared-source-cache-activation.md) for what remains before this Draft deployment PR can become Ready.
