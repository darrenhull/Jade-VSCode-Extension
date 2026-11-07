# Collection designer coverage

This inventory separates implemented controls from native proofs and work in progress. Compiling and publishing remain separate actions. Source creation never creates stored object instances.

| Capability | First shared release (#28) | Follow-up implementation | Native proof / boundary |
| --- | --- | --- | --- |
| Schema, ordinary class and source review/save | Implemented | #25, #26 | Generated schema/runtime classes and ordinary subclass compile in disposable Working. |
| Member/external dictionaries | Implemented | #26 | Existing generator retained; composite keys, direction, duplicates, text comparison options and applicable load factor compile natively. |
| Object arrays | Not in first release | #16 — in progress | Native ObjectArray load and ordered repeated-object runtime behaviour proved. |
| Object sets | Not in first release | #17 — in progress | Native ObjectSet load and unique-object runtime behaviour proved; no ordering promise. |
| Aggregate key size | Native validation required | #18 — in progress | Do not equate every mixed/text key with a byte-only budget. Enforce only native-proven rules. |
| Inherited dictionary keys | Native validation required | #19 — in progress | Preserve original native diagnostics; dictionary kind alone is insufficient. |
| Default lifetime and allow flags | Native validation required | #20 — in progress | Default lifetime is distinct from permitted instance lifetimes. Missing flags are not invented restrictions. |
| Positive text locales and ignore case | Implemented | #26 | Existing native-proven source forms retained. |
| Binary/Latin1 comparison modes | Unavailable | #21 — research | Literal locale values 0/-1 are known rejected forms; do not guess or infer comparison from omitted locale. |
| Expected population / entries per block | Not in first release | #22 — in progress | Alternative sizing modes; native source/runtime limits require proof. |
| Existing database file mappings | Not in first release | #23 — in progress | New classes only; no migration or remapping of existing data. |
| Schema ancestry and system types | Implemented | #24 | Verified RootSchema cache is reused; missing-cache notice explains reduced choices. Imported-package aliases remain unsupported. |
| Primitive arrays, dynamic dictionaries, ad hoc indexes | Deferred | #24 | Outside the bounded object-collection slices; unsupported controls remain unavailable. |
| Automatic relationship/inverse maintenance | Deferred | #24 | Reference-path keys do not establish inverse maintenance; native rules remain authoritative. |

Primary references: [dictionary keys](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch3definingclasses/definekeysfordictionaryclass.htm), [lifetimes](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/userguide/ch3definingclasses/specifying_class_lifetimes.htm), [collection tuning](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/userguide/ch3definingclasses/tuning_collection_classes.htm).
