# ANSI and Unicode runtime configuration

Issue: [#49](https://github.com/darrenhull/Jade-VSCode-Extension/issues/49)
Native dependency: Jade CLI #25, coherent compatible native package required before release readiness.

## Scope

Add a resource-scoped `jadeNative.characterSet` enum (`auto`, `ansi`, `unicode`), defaulting to `auto`. Pass explicit values unchanged as native CLI `config.characterSet`; omit the manifest-only default so native project/connection preferences retain precedence, with native auto-detection as the final default. The native CLI probes the installed character width, selects matching helper variants and rejects explicit mismatches before JOM is opened. The extension must not duplicate ABI selection, introduce a Node backend or write default settings into each source project.

## Implementation sequence

1. Write failing manifest and actual-activation tests for automatic defaults, separate ANSI/Unicode workspace resources, and configuration passed to build/test, inspection, Scratch Pad and debugger contexts.
2. Add only setting metadata and the shared defaults key; leave native detection/validation in the CLI. Use real client serializers with fake process responses to verify all supported operation packets retain the selection and mismatch errors are not hidden or retried.
3. Document automatic detection, the optional override, resource scoping and native mismatch errors. Clearly retain unsupported ANSI debugging and legacy cache/offline ABI limits until native proof says otherwise.
4. Wait for native owner to supply a coherent matching launcher/helper distribution with a verified manifest. Adopt only reviewed official bytes for the releasable pin; a verified candidate may be used solely in a private test host, never silently installed or labelled as an official release.
5. Run full default regressions, exact distribution verification and portable packaged checks. Capture the actual Settings UI in a private VS Code host. Use native owner's disposable ANSI/Unicode evidence; never open vendor/source databases from extension-only tests.
6. Commit code, plan, tests and evidence in one linked Draft PR. Move Ready only when compatible bundle, current-head checks, UI evidence and native capability claims are verified; address review comments until owner review is the only remaining gate.

## Initial evidence and remaining gate

Four initial tests failed against approved main: missing setting metadata and missing characterSet in actual activation's workspace configurations. All 26 focused configuration/transport cases now pass, including explicit scope inspection, default omission, legacy cache/debug-session request forwarding and native mismatch-error preservation. The activation fixture uses the real configuration resolver with fake filesystem checks; explicit empty, null and numeric choices remain intact for native rejection. Actual private VS Code Settings UI displays auto without writing workspace settings or starting a native broker. The full default suite passes 996 JavaScript tests and 18 PowerShell checks (43 explicit native opt-in skips). Packaging correctly rejects the old 0.5.0 bundle because the feature now requires CLI 0.6.0; this is a deliberate release gate until verified compatible native bytes are adopted. No database or installed user extension is touched. Actual Settings UI verification is complete; compatible native distribution adoption and package/native integration remain pending; no ANSI runtime execution claim is made from fake transport tests.
