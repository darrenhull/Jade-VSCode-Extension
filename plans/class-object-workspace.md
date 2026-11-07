# Class & Object Workspace

Implementation plan for [story #30](https://github.com/darrenhull/Jade-VSCode-Extension/issues/30), **Build an integrated class and object workspace**. Overall complexity: **XL**. Status: planned; this document does not implement the feature or mark the story complete.

## Outcome

Connect existing class discovery to one reusable class page with a searchable grouped member rail and focused detail canvas. Edit resolved local methods through the real source document. Browse instances, stored objects and collections through the existing read-only native inspection flow while retaining identity, selection and navigation history.

At narrow widths, replace the rail with the same searchable member picker. Keep workspace source and runtime snapshots visibly distinct. Local saving, compilation and publication remain separate actions.

## Contracts to establish before implementation

1. **Shared editing:** the method canvas and Open Original Source must use one real TextDocument, revision, dirty state and undo history. Prove completion, diagnostics and navigation through supported VS Code APIs. Do not assume that the native editor can be embedded in a webview, or maintain an independently saved method buffer.
2. **Whole-file saving:** Save and configured Auto Save save the entire backing source document, including other unsaved method changes in that file. Label the document being saved. There is no new method-only save or partial-file publication operation.
3. **Incomplete edits:** temporarily invalid source, incomplete delimiters and parser failures during typing must retain the active editor, text, selection and undo history. A transient parse failure must not redirect to Overview. Handle a confirmed external removal/rename using the story's notice and recovery behaviour.
4. **Keyboard ownership:** member-search shortcuts apply only in their relevant context. They must not intercept code typing, editor completion dismissal, native undo/redo or save shortcuts.
5. **Identity and persistence:** class state is project/workspace + schema + class, preserving import identity; runtime state also retains connection, database, Source/Working target, session generation and native object ID. Persist navigation state, never database credentials or supposedly live object sessions across reloads.

These clarify the current acceptance criteria. Any decision that changes the accepted UX must be agreed and reflected in the story before implementation.

## Delivery sequence

| Phase | Size | Deliverable | Depends on | Completion gate |
| --- | --- | --- | --- | --- |
| 1. Editing architecture proof | L | A supported real-document method editing path with source-range mapping and language integration | None | Actual VS Code proof of shared edits, undo/redo, save, dirty state and recovery; architecture decision recorded |
| 2. Class workspace and discovery | M | Stable identity header, Overview, grouped member navigation, all-page search and Back to Classes state | Phase 1 interface decisions | Packaged workspace-class navigation and duplicate-identity regressions pass |
| 3. Method editing and source lifecycle | L | Production editor binding, source changes/conflicts, incomplete edits, safe save and reload behaviour | Phases 1 and 2 | Packaged two-surface editing, failure and unsaved-protection checks pass |
| 4. Runtime context and inspection | L | Explicit class-to-instance bridge and integrated read-only object/collection pages | Phase 2 identity/history contracts | Existing native read-only sessions and cursor lifecycle retained; target isolation proven |
| 5. Scale, compact UX and accessibility | M | Bounded rendering, member picker, keyboard focus, themes and zoom | Stable class and inspection flows | 30000-class/10000-member checks, keyboard-only use and required responsive states pass |
| 6. Release verification and documentation | M | Final packaged checks, actual screenshots, user guide and release notes | All previous phases | Current-head CI and review clear; Ready for owner approval; release/install verified separately |

After Phase 1 settles the interfaces, class-navigation work and read-only inspection integration can proceed independently. Source lifecycle work and UI presentation can then use the same documented binding contract. Keep changes in isolated branches/worktrees when assigning parallel implementation work.

## Phase 1: prove the editing architecture first

- [ ] Inspect the existing source preview, language providers and document lifecycle. Identify reusable behaviour before adding modules.
- [ ] Compare supported TextDocument-backed custom editors and native-editor compositions against the proposed canvas. Prefer an established editor component and a small document bridge over custom editor mechanics.
- [ ] Prove exact method-range offsets into the original source, including CRLF/LF, Unicode, methods before/after the selection and a signature/body changed while typing.
- [ ] Prove that a change in either editing surface is applied once to the same document and appears in the other surface.
- [ ] Prove undo/redo from both surfaces without duplicate edits or a competing history.
- [ ] Prove completion, diagnostics and definition navigation retain original file locations. Explicitly document any required provider bridge; these features are not automatic in a webview.
- [ ] Prove whole-document Save, Auto Save, read-only handling, save failures, closing and reload/hot-exit protection.
- [ ] Prove two class pages backed by the same native source file, including inherited methods with the same declaring file, share the correct buffer without overwriting another page's selection.
- [ ] Record the chosen architecture, rejected options and supported API boundaries in this folder. If the proof fails, stop production editor work and resolve the design; do not silently ship a read-only substitute for the accepted editing story.

## Phase 2: class workspace and discovery

- [ ] Reuse class catalogue, matcher and native QuickPick entry points; do not introduce another global class search.
- [ ] Preserve project/scope, query, schema filter, page, selected row and scroll when opening a class and returning to discovery.
- [ ] Render the qualified identity, separate Back to Classes action, project/source context and initial Overview.
- [ ] Reuse class sections and stable member identities for Properties, References, Methods, Type methods, Constants, Collection keys and Inheritance. Hide empty groups and show unknown metadata explicitly.
- [ ] Search the complete member index while returning/rendering bounded pages of at most 100 rows. Declared members are the default; enable inherited scope only when ownership is resolved.
- [ ] Reuse a class tab by project/schema/class identity. Restore its own member, filters, scroll and rail width across selection changes and reloads.
- [ ] Guard asynchronous responses by identity and revision, including disposal, refresh and project changes.

## Phase 3: real method editing and source lifecycle

- [ ] Implement the Phase 1 binding over the real source document; avoid a second application source store.
- [ ] Show declaring class before editing inherited source and disable ambiguous, missing or read-only sources with an explanation.
- [ ] Preserve active editing through temporarily incomplete code. Re-resolve source ranges against the current document revision before accepting an edit.
- [ ] Follow clean external changes. Preserve dirty buffers and use an explicit conflict path when on-disk content changes.
- [ ] Handle completed member deletion/rename, source-file move/deletion and reopened documents without displaying another member under the old selection.
- [ ] Make whole-file save scope visible. Keep standard Auto Save, save failure, on-save actions, undo and normal unsaved-document protection.
- [ ] Verify navigation changes neither force saving nor discard edits beyond the user's configured editor behaviour.
- [ ] Confirm local editing/saving never starts a build, publish or database write.

## Phase 4: instances, objects and collections

- [ ] Reuse the current Object Explorer reveal action and existing native inspection sessions. Make connection, database, Source/Working target, schema and class explicit before browsing instances.
- [ ] Retain 100-row lazy instance pages, Next and Return to first page. Do not add arbitrary page jumps, unrestricted instance search or inferred totals.
- [ ] Use the existing native object IDs and property/type/value results. Preserve null, false, zero, empty, unavailable and unloaded states distinctly.
- [ ] Follow references only on selection. Detect cycles by identity without recursively expanding the graph.
- [ ] Preserve Back/Forward, history, selection/scroll restoration and pinned inspection pages. Keep each snapshot bound to its original target and session generation.
- [ ] Reuse collection First/Next, page sizes 25/50/100 and page-only filtering/display order. Show keys/indexes only when supplied. Release cursors when their owning traversal is replaced or disposed.
- [ ] Keep the last snapshot visible with a stale banner on connection loss; disable traversal until explicit reconnection.
- [ ] Link Open class source through project/schema/class resolution. Offer existing pull/configuration actions where valid, without automatically pulling or changing scope.
- [ ] Prove no object setters, mapped getters, arbitrary expression execution, compilation or publication are introduced by inspection.

## Phase 5: performance and accessible presentation

- [ ] Reuse indexes and avoid workspace rescans on warm member navigation. Load/render the selected body and necessary backing documents only.
- [ ] Measure cold indexing, warm member navigation, document binding and native traversal separately. Record hardware/data size and observed timings rather than invent a latency guarantee.
- [ ] At 760 CSS px and above, provide the resizable 240-320 px rail and independent canvas scroll. Below 760 px, use the equivalent full-width member picker.
- [ ] Below 480 px, keep secondary actions in a labelled More menu and object rows in property/type/value blocks.
- [ ] Check 360 px width and 200 percent zoom: no shell overflow or clipped controls; source can scroll horizontally independently.
- [ ] Verify keyboard tree/table semantics, Enter selection, contextual search shortcuts, Escape/focus return and live result announcements.
- [ ] Use VS Code theme tokens, codicons and the editor font. Check light, dark and high contrast, including 4.5:1 text and 3:1 essential-control contrast.
- [ ] Keep loading and panel changes stable, with clear error/empty/recovery states and no animated panel transitions.

## TDD and evidence

For each implementation slice, add a meaningful failing regression, run it to verify the intended failure, implement the smallest change, then run relevant regressions and the actual packaged flow. A test passing against a simplified editor mock is insufficient proof of native document behaviour.

Keep one top-level class per file where classes are appropriate. Use existing functional modules when cohesive; do not introduce classes just to satisfy naming. Group tests as **tests/{Class}/{Class}_{method}_tests.test.js** (module name for functional code), following repository guidance.

| Test layer | Required evidence |
| --- | --- |
| Model / identity | Duplicate schema/class names, imported identity, inheritance ownership, same document backing different class pages, bounded full-index search and selection restoration |
| Mounted interactions | Group ordering/filtering, keyboard selection, stale responses, loading/empty/recovery, compact picker and target changes |
| Real VS Code editor | Shared revisions/undo/redo, CRLF/LF and Unicode mapping, invalid code while typing, external conflicts, Auto Save, write failures and close/reload protection |
| Inspection integration | Existing native read-only operations, target/session binding, cursor release, page-only filters, references/cycles and pinned history |
| Scale / accessibility | 30000 classes, 10000 members, measured cold/warm paths, bounded rendering, keyboard-only interaction, themes and zoom |
| Packaged screenshots | Actual class overview, editable method, instances, object/reference, collection, compact layout and unavailable-source states; verify the changed controls are visible before capturing |

Default tests must not open a developer database. Native checks require explicit opt-in and disposable fixtures. Keep Source inspection read-only; any fixture preparation must be clearly separate. Report skipped checks independently from passes. Clean up owned processes and generated artifacts, retaining compact evidence outside source.

## Review and release gates

- [ ] Link implementation PRs to #30 without closing the parent until all accepted slices are verified.
- [ ] Keep incomplete PRs Draft. Address current-head review findings, run required CI and check conflicts/dependencies before marking Ready and requesting owner review.
- [ ] Attach actual UI screenshots for each changed state. Mockups are design references, not implementation proof.
- [ ] Update the user README, architecture where applicable, capabilities and feature-focused release notes to match shipped behaviour.
- [ ] Preserve required owner approval and protected squash merging. Do not approve on the owner's behalf.
- [ ] After an approved merge, verify main CI, release artifacts and requested local installation separately.
- [ ] Close #30 only when implementation and its acceptance evidence are complete. A plan, proof-of-concept or passing model suite alone does not complete it.

## Scope limits

This plan does not add stored-data editing, non-method inline source editors, arbitrary method execution, live watches, automatic source pulls, a new schema browser, impact graphs, new native database APIs, or changes to compile/publish semantics. Source remains workspace files; native execution remains owned by the existing C++ CLI and installed runtime.
