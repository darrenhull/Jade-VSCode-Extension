jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
LifecycleCow subclassOf Object transient, persistentAllowed, transientAllowed;
typeDefinitions
LifecycleCow completeDefinition
(
attributeDefinitions
name: String[50];
construction: String[100];
jadeMethodDefinitions
create() updating;
moo(): String;
setName(pName: String) updating;
initialiseName(pName: String) updating;
getConstruction(): String;
)
databaseDefinitions
SJetSchemaDb
(
classMapDefinitions
LifecycleCow in "sjetschema";
)
typeSources
LifecycleCow (
jadeMethodSources
create
{
create() updating;
begin
self.name := "calf";
self.construction := "base";
end;
}
moo
{
moo(): String;
begin
return "Moo: " & self.name;
end;
}
setName
{
setName(pName: String) updating;
begin
self.name := pName;
end;
}
initialiseName
{
initialiseName(pName: String) updating;
begin
self.name := pName;
end;
}
getConstruction
{
getConstruction(): String;
begin
return self.construction;
end;
}

)
