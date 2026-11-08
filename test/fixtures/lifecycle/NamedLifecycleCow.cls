jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
NamedLifecycleCow subclassOf LifecycleCow transient, persistentAllowed, transientAllowed;
typeDefinitions
NamedLifecycleCow completeDefinition
(
jadeMethodDefinitions
create(pName: String) updating;
)
databaseDefinitions
SJetSchemaDb
(
classMapDefinitions
NamedLifecycleCow in "sjetschema";
)
typeSources
NamedLifecycleCow (
jadeMethodSources
create
{
create(pName: String) updating;
begin
self.name := pName;
self.construction := self.construction & ",named";
end;
}

)
