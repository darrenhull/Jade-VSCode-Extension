jadeVersionNumber "25.0.02";
schemaDefinition
ImportConsumermw6g9jig subschemaOf RootSchema completeDefinition;
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
importedPackageDefinitions
	CatalogA is ImportExporterAmw6g9jig::SharedTools
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	importedClassDefinitions
		Thing
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	CatalogB is ImportExporterBmw6g9jig::SharedTools
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	importedClassDefinitions
		Thing
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)

localeDefinitions
	2057 "English (United Kingdom)" schemaDefaultLocale;
	setModifiedTimeStamp "<unknown>" "" 2026:11:07:13:39:58;
typeHeaders
	ImportConsumermw6g9jig subclassOf RootSchemaApp transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2073;
	GImportConsumermw6g9jig subclassOf RootSchemaGlobal transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2072;
	ImportedCollectionTests subclassOf JadeTestCase transient, number = 2087;
	Thing subclassOf Object transient, highestOrdinal = 2, number = 2075;
	LocalThingChild subclassOf Thing transient, number = 2076;
	SImportConsumermw6g9jig subclassOf RootSchemaSession transient, sharedTransientAllowed, transientAllowed, subclassSharedTransientAllowed, subclassTransientAllowed, number = 2074;
	ImportedByName subclassOf MemberKeyDictionary transient, number = 2086;
	OtherImportedByName subclassOf MemberKeyDictionary transient, number = 2088;
membershipDefinitions
	ImportedByName of CatalogA::Thing;
	OtherImportedByName of CatalogB::Thing;
typeDefinitions
	CatalogA::Thing completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	CatalogB::Thing completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
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
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	Global completeDefinition
	(
	)
	RootSchemaGlobal completeDefinition
	(
	)
	GImportConsumermw6g9jig completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	JadeTestCase completeDefinition
	(
		setModifiedTimeStamp "cnwcb7" "99.0.00" 200922 2022:11:23:13:38:22.615;
	)
	ImportedCollectionTests completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:40:49;
	jadeMethodDefinitions
		packageAliases() unitTest, number = 1001;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:40:49;
	)
	Thing completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	attributeDefinitions
		localOnly:                     Integer number = 2, ordinal = 2;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
		name:                          String[50] number = 1, ordinal = 1;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	)
	LocalThingChild completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
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
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
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
	ImportedByName completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:40:49;
	)
	OtherImportedByName completeDefinition
	(
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:40:49;
	)
memberKeyDefinitions
	ImportedByName completeDefinition
	(
		name;
	)
	OtherImportedByName completeDefinition
	(
		name;
	)
databaseDefinitions
	ImportConsumermw6g9jigDb
	(
	setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	databaseFileDefinitions
		"importconsumermw6g9jig" number = 55;
		setModifiedTimeStamp "ServerTaskUser" "25.0.02" 2026:11:07:13:39:58;
	defaultFileDefinition "importconsumermw6g9jig";
	classMapDefinitions
		GImportConsumermw6g9jig in "importconsumermw6g9jig";
		ImportConsumermw6g9jig in "_usergui";
		SImportConsumermw6g9jig in "_environ";
	)
typeSources
	ImportedCollectionTests (
	jadeMethodSources
packageAliases
{
packageAliases() unitTest;
vars
 a: CatalogA::Thing;
 b: CatalogB::Thing;
 local: Thing;
 localChild: LocalThingChild;
 first: ImportedByName;
 second: OtherImportedByName;
begin
 create a transient; create b transient; create local transient; create localChild transient;
 create first transient; create second transient;
 a.name := "from A"; b.name := "from B"; local.name := "local"; local.localOnly := 42;
 first.add(a); second.add(b);
 assertEquals(a,first.getAtKey("from A")); assertEquals(b,second.getAtKey("from B"));
 assertEquals("from A",a.name); assertEquals("from B",b.name); assertEquals(42,local.localOnly);
epilog
 delete second; delete first; delete localChild; delete local; delete b; delete a;
end;
}
	)
