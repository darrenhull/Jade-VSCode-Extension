jadeVersionNumber "25.0.02";
schemaDefinition
SJetTestSchema subschemaOf SJetSchema partialDefinition;
    setModifiedTimeStamp "darre" "25.0.02" 2026:11:05:00:00:00.000;

typeHeaders
    FishTest subclassOf BaseUnitTest highestOrdinal = 0, number = 9002;

typeDefinitions
    FishTest completeDefinition
    (
        setModifiedTimeStamp "darre" "25.0.02" 2026:11:05:00:00:00.000;
    jadeMethodDefinitions
        a_Documentation() number = 1001;

        documentationText
        `Deterministic unit tests for SJetSchema::Fish.`

        accessors_SetValues_ReturnsValues() unitTest number = 1002;
        getAgeInDays_NullBirthDate_ReturnsZero() unitTest number = 1003;
        isTrophySize_AtAndAboveThreshold_ReturnsExpectedValue() unitTest number = 1004;
        getDescription_CompleteState_ReturnsExpectedValue() unitTest number = 1005;
    )

typeSources
FishTest (
jadeMethodSources
accessors_SetValues_ReturnsValues
{
accessors_SetValues_ReturnsValues() unitTest;
vars
    fish : Fish;
begin
    create fish transient;
    fish.setDateOfBirth("2026:11:05".asDate);
    fish.setName("Bubbles");
    fish.setSpecies("Goldfish");
    fish.setLengthCm(17);
    fish.setFreshwater(true);

    assertEquals("Bubbles", fish.getName());
    assertEquals("Goldfish", fish.getSpecies());
    assertEquals(17, fish.getLengthCm());
    assertTrue(fish.isFreshwater());
epilog
    delete fish;
end;
}
getAgeInDays_NullBirthDate_ReturnsZero
{
getAgeInDays_NullBirthDate_ReturnsZero() unitTest;
vars
    fish : Fish;
begin
    create fish transient;
    assertEquals(0, fish.getAgeInDays(null));
epilog
    delete fish;
end;
}
isTrophySize_AtAndAboveThreshold_ReturnsExpectedValue
{
isTrophySize_AtAndAboveThreshold_ReturnsExpectedValue() unitTest;
vars
    fish : Fish;
begin
    create fish transient;
    fish.setLengthCm(18);
    assertFalse(fish.isTrophySize(18));
    assertTrue(fish.isTrophySize(17));
epilog
    delete fish;
end;
}
getDescription_CompleteState_ReturnsExpectedValue
{
getDescription_CompleteState_ReturnsExpectedValue() unitTest;
vars
    fish : Fish;
begin
    create fish transient;
    fish.setName("Bubbles");
    fish.setSpecies("Goldfish");
    fish.setLengthCm(18);

    assertEquals("Bubbles (Goldfish, 18cm)", fish.getDescription());
epilog
    delete fish;
end;
}
)
