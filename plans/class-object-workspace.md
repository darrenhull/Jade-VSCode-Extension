# Class & Object Workspace

Implementation plan for [story #30](https://github.com/darrenhull/Jade-VSCode-Extension/issues/30), **Build an integrated class and object workspace**. Overall complexity: **XL**. PR #32 includes the implementation; current-file scoping and the three review fixes are implemented, with final packaged checks completing before owner review and merge.

## Implementation checkpoint

- Three parallel slices own real-document method editing, the grouped class workspace, and read-only object/collection inspection. The integration owns discovery, project-qualified identities, lifecycle and packaging.
- The supported CustomTextEditorProvider owns the original TextDocument. CodeMirror provides the method canvas; edits use WorkspaceEdit and VS Code owns undo/redo, dirty state, Save and Auto Save. The canvas has no separate undo stack or independently saved method file.
- Actual VS Code host checks have proved shared source/undo with the original editor, CRLF and Unicode mapping, clean external reload and preservation of dirty-versus-disk conflicts.
- VS Code reuses a custom text editor for the same URI and view type in the same editor group. A different class in the same physical file therefore opens in a separate editor group; both pages share the original document. Separate classes in separate files open normal separate tabs. No projection URI or duplicate source buffer is introduced.
- An inherited method belonging to another file is shown with its declaring identity and an explicit action to open that class workspace. Editing then occurs under that original document's native save/undo ownership.
- The user's final scope is **current file only**. Declared groups, counts and method editing use the current backing file. Other source files open only through explicit navigation, with independent file-qualified pages; the current page is never rebound or closed automatically.
- Model and packaged UI checks cover project-qualified same-name classes, declared overrides, inherited ownership and bounded searches across 10,000 members. Native connected inspection is explicitly skipped without a validated disposable fixture; current-head CI/review remain delivery gates.

### Acceptance evidence checkpoint

| Gate | Evidence / current result |
| --- | --- |
| Shared original document | Actual VS Code host: real production registration, class reuse, two classes in one CLS, original-editor synchronization, native undo/redo/save, clean external reload and retained dirty-versus-disk revisions passed |
| Scale and navigation | 30,000-class discovery and warm metadata reuse regressions; 10,000-member browser test renders at most 100 and searches beyond the current page |
| Editing and compact UI | Actual renderer rapid typing and Enter preserve exact CRLF source; whole-document save, 760/480/360 layouts and 200% zoom passed |
| Runtime inspection UI | Actual product controller + read-only fixture transport: native-style OIDs, lazy references, cursor pages, page-only filter, pin/history/internal scroll, stale snapshots, three themes and 200% zoom passed |
| Contrast | Measured representative actual body/description/button text above 4.5:1 and focus outline above 3:1 in dark, light and high-contrast themes |
| Default regression | Final local check: 688 JavaScript passes, 42 explicit skips; 18 PowerShell passes. Private native-broker teardown waits for actual process exit before cleanup |
| Portable artifact | Extracted VSIX native distribution receipts/hashes and database-free test discovery passed with Node absent from PATH; all 127 product files matched the source checkout |
| Recovery and current-file sources | Rejected-edit/reopen recovery, exact Copy, confirmed Restore/Discard and native undo have working UI proofs. Regressions protect reopened/recreated recovery from fresh edits and preserve independent method permissions. Declared members stay in the current file; automatic cross-file transitions have been removed |
| Connected native inspection | Explicitly skipped: no configured, validated disposable inspection fixture. No Source or ordinary Working database was used as a test substitute |

The UI fixture transport validates presentation and routing; it does not claim native database semantic coverage. Screenshots are under `docs/screenshots/class-workspace/` and `docs/screenshots/object-workspace/`.

The actual UI ran in isolated VS Code 1.145.2 on Windows x64. The final candidate VSIX SHA256 is `f163c8cfc7969715f1b1eb2fff61cde24010f6b0cc0394f840b7437838d6cbb4`. Native distribution checks and all 127 packaged product files were verified against the checkout. Native confirmation checks use an isolated normal development host because extension-test mode suppresses dialogs.

The native member tree also limits responses to 100 rows including paging controls (98 members per full page), sends only group identity/offset for paging and does not reread source while paging. F5, Shift+F5 and Ctrl+F5 each dispatch exactly once from both the method canvas and Overview to the correct backing URI after pending edits drain. Their UI test stubs command dispatch; compilation/publication are not executed by that keyboard check. Existing native compiler, test, publish-confirmation and debugger behavior is retained.

Reproduce the build with `npm ci`, `npm test` and `npm run package`. Set `JADE_TEST_CODE` to a VS Code executable. Set `JADE_CLASS_WORKSPACE_VSIX` or `JADE_OBJECT_WORKSPACE_VSIX` to the resulting VSIX and run `node scripts/host-test.cjs --class-workspace-ui` or `--object-workspace-ui`. These UI checks use private source fixtures and a deterministic read-only inspection transport. `scripts/smoke-vsix.ps1 -Vsix <path>` checks the portable native distribution without a database connection.

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

- [x] Inspect the existing source preview, language providers and document lifecycle. Identify reusable behaviour before adding modules.
- [x] Compare supported TextDocument-backed custom editors and native-editor compositions against the proposed canvas. Prefer an established editor component and a small document bridge over custom editor mechanics.
- [x] Prove exact method-range offsets into the original source, including CRLF/LF, Unicode, methods before/after the selection and a signature/body changed while typing.
- [x] Prove that a change in either editing surface is applied once to the same document and appears in the other surface.
- [x] Prove undo/redo from both surfaces without duplicate edits or a competing history.
- [x] Prove completion, diagnostics and definition navigation retain original file locations. Explicitly document any required provider bridge; these features are not automatic in a webview.
- [x] Prove whole-document Save, Auto Save, read-only handling, save failures, closing and reload/hot-exit protection.
- [x] Prove two class pages backed by the same native source file, including inherited methods with the same declaring file, share the correct buffer without overwriting another page's selection.
- [x] Record the chosen architecture, rejected options and supported API boundaries in this folder. If the proof fails, stop production editor work and resolve the design; do not silently ship a read-only substitute for the accepted editing story.

## Phase 2: class workspace and discovery

- [x] Reuse class catalogue, matcher and native QuickPick entry points; do not introduce another global class search.
- [x] Preserve project/scope, query, schema filter, page, selected row and scroll when opening a class and returning to discovery.
- [x] Render the qualified identity, separate Back to Classes action, project/source context and initial Overview.
- [x] Reuse class sections and stable member identities for Properties, References, Methods, Type methods, Constants, Collection keys and Inheritance. Hide empty groups and show unknown metadata explicitly.
- [x] Search the complete member index while returning/rendering bounded pages of at most 100 rows. Declared members are the default; enable inherited scope only when ownership is resolved.
- [x] Reuse a class tab by project/schema/class/import/source-file identity. Restore its own member, filters, scroll and rail width across selection changes and reloads.
- [x] Guard asynchronous responses by identity and revision, including disposal, refresh and project changes.

## Phase 3: real method editing and source lifecycle

- [x] Implement the Phase 1 binding over the real source document; avoid a second application source store.
- [x] Show declaring class before editing inherited source and disable ambiguous, missing or read-only sources with an explanation.
- [x] Preserve active editing through temporarily incomplete code. Re-resolve source ranges against the current document revision before accepting an edit.
- [x] Follow clean external changes. Preserve dirty buffers and use an explicit conflict path when on-disk content changes.
- [x] Handle completed member deletion/rename, source-file move/deletion and reopened documents without displaying another member under the old selection.
- [x] Make whole-file save scope visible. Keep standard Auto Save, save failure, on-save actions, undo and normal unsaved-document protection.
- [x] Verify navigation changes neither force saving nor discard edits beyond the user's configured editor behaviour.
- [x] Confirm local editing/saving never starts a build, publish or database write.

## Phase 4: instances, objects and collections

- [x] Reuse the current Object Explorer reveal action and existing native inspection sessions. Make connection, database, Source/Working target, schema and class explicit before browsing instances.
- [x] Retain 100-row lazy instance pages, Next and Return to first page. Do not add arbitrary page jumps, unrestricted instance search or inferred totals.
- [x] Use the existing native object IDs and property/type/value results. Preserve null, false, zero, empty, unavailable and unloaded states distinctly.
- [x] Follow references only on selection. Detect cycles by identity without recursively expanding the graph.
- [x] Preserve Back/Forward, history, selection/scroll restoration and pinned inspection pages. Keep each snapshot bound to its original target and session generation.
- [x] Reuse collection First/Next, page sizes 25/50/100 and page-only filtering/display order. Show keys/indexes only when supplied. Release cursors when their owning traversal is replaced or disposed.
- [x] Keep the last snapshot visible with a stale banner on connection loss; disable traversal until explicit reconnection.
- [x] Link Open class source through project/schema/class resolution. Offer existing pull/configuration actions where valid, without automatically pulling or changing scope.
- [x] Prove no object setters, mapped getters, arbitrary expression execution, compilation or publication are introduced by inspection.

## Phase 5: performance and accessible presentation

- [x] Reuse indexes and avoid workspace rescans on warm member navigation. Load/render the selected body and necessary backing documents only.
- [ ] Native traversal timing remains unmeasured without a validated disposable fixture. Local metadata benchmark on Intel Core i7-8750H / Windows x64 / Node 24.22.1: 30,000-row catalogue construction 56.4 ms; full-index search/position lookup 6.2 ms in the first regression run. These are presentation-model timings, not database or startup guarantees.
- [x] At 760 CSS px and above, provide the resizable 240-320 px rail and independent canvas scroll. Below 760 px, use the equivalent full-width member picker.
- [x] Below 480 px, keep secondary actions in a labelled More menu and object rows in property/type/value blocks.
- [x] Check 360 px width and 200 percent zoom: no shell overflow or clipped controls; source can scroll horizontally independently.
- [x] Verify keyboard tree/table semantics, Enter selection, contextual search shortcuts, Escape/focus return and live result announcements.
- [x] Use VS Code theme tokens, codicons and the editor font. Check light, dark and high contrast, including 4.5:1 text and 3:1 essential-control contrast.
- [x] Keep loading and panel changes stable, with clear error/empty/recovery states and no animated panel transitions.

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

- [x] Link implementation PR #32 to #30; the parent remains open for review and merge.
- [ ] Keep incomplete PRs Draft. Address current-head review findings, run required CI and check conflicts/dependencies before marking Ready and requesting owner review.
- [x] Attach actual UI screenshots for each changed state. Mockups are design references, not implementation proof.
- [x] Update the user README, architecture where applicable, capabilities and feature-focused release notes to match implemented behaviour.
- [ ] Preserve required owner approval and protected squash merging. Do not approve on the owner's behalf.
- [ ] After an approved merge, verify main CI, release artifacts and requested local installation separately.
- [ ] Close #30 only when implementation and its acceptance evidence are complete. A plan, proof-of-concept or passing model suite alone does not complete it.

## Scope limits

This plan does not add stored-data editing, non-method inline source editors, arbitrary method execution, live watches, automatic source pulls, a new schema browser, impact graphs, new native database APIs, or changes to compile/publish semantics. Source remains workspace files; native execution remains owned by the existing C++ CLI and installed runtime.
