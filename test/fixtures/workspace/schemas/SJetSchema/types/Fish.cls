jadeVersionNumber "25.0.02";
schemaDefinition
SJetSchema subschemaOf RootSchema partialDefinition;
    setModifiedTimeStamp "darre" "25.0.02" 2026:11:05:00:00:00.000;

typeHeaders
    Fish subclassOf Object transient, sharedTransientAllowed,
        transientAllowed, subclassSharedTransientAllowed,
        subclassTransientAllowed, highestOrdinal = 5, number = 9002;

typeDefinitions
    Fish completeDefinition
    (
        setModifiedTimeStamp "darre" "25.0.02" 2026:11:05:00:00:00.000;
    attributeDefinitions
        name:         String[50] number = 1, ordinal = 1;
        species:      String[50] number = 2, ordinal = 2;
        lengthCm:     Integer number = 3, ordinal = 3;
        freshwater:   Boolean number = 4, ordinal = 4;
        dateOfBirth:  Date number = 5, ordinal = 5;
    jadeMethodDefinitions
        a_Documentation() number = 1001;

        documentationText
        `Fish - a transient domain class representing a fish.
Tracks name, species, length in centimetres, freshwater status, and date of birth.
Suitable for deterministic unit tests.`

        getName() : String number = 1002;
        setName(pName : String) updating number = 1003;
        getSpecies() : String number = 1004;
        setSpecies(pSpecies : String) updating number = 1005;
        getLengthCm() : Integer number = 1006;
        setLengthCm(pLengthCm : Integer) updating number = 1007;
        isFreshwater() : Boolean number = 1008;
        setFreshwater(pFreshwater : Boolean) updating number = 1009;
        getDateOfBirth() : Date number = 1010;
        setDateOfBirth(pDateOfBirth : Date) updating number = 1011;
        getAgeInDays(pAsAtDate : Date) : Integer number = 1012;
        isTrophySize(pThresholdCm : Integer) : Boolean number = 1013;
        getDescription() : String number = 1014;
    )

typeSources
Fish (
jadeMethodSources
getName
{
getName() : String;
begin
    return self.name;
end;
}
setName
{
setName(pName : String) updating;
begin
    self.name := pName;
end;
}
getSpecies
{
getSpecies() : String;
begin
    return self.species;
end;
}
setSpecies
{
setSpecies(pSpecies : String) updating;
begin
    self.species := pSpecies;
end;
}
getLengthCm
{
getLengthCm() : Integer;
begin
    return self.lengthCm;
end;
}
setLengthCm
{
setLengthCm(pLengthCm : Integer) updating;
begin
    self.lengthCm := pLengthCm;
end;
}
isFreshwater
{
isFreshwater() : Boolean;
begin
    return self.freshwater;
end;
}
setFreshwater
{
setFreshwater(pFreshwater : Boolean) updating;
begin
    self.freshwater := pFreshwater;
end;
}
getDateOfBirth
{
getDateOfBirth() : Date;
begin
    return self.dateOfBirth;
end;
}
setDateOfBirth
{
setDateOfBirth(pDateOfBirth : Date) updating;
begin
    self.dateOfBirth := pDateOfBirth;
end;
}
getAgeInDays
{
getAgeInDays(pAsAtDate : Date) : Integer;
begin
    if self.dateOfBirth = null then
        return 0;
    endif;
    return pAsAtDate - self.dateOfBirth;
end;
}
isTrophySize
{
isTrophySize(pThresholdCm : Integer) : Boolean;
begin
    return self.lengthCm > pThresholdCm;
end;
}
getDescription
{
getDescription() : String;
vars
    result : String;
begin
    result := self.name & " (" & self.species & ", " & self.lengthCm.String & "cm)";
    return result;
end;
}
)
