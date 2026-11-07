# Native package fixtures

These files were extracted from disposable Jade 25.0.02 schemas on 7 November
2026. They contain generated test classes and native metadata, not application
source from a user's database. The extraction bytes are retained without
renaming their schema identities.

Both exporters define `Thing` in `SharedTools`, but export only `name`.
Their original class source also contains `secret`. The consumer imports the
packages as `CatalogA` and `CatalogB` and has its own unrelated `Thing` with
`localOnly`. The child schema inherits the consumer's package aliases.

The pure tests adapt these snapshots into the source-project model; they do not
load their recorded native class numbers into another database. Connected tests
create fresh private fixtures and require explicit opt-in.

The designer exposes the exported interface. This is distinct from the schema
loader's handling of key metadata: a successful hidden-key definition load does
not prove that an importing method can access that property.
