# Native CLS extract structure

Read this when creating or editing a complete class extract rather than a method body or Scratch Pad script. This is a practical guide, not a published formal grammar. Preserve the project's native extract as the template and validate changes with the matching Jade compiler.

## Files and scope

Jade documents `.cls` as the normal class/interface extract suffix, `.scm` for schemas and `.mth` for methods. An extract can be selective: the extension alone does not establish completeness or the number of declarations.

[Extract options](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch10schemaextractload/specifying_your_extract_options.htm) · [Selected class extraction](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch10schemaextractload/extracting_a_selected_class.htm)

## Read the existing native sections

The following structure is observed in the project's Jade 25.0.02 class extracts. It is not an exhaustive list of all possible native sections.

| Section | What to preserve and edit |
| --- | --- |
| `jadeVersionNumber` | Extract version; do not replace it with an invented newer version |
| `schemaDefinition` | Owning schema, parent schema and completeness qualifier |
| `typeHeaders` | Class name, superclass, lifetimes, modifiers and extracted identity metadata |
| `typeDefinitions` | Matching owner and parenthesized definition block |
| `attributeDefinitions` | Primitive stored properties such as `species: String[31];` |
| `referenceDefinitions` | Object and collection references, with any native inverse metadata |
| `jadeMethodDefinitions` | Method declarations and their extracted modifiers/metadata |
| `databaseDefinitions` | Native file and class-map declarations when supplied |
| `typeSources` | Owner block containing `jadeMethodSources` and named source bodies |

Names and signatures must agree across the header, definition and source sections. A method's declaration is separate from its implementation: changing parameters, return type or modifiers requires keeping both consistent. A standalone method body is not a complete CLS extract.

Within `jadeMethodSources`, each method has a name and a brace-delimited source containing the signature, optional declarations, `begin` and `end;`. The enclosing class definition/source blocks use parentheses. Preserve existing section order, comments, documentation text, line endings and native metadata rather than broadly rewriting the file. Do not manufacture class numbers, ordinals, patch versions, timestamps, file numbers or inverse declarations.

## Completeness changes load meaning

Schema and class completeness are independent. A file can describe a partial schema while supplying a complete class definition. A `completeDefinition` can make omitted members candidates for deletion under the loader's deletion policy; `partialDefinition` describes an update subset. Do not change either qualifier merely to get an import to succeed, or omit existing members from a complete definition unintentionally.

[Partial versus complete definitions (Jade 2020 reference; verify matching-version behaviour)](https://secure.jadeworld.com/developer-centre/JADE2020/OnlineDocumentation/content/resources/userguide/ch10schemaextractload/loadpartialvcomplscmdefs.htm)

## Sectioned extraction and companion assets

Native sectioned extraction produces individual type CLS files and schema-level SEC sections or ordering lists. Some definitions, including form layouts, can require separate DDX assets. Do not assume every schema declaration lives in a class file. The native JadeJoinSchema application can assemble sectioned source into SCM; use supported tooling instead of inventing another serialization format. The project's folder presentation can differ from native extraction paths.

[Sectioned extraction](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch10schemaextractload/extracting_schemas_in_sections.htm) · [Native rejoining](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch10schemaextractload/rejoinsectionsofextractedscm.htm)

## Compilation versus loading policy

A valid CLS can still fail because of loader policy. Current Schema Version rejects structural changes; Latest Schema Version permits them and may require native reorganisation. Do not misdiagnose that rejection as a syntax problem or solve it by deleting properties. Select the supported lifecycle through the CLI; do not bypass reviewed Source publication.

[Schema load options](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/jadscmload/ch1usingschemaloadutility/loadschemaformstodatabase.htm)
