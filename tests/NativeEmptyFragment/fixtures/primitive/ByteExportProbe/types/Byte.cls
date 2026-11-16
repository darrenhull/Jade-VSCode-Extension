jadeVersionNumber "25.0.01";
schemaDefinition
	ByteExportProbe subschemaOf RootSchema partialDefinition;
typeDefinitions
	Byte completeDefinition
	(
	jadeMethodDefinitions
		byteExportProbe(): Integer number = 1001;
		setModifiedTimeStamp "JadeLoader" "25.0.01" 2026:11:15:20:37:27;
	)
typeSources
	Byte (
	jadeMethodSources
byteExportProbe
{

byteExportProbe(): Integer;
begin
 return 52;
end;
}
	)
