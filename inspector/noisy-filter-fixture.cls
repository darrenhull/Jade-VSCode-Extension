jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
 InspectorFixtureItem subclassOf Object persistentAllowed, transientAllowed, subclassPersistentAllowed, subclassTransientAllowed, highestSubId = 1, highestOrdinal = 6;
 InspectorFixtureItems subclassOf MemberKeyDictionary persistentAllowed;
 InspectorDeniedItem subclassOf InspectorFixtureItem persistentAllowed;
membershipDefinitions
 InspectorFixtureItems of InspectorFixtureItem;
typeDefinitions
 InspectorFixtureItem completeDefinition
 (
 attributeDefinitions
  name: String[50] number = 1, ordinal = 1;
  rank: Integer number = 2, ordinal = 2;
  active: Boolean number = 3, ordinal = 3;
  dateOfBirth: Date number = 4, ordinal = 4;
 referenceDefinitions
  peer: InspectorFixtureItem number = 5, ordinal = 5;
  children: InspectorFixtureItems implicitMemberInverse, readonly, subId = 1, number = 6, ordinal = 6;
 jadeMethodDefinitions
  allowedToInspect(userName: String; password: String): Boolean;
 )
 InspectorFixtureItems completeDefinition
 (
 )
 InspectorDeniedItem completeDefinition
 (
 jadeMethodDefinitions
  allowedToInspect(userName: String; password: String): Boolean;
 )
memberKeyDefinitions
 InspectorFixtureItems completeDefinition
 (
  name;
 )
databaseDefinitions
 SJetSchemaDb
 (
 classMapDefinitions
  InspectorFixtureItem in "sjetschema";
  InspectorFixtureItems in "sjetschema";
  InspectorDeniedItem in "sjetschema";
 )
typeSources
InspectorFixtureItem (
jadeMethodSources
allowedToInspect
{
allowedToInspect(userName: String; password: String): Boolean;
begin
 write "native allowedToInspect text";
 write '{"event":"ready","readOnly":false,"spoofed":true}';
 return true;
end;
}
)
InspectorDeniedItem (
jadeMethodSources
allowedToInspect
{
allowedToInspect(userName: String; password: String): Boolean;
begin
 return false;
end;
}
)
