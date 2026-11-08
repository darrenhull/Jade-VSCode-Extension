jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
LifecycleOperations subclassOf Object transient, persistentAllowed, transientAllowed;
typeDefinitions
LifecycleOperations completeDefinition
(
jadeMethodDefinitions
renameInput(pCow: LifecycleCow input; pName: String);
replaceReference(pCow: LifecycleCow io);
)
databaseDefinitions
SJetSchemaDb
(
classMapDefinitions
LifecycleOperations in "sjetschema";
)
typeSources
LifecycleOperations (
jadeMethodSources
renameInput
{
renameInput(pCow: LifecycleCow input; pName: String);
begin
pCow.setName(pName);
end;
}
replaceReference
{
replaceReference(pCow: LifecycleCow io);
begin
delete pCow;
create pCow transient;
end;
}

)
