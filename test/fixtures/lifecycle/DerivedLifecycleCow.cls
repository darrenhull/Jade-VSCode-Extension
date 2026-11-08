jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
DerivedLifecycleCow subclassOf NamedLifecycleCow transient, persistentAllowed, transientAllowed;
typeDefinitions
DerivedLifecycleCow completeDefinition
(
jadeMethodDefinitions
create() updating;
)
databaseDefinitions
SJetSchemaDb
(
classMapDefinitions
DerivedLifecycleCow in "sjetschema";
)
typeSources
DerivedLifecycleCow (
jadeMethodSources
create
{
create() ::super("Bessie") updating;
begin
self.construction := self.construction & ",derived";
end;
}

)
