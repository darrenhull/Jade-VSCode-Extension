# Copilot workflow verification

The deterministic tests and authenticated Copilot checks establish different things. Neither replaces native Jade compilation.

## Authenticated checks on 7 November 2026

The operator used the installed extension 0.17.3 in the real VS Code Copilot UI, accepted the model's edits and saved the owned verification notebook. The notebook contained 12 cells before and after these checks. No Source publication was requested.

| Existing cell | Real interaction | Native result from the saved accepted bytes |
| --- | --- | --- |
| 2 | Asked Copilot to tidy messy code while preserving behavior | Native UI compiled and executed successfully; `Sum: 7`; earlier 2,755 ms replay used CRLF-equivalent source |
| 6 | Selected part of `firstFloat`, then chose Fix for three duplicated bodies and invalid `asString` conversions | Accepted one complete body with native `.String`; compiled and executed successfully; `Totals: 1.53`; independent replay 2,793 ms |

The original and accepted cell bytes have SHA-256 receipts in `evidence/copilot-live-workflows.json`. Raw native output and immutable accepted-source copies are retained under `%LOCALAPPDATA%\JadeTools\verification\copilot-live-workflows`. The operator's working notebook is the deliberately owned `.vscode/copilot-workflow-tests/Copilot-Workflow-Tests.jadeworkspace`; user notebooks were not substituted for fixtures.

Cell 6's independent replay used the exact captured UTF-8 source bytes. Cell 2's earlier standalone replay had CRLF line endings while the saved notebook cell has LF; its exact-byte replay is pending. The recorded native UI execution remains a separate observed result.

Additional matrix, Decimal and Markdown cases remain pending until their actual UI results and native evidence are recorded. This table does not imply that every generated suggestion compiles.

## Repeatable regression tests

`test/fixtures/scratch-pad-copilot-workflows.json` supplies scenario prompts and source, including caret/partial selection, duplicated bodies and primitive declarations. The grouped `ScratchPadCopilotWorkflow` tests verify full-cell native edit scope, unchanged source before acceptance, structural acceptance rules and refusal to treat a proposal as compilation evidence. They do not generate or simulate an AI response.

`test/ScratchPadCopilotWorkflow.js` checks accepted source without requiring an exact model response. Its `assertAccepted` method requires a real successful native result with `report.compiled === true`. Equivalent grouped declarations and descriptor spacing are allowed.

`test/CopilotWorkflowEvidence.js` records saved bytes and hashes without changing either the accepted notebook or its pristine copy. `recordNative` preserves raw native output, verifies the captured source hash and applies the acceptance checks. It does not call an AI provider or manufacture a native success result.

For a new live case: capture the intended cell before further UI changes, obtain the actual native result for those captured bytes, then record it. Keep authenticated model generation, accepted native editor mutation, native compilation and explicit execution as separate evidence. Default CI does not issue authenticated AI requests.
