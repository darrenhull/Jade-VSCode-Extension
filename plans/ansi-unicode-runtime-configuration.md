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

Four initial tests failed against approved main: missing setting metadata and missing characterSet in actual activation's workspace configurations. All 26 focused configuration/transport cases now pass, including explicit scope inspection, default omission, legacy cache/debug-session request forwarding and native mismatch-error preservation. The activation fixture uses the real configuration resolver with fake filesystem checks; explicit empty, null and numeric choices remain intact for native rejection. Actual private VS Code Settings UI displays auto without writing workspace settings or starting a native broker. The full default suite passes 996 JavaScript tests and 18 PowerShell checks (43 explicit native opt-in skips). Packaging correctly rejects the old 0.5.0 bundle because the feature now requires CLI 0.6.0; this is a deliberate release gate until verified compatible native bytes are adopted. No database or installed user extension is touched. Actual Settings UI and private packaged native integration are now verified below. Production adoption still requires the reviewed official CLI release; mock transport tests alone are not native execution evidence.

## Preliminary native package integration

The frozen 64e5 CLI 0.6 candidate was copied immutably and every manifest asset verified. The private VSIX passed portable no-Node discovery. Its actual packaged client passed native ANSI and Unicode builds, first/second/first test execution, read-only catalogue, warm wrong-mode rejection with the original epoch retained, and café Scratch output. A private VS Code host also passed actual ANSI Compile, Testing, Scratch and Database Objects commands; a passive spy confirmed the explicit mode on all six native command kinds. All hosts/brokers stopped, owned Working copies were removed and both seed leases returned. This remains preliminary: the native StringUtf8 fidelity gate requires a refreshed candidate, and production bytes must come from a reviewed official release. No development bundle was committed or installed globally.

## Refreshed candidate verification

The final native candidate at source 2da70cf fixes the ANSI StringUtf8 getter. Every runtime manifest asset and the private VSIX were verified; portable no-Node/no-database smoke passed. The full default consumer suite again passed 996 JavaScript tests and 18 PowerShell checks, with 43 explicit native opt-in skips. The refreshed, extracted VSIX client read the native StringUtf8 property `unicodeText` as exactly `中 🐟` through an ANSI read-only Source session against an owned disposable proof clone, never the installed user Source database. The native owner independently passed enhanced ANSI and Unicode execution/data-fidelity suites. The earlier full private editor/UI proof is identified separately rather than claimed as a rerun against the new native getter. Clients and brokers stopped, every fixture lease was returned and the native owner removed all owned fixtures. See `docs/verification/runtime-character-set-native-candidate.json` for sanitized receipt hashes and outcomes.

Remaining delivery gates are the reviewed official CLI release and exact official distribution adoption, followed by consumer CI and automated review. Development bytes remain excluded from Git and have not been installed globally. The PR stays Draft until the production pin satisfies its CLI 0.6.0 minimum.


## Final native review fix verification

Candidate 187b6fb adds bounded native log-line framing and restores the preexisting StringUtf8 early size guard before SDK dereference. The valid-value getter is unchanged. Every final manifest asset and the rebuilt private VSIX passed verification and portable no-Node/no-database smoke. The sanitized receipt explicitly retains the earlier connected candidate hashes rather than attributing its native/UI proof to these later bounded changes. Native-owner regressions cover the review fixes; no additional database connection was made. Production adoption still awaits the approved official release.

