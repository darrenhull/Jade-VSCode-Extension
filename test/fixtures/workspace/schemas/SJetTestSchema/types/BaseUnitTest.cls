jadeVersionNumber "25.0.02";
schemaDefinition
SJetTestSchema subschemaOf SJetSchema partialDefinition;

typeHeaders
    BaseUnitTest subclassOf JadeTestCase abstract, transient,
        subclassTransientAllowed, highestOrdinal = 0, number = 9002;

typeDefinitions
    BaseUnitTest completeDefinition
    (
    jadeMethodDefinitions
        initialise() updating, protected number = 1001;
        finalise() updating, protected number = 1002;
        initialiseTest() updating, protected number = 1003;
        finaliseTest() updating, protected number = 1004;
        assertNonEmpty(value : String) protected number = 1005;
    )

typeSources
BaseUnitTest (
jadeMethodSources
initialise
{
initialise() updating, protected;
begin
end;
}
finalise
{
finalise() updating, protected;
begin
end;
}
initialiseTest
{
initialiseTest() updating, protected;
begin
end;
}
finaliseTest
{
finaliseTest() updating, protected;
begin
end;
}
assertNonEmpty
{
assertNonEmpty(value : String) protected;
begin
    assertTrue(value <> "");
end;
}
)
