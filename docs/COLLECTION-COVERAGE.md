# Collection designer coverage

This inventory describes the candidate implementation in Draft PR #29, which depends on PR #28 and the official CLI 0.4.2 bundle. Native and packaged UI proofs have passed; full-suite, current-head CI, dependency and review gates remain separate. No release or installation is claimed. Compiling and publishing remain separate actions. Source creation never creates stored object instances.

## Acceptance gates

The tightened issue criteria are delivery requirements, not evidence of completion:

- **#19:** show ordered inherited keys and each known attribute, including duplicate policy; missing attributes stay unknown. Record matching and mismatching member/external dictionary fixtures with source, target Jade version and native diagnostics. Enforce only proven incompatible attributes, with the offending key/attribute identified.
- **#20:** distinguish a class default from actual class/subclass allow flags. Prove permitted and restricted persistent, transient and shared-transient cases. Missing flags remain native-required; no exclusive-lifetime rule is inferred from a default.
- **#22:** emit one selected sizing mode, label entries accurately and preserve zero as native default. Test non-integer/negative inputs and both sides of each proven boundary. Distinguish accepted values that Jade adjusts from actual rejection limits; array/set/dictionary switches cannot emit stale inapplicable tuning.
- **#23:** use schema-qualified existing maps and revalidate context changes without silently substituting a missing selection. Distinguish the class map from exclusive-instance placement. Unsupported owner-placement/partitionable options remain unavailable with reasons. Prove actual native placement and extraction; a successful class load alone is insufficient.
- **#24–#26:** imported-package aliases are required lookup scope. Two same-named exporters, a same-named local class, exported-property filtering and inherited aliases now have native runtime and packaged UI proof. Imported classes are excluded from superclass choices. PR #28 remains Draft pending its official CLI bundle and final delivery checks.

| Capability | Candidate implementation | Native proof / boundary |
| --- | --- | --- |
| Schema, ordinary class and source review/save | #28 | Generated schemas/runtime classes and ordinary subclasses compile in disposable Working. Reviewed saves are separate from Build/Publish. |
| Member/external dictionaries | #28 | Composite keys, direction, duplicates, text comparison and applicable load factor use native source. |
| Object arrays | #16 | Actual model-generated ObjectArray preserves ordering and repeated members at runtime. |
| Object sets | #17 | Actual ObjectSet runtime enforces uniqueness; no ordering promise. |
| Aggregate key size | #18 | External all-String definitions: aggregate 512 accepted and exercised; 513/600 rejected 6206 on Jade 25.0.02. Other formulas stay native-required; units are not display characters. |
| Inherited dictionary keys | #19 | Ordered known attributes/provenance and duplicate policy are shown; missing values remain Unknown. Matching and incompatible member/external fixtures preserve actual 6385. Error 6386 is transport-tested, not claimed as a reproduced native failure. |
| Default lifetime and allow flags | #20 | Six native permissions are separate from the default. All three instance lifetimes execute; explicit instance/subclass restrictions produce 6308/6292. Source omissions stay Unknown; a default-only child is not blocked using invented inherited restrictions. |
| Positive text locales and ignore case | #26 | Existing native-proven source forms retained. |
| Binary/Latin1 comparison modes | #21 | Binary uses proved omitted-locale/case-sensitive source and actual distinct-key/order behaviour. Latin1 remains unavailable with a reason; literal 0/-1 locale tokens are not invented. |
| Expected population / entries per block | #22 | One selected mode only; source range 0..2147483647 verified, with adjacent outside errors 7726/6065. Zero preserves native defaults. Effective runtime block layout is native-dependent: requests 1/3/4 yield 4 entries in the measured fixture. Source bounds are not runtime capacity guarantees. |
| Existing database file mappings | #23 | Schema-qualified existing files; reviewed class creation plus authoritative databaseDefinitions.sec WorkspaceEdit. Native class metadata, persistent file activity and extraction prove alternate placement. Exclusive instances still follow their owner file; unsupported owner-placement/partition modes remain unavailable. No migration/remapping. |
| Schema ancestry, system types and package aliases | #24–26 | Verified RootSchema cache plus workspace source and package export interfaces. Alias identities, importer/exporter context and child visibility remain distinct; missing metadata is explained. |
| Primitive arrays, dynamic dictionaries, ad hoc indexes | Deferred | Outside the bounded object-collection slices; unavailable controls give reasons. |
| Automatic relationship/inverse maintenance | Deferred | Reference-path keys do not establish inverse maintenance; native rules remain authoritative. |

## Validation evidence

Connected tests use disposable Working databases on Jade 25.0.02 and the verified official CLI 0.4.2 distribution. They record exact source, diagnostics and runtime reports; original source inputs are preserved. Native fixtures are closed and removed. Actual extracted 0.16 VSIX UI checks cover Array/Set, inherited rules, sizing, qualified maps, two-file review/save, dirty-buffer protection and stale-review recovery. Screenshots are in `docs/images/unified-creation-*.png`. Official-bundle replays passed: collections plus hierarchy/lifetimes (195 seconds), the full 564 JavaScript and 18 PowerShell default tests (42 connected checks skipped), portable extracted-VSIX verification and the actual packaged UI host. PR #28 is merged and these changes are integrated onto approved main. The member-key review regression covers typed member, schema, project and catalogue changes, stale metadata, unavailable paths and post-save refresh. The actual packaged UI saves the preserved case/locale source after an Integer-to-String member transition; see unified-creation-member-type-refresh.png. A real VS Code host configured with LF also proves the reviewed create-plus-metadata edit preserves generated CRLF source; opposite-EOL and existing metadata encoding tests pass. Current-head CI/review and owner approval remain delivery gates for PR #29.

Primary references: [dictionary keys](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch3definingclasses/definekeysfordictionaryclass.htm), [lifetimes](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/userguide/ch3definingclasses/specifying_class_lifetimes.htm), [collection tuning](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/userguide/ch3definingclasses/tuning_collection_classes.htm).
