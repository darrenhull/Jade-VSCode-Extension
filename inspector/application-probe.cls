jadeVersionNumber "25.0.02";
schemaDefinition
 SJetSchema subschemaOf RootSchema partialDefinition;
typeHeaders
 SJetSchema subclassOf RootSchemaApp transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, highestOrdinal = 1, number = 2048;
typeDefinitions
 SJetSchema completeDefinition
 (
 attributeDefinitions
  nativeLaunchParameter: String[255] number = 250, ordinal = 1;
 jadeMethodDefinitions
  probeInitialize(value: String) updating number = 5001;
  probeFinalize() updating number = 5002;
 )
typeSources
SJetSchema (
jadeMethodSources
probeInitialize
{
probeInitialize(value: String) updating;
begin
 nativeLaunchParameter := value;
end;
}
probeFinalize
{
probeFinalize() updating;
begin
 nativeLaunchParameter := nativeLaunchParameter & ":finalized";
end;
}
)
