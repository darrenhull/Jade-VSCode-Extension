jadeVersionNumber "25.0.02";
schemaDefinition
ImportExporterAmw6g9jig subschemaOf RootSchema completeDefinition;
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
localeDefinitions
	2057 "English (United Kingdom)" schemaDefaultLocale;
	setModifiedTimeStamp "<unknown>" "" 2026:11:07:13:39:58;
typeHeaders
	ImportExporterAmw6g9jig subclassOf RootSchemaApp transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2065;
	GImportExporterAmw6g9jig subclassOf RootSchemaGlobal transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2064;
	Thing subclassOf Object transient, highestOrdinal = 2, number = 2067;
	SImportExporterAmw6g9jig subclassOf RootSchemaSession transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2066;
membershipDefinitions
typeDefinitions
	Object completeDefinition
	(
	)
	Application completeDefinition
	(
	)
	RootSchemaApp completeDefinition
	(
	)
	ImportExporterAmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	Global completeDefinition
	(
	)
	RootSchemaGlobal completeDefinition
	(
	)
	GImportExporterAmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	Thing completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	attributeDefinitions
		name:                          String[50] number = 1, ordinal = 1;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
		secret:                        String[50] number = 2, ordinal = 2;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	WebSession completeDefinition
	(
	)
	RootSchemaSession completeDefinition
	(
		setModifiedTimeStamp "<unknown>" "6.1.00" 20031119 2003:12:01:13:54:02.270;
	)
	SImportExporterAmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
databaseDefinitions
	ImportExporterAmw6g9jigDb
	(
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	databaseFileDefinitions
		"importexporteramw6g9jig" number = 53;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	defaultFileDefinition "importexporteramw6g9jig";
	classMapDefinitions
		GImportExporterAmw6g9jig in "importexporteramw6g9jig";
		ImportExporterAmw6g9jig in "_usergui";
		SImportExporterAmw6g9jig in "_environ";
	)
exportedPackageDefinitions
	SharedTools
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	exportedClassDefinitions
		Thing transientAllowed, transient 
		(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
		exportedPropertyDefinitions
			name ;
			setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
		)
	exportedInterfaceDefinitions
	)
typeSources
