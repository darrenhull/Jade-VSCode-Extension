# Copilot workflow verification

The deterministic tests and authenticated Copilot checks establish different things. Neither replaces native Jade compilation.

## Authenticated checks on 7 November 2026

The operator used the installed extension 0.17.3 in the real VS Code Copilot UI, accepted the model's edits and saved the owned verification notebook. The notebook contained 12 cells before and after these checks. No Source publication was requested.

| Existing cell | Real interaction | Observed validation result |
| --- | --- | --- |
| 2 | Asked Copilot from an end caret to tidy messy code while preserving behavior | Native UI and exact saved-byte replay compiled and executed successfully; `Sum: 7`; replay 2,884 ms |
| 6 | Selected part of `firstFloat`, then chose Fix for three duplicated bodies and invalid `asString` conversions | Accepted one complete body with native `.String`; compiled and executed successfully; `Totals: 1.53`; independent replay 2,793 ms |
| 8 | Asked ordinary Edit to add Real, Integer, Decimal, Boolean, Character and Byte examples, then used Fix on its actual native failure | First accepted generation failed with 6072 at an unconverted Byte assignment. Copilot Fix changed only that line to `byteValue := 7.Byte;`. Native UI and exact saved-byte replay then passed; output included `Primitive values: 1.5, 3` and `Additional values: 12.50, true, J, 7`; replay 2,831 ms |
| 10 | Chose Fix from the end caret with the default short prompt after a native Decimal descriptor failure | Copilot changed only `amount : Decimal;` to `amount : Decimal[12,2];`. Native UI and exact saved-byte replay passed; `Amount: 12.50`; replay 2,789 ms |
| 11 | Chose ordinary Edit from rendered Markdown, asking for an improved heading/note and a Tests step between Source and Working in the existing Mermaid diagram | **Content failed:** the accepted response kept only a heading and prose and deleted the Mermaid fence. The existing cell count remained 12 and no Jade guidance was attached. Correct targeting did not establish correct content |

The portable, sanitized hashes and native result summary are in [the live verification receipt](test-evidence/copilot-live-workflows.json). Raw native output and immutable accepted-source copies are retained under `%LOCALAPPDATA%\JadeTools\verification\copilot-live-workflows`. The operator's working notebook is the deliberately owned `.vscode/copilot-workflow-tests/Copilot-Workflow-Tests.jadeworkspace`; user notebooks were not substituted for fixtures.

All four successful independent replays used the exact captured UTF-8 cell source bytes. Cell 2's older CRLF-equivalent replay is retained separately; the later LF replay closes that earlier evidence limitation. Cell 8's original failed source and the one-line accepted repair each have their own immutable capture, so the initial generation failure is not hidden by the successful retry. At the cell 10 capture, only cells 2, 6, 8 and 10 differed from the pristine notebook; every unrelated cell was unchanged and the count remained 12.

The standalone Byte guidance fixture was also compiled and executed with the native runtime, producing `7` then `8`; this validates the shipped example, not an AI generation result. Its report is `byte-guidance-native.json` beside the live receipts.

The actual failed Markdown response is retained verbatim in `test/fixtures/copilot-live-markdown-missing-mermaid.md`, with its source hash in the portable receipt. `MarkdownCopilotWorkflow` rejects it for missing the complete Mermaid fence. The validator checks content retention; successful native Mermaid rendering remains separate required evidence. Markdown source is not submitted to the Jade compiler.

The end-caret cleanup Edit is covered by cell 2. The final attachment-only Markdown round trip failed as recorded below; an explicit compatibility-prompt recovery passed. This table does not imply that every generated suggestion compiles or satisfies its content requirements.

## Repeatable regression tests

`test/fixtures/scratch-pad-copilot-workflows.json` supplies scenario prompts and source, including caret/partial selection, duplicated bodies and primitive declarations. The grouped `ScratchPadCopilotWorkflow` tests verify full-cell native edit scope, unchanged source before acceptance, structural acceptance rules and refusal to treat a proposal as compilation evidence. They do not generate or simulate an AI response.

`test/ScratchPadCopilotWorkflow.js` checks accepted source without requiring an exact model response. Its `assertAccepted` method requires a real successful native result with `report.compiled === true`. Equivalent grouped declarations and descriptor spacing are allowed.

`test/CopilotWorkflowEvidence.js` records saved bytes and hashes without changing either the accepted notebook or its pristine copy. `recordNative` preserves raw native output, verifies the captured source hash and applies the acceptance checks. It does not call an AI provider or manufacture a native success result.

For a new live case: capture the intended cell before further UI changes, obtain the actual native result for those captured bytes, then record it. Keep authenticated model generation, accepted native editor mutation, native compilation and explicit execution as separate evidence. Default CI does not issue authenticated AI requests.

## Native Markdown recovery

After Undo restored the rejected cell, a real Copilot request explicitly required one outer Markdown response fence and inner tilde Mermaid fences. The accepted existing cell retained its heading, prose and diagram; the native preview rendered Source → Tests → Working and the notebook still had 12 cells. The original truncation remains recorded as a failed attempt. The final extension supplies this compatibility guidance as a read-only Mermaid skill attachment; its default-prompt round trip remains a separate check from this explicit-prompt proof.

## Legacy native Markdown limitation (superseded by the native-agent gate)

Two further installed-0.17.4 requests with the Mermaid guidance attached still failed: one retained only prose, and a short natural request retained only the inner flowchart body. The immutable receipts preserve both failures. This means the attachment is a useful instruction, not a proven reliable workaround for the native response decoder.

A comparison with the experimental notebook-agent flag in the disposable workspace accepted complete tilde-fenced Markdown, but the native log still identified the legacy inline/edit route. It therefore does not prove the new handler fixed the problem. The setting was removed afterward; no user/global settings were changed. That result established a required native capability gate rather than a reliable prompt workaround; the completed native-agent path is recorded below. Code editing, the primitive audit and PR #32 are independent of this limitation.

## Packaged checks and cleanup

Preview 0.17.4 passed the exact packaged Notebook UI check (five Jade guide URIs, current native error context, separate Mermaid attachment, actual tilde-fence rendering) and portable CLI smoke without Node on PATH. These tests do not claim an authenticated model request. The real model round trips above are separate evidence. The completed native test session was disconnected, both owned test windows were closed, and the disposable 142 MB Working database and workspace test folder were removed. Compact source/response receipts remain available locally.

## Final native-agent workflow verification: 0.17.6

The installed build now refuses the legacy Markdown path. Its explicit workspace-only setup uses a native modal: Cancel preserved the exact three-cell notebook and disabled setting; a second Edit opened a fresh dialog; Enable and Reload wrote only the workspace setting and restored all three cells after restart. The native handler then used notebook editing tools instead of the legacy code-block decoder.

An ordinary Markdown edit retained the complete heading, prose, original backtick Mermaid fence and requested Source → Tests → Working diagram. Both neighboring cells remained byte-identical. Code Edit started from an end caret with five real Jade reference attachments; the accepted single body executed natively and printed Hello from Jade 3. A controlled Integer.asString error produced 6026. Fix started with only counter selected, supplied the short native request plus read-only full context, changed only the conversion to .String, preserved the Markdown cells and reran successfully in 2.88 seconds. An independent exact-source native replay passed in 3.343 seconds with the same output.

[Structured final workflow evidence](test-evidence/native-copilot-0.17.6.json) records source hashes, scope and real execution results. The original failed attempts remain preserved above. [Packaged verification](test-evidence/packaged-0.17.6-verification.json) separately proves the exact VSIX controls, attachments, rendering and no-Node portable runtime; that automated UI test does not impersonate a model response. Both owned default-profile test windows and the disposable Working databases were closed/disconnected and removed after recording compact evidence. The user's unsaved workspace window was left open.

PR #37 remains Draft pending the user-requested sequence: merge PR #32 first, then rebase #37 onto approved main, review its comments and validate the final combined head.
