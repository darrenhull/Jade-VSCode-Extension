jadeVersionNumber "25.0.02";
schemaDefinition
ImportExporterBmw6g9jig subschemaOf RootSchema completeDefinition;
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
localeDefinitions
	2057 "English (United Kingdom)" schemaDefaultLocale;
	setModifiedTimeStamp "<unknown>" "" 2026:11:07:13:39:58;
typeHeaders
	ImportExporterBmw6g9jig subclassOf RootSchemaApp transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2069;
	GImportExporterBmw6g9jig subclassOf RootSchemaGlobal transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2068;
	Thing subclassOf Object transient, highestOrdinal = 2, number = 2071;
	SImportExporterBmw6g9jig subclassOf RootSchemaSession transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2070;
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
	ImportExporterBmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	Global completeDefinition
	(
	)
	RootSchemaGlobal completeDefinition
	(
	)
	GImportExporterBmw6g9jig completeDefinition
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
	SImportExporterBmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
databaseDefinitions
	ImportExporterBmw6g9jigDb
	(
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	databaseFileDefinitions
		"importexporterbmw6g9jig" number = 54;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	defaultFileDefinition "importexporterbmw6g9jig";
	classMapDefinitions
		GImportExporterBmw6g9jig in "importexporterbmw6g9jig";
		ImportExporterBmw6g9jig in "_usergui";
		SImportExporterBmw6g9jig in "_environ";
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
