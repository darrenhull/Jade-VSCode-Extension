jadeVersionNumber "25.0.02";
schemaDefinition
ImportChildmw6g9jig subschemaOf ImportConsumermw6g9jig completeDefinition;
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
localeDefinitions
	2057 "English (United Kingdom)" schemaDefaultLocale;
	setModifiedTimeStamp "<unknown>" "" 2026:11:07:13:39:59;
typeHeaders
	ImportChildmw6g9jig subclassOf ImportConsumermw6g9jig transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2078;
	GImportChildmw6g9jig subclassOf GImportConsumermw6g9jig transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2077;
	SImportChildmw6g9jig subclassOf SImportConsumermw6g9jig transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2079;
	ChildImportedByName subclassOf MemberKeyDictionary transient, number = 2089;
membershipDefinitions
	ChildImportedByName of CatalogA::Thing;
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
	ImportConsumermw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	)
	ImportChildmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	)
	Global completeDefinition
	(
	)
	RootSchemaGlobal completeDefinition
	(
	)
	GImportConsumermw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	)
	GImportChildmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	)
	WebSession completeDefinition
	(
	)
	RootSchemaSession completeDefinition
	(
		setModifiedTimeStamp "<unknown>" "6.1.00" 20031119 2003:12:01:13:54:02.270;
	)
	SImportConsumermw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	)
	SImportChildmw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	)
	Collection completeDefinition
	(
	)
	Btree completeDefinition
	(
	)
	Dictionary completeDefinition
	(
	)
	MemberKeyDictionary completeDefinition
	(
	)
	ChildImportedByName completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:40:49;
	)
memberKeyDefinitions
	ChildImportedByName completeDefinition
	(
		name;
	)
databaseDefinitions
	ImportChildmw6g9jigDb
	(
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	databaseFileDefinitions
		"importchildmw6g9jig" number = 56;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:59;
	defaultFileDefinition "importchildmw6g9jig";
	classMapDefinitions
		GImportChildmw6g9jig in "importchildmw6g9jig";
		ImportChildmw6g9jig in "_usergui";
		SImportChildmw6g9jig in "_environ";
	)
typeSources
