'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');
const {createCreationModel}=require('../../extension/src/creation-model');
const {writeCreation}=require('../../extension/src/creation-files');
const {scanProject}=require('../../extension/src/native-project');
const {service}=require('../../test/cli-integration-fixture');
// Grammar comes from Jade Software's published package extracts. The opt-in
// run verifies it on the installed native runtime and retains fresh extracts.
test('native packages preserve alias identity, exported properties and inherited import visibility',{skip:process.env.JADE_CREATION_NATIVE!=='1',timeout:600000},async()=>{
 const source=process.env.JADE_CREATION_NATIVE_SOURCE,ini=process.env.JADE_CREATION_NATIVE_INI;assert.ok(source&&ini,'Explicit Source backup paths required; this proof never publishes.');
 const base=path.resolve(__dirname,'../..'),artifacts=new HostTestArtifacts({evidencePath:path.join(base,'evidence/creation-imports-native.json')});
 await artifacts.run(async stage=>{
  const root=path.join(stage,'workspace');fs.mkdirSync(root);const runtime=path.join(stage,'extension/vendor/jade-tools-cli');fs.mkdirSync(path.dirname(runtime),{recursive:true});fs.cpSync(process.env.JADE_CREATION_NATIVE_CLI_DIST||path.join(base,'extension/vendor/jade-tools-cli'),runtime,{recursive:true});const entry=path.join(runtime,'jade-cli.exe');const manifest=JSON.parse(fs.readFileSync(path.join(runtime,'distribution.json'),'utf8'));assert.equal(manifest.runtime,'native-cpp');assert.equal(manifest.executableSha256,crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'));artifacts.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex');
  const suffix=Date.now().toString(36),exporterA='ImportExporterA'+suffix,exporterB='ImportExporterB'+suffix,consumer='ImportConsumer'+suffix,child='ImportChild'+suffix,probe='ImportProbe'+suffix,importOnly='ImportOnly'+suffix;
  const folder=name=>path.join(root,'schemas',name),types=name=>path.join(folder(name),'types'),head=name=>`jadeVersionNumber "25.0.02";\nschemaDefinition\n${name} subschemaOf ${name===child?consumer:'RootSchema'} partialDefinition;\n`;
  const cls=(schema,name,parent,definition='',sources='',membership='',keys='')=>head(schema)+`typeHeaders\n\t${name} subclassOf ${parent} transient;\n`+(membership?`membershipDefinitions\n\t${name} of ${membership};\n`:'')+`typeDefinitions\n\t${name} completeDefinition\n\t(\n${definition}\n\t)\n`+(keys?`memberKeyDefinitions\n\t${name} completeDefinition\n\t(\n\t ${keys};\n\t)\n`:'')+`databaseDefinitions\ntypeSources\n`+sources;
  const put=(schema,name,text)=>{const file=path.join(types(schema),name+'.cls');fs.writeFileSync(file,text);return file;};
  for(const name of [exporterA,exporterB,consumer,child,probe,importOnly]){const model=createCreationModel(await scanProject(root));writeCreation(root,model.preview({type:'schema',name,parent:name===child?consumer:'RootSchema',version:'25.0.02'}));}
  for(const schema of [exporterA,exporterB,consumer,child,probe,importOnly]){
   const packageApp=[exporterA,exporterB].includes(schema)?'<JadeExportedPackage name="SharedTools"><application name="'+schema+'" /></JadeExportedPackage>':'';
   fs.writeFileSync(path.join(folder(schema),'applications',schema+'.ddx'),'<?xml version="1.0" encoding="UTF-8"?>\r\n<schema name="'+schema+'" JadeVersionNumber="25.0.02" CompleteDefinition="true">\r\n<Application name="'+schema+'"><applicationType>G</applicationType><defaultApp>true</defaultApp><name>'+schema+'</name></Application>'+packageApp+'</schema>\r\n');
  }
  for(const schema of [exporterA,exporterB]){
   put(schema,'Thing',cls(schema,'Thing','Object','attributeDefinitions\n name: String[50];\n secret: String[50];'));
   const packages=path.join(folder(schema),'packages');fs.mkdirSync(packages);
   fs.writeFileSync(path.join(packages,'exportedPackageDefinitions.sec'),'exportedPackageDefinitions\n\tSharedTools\n\t(\n\texportedClassDefinitions\n\t\tThing transientAllowed, transient\n\t\t(\n\t\texportedPropertyDefinitions\n\t\t\tname;\n\t\t)\n\t)\n');
  }
  fs.mkdirSync(path.join(folder(consumer),'packages'));
  fs.writeFileSync(path.join(folder(consumer),'packages/importedPackageDefinitions.sec'),`importedPackageDefinitions\n\tCatalogA is ${exporterA}::SharedTools\n\t(\n\timportedClassDefinitions\n\t\tThing\n\t)\n\tCatalogB is ${exporterB}::SharedTools\n\t(\n\timportedClassDefinitions\n\t\tThing\n\t)\n`);
  fs.mkdirSync(path.join(folder(importOnly),'packages'));fs.writeFileSync(path.join(folder(importOnly),'packages/importedPackageDefinitions.sec'),`importedPackageDefinitions\n\tOnlyPackage is ${exporterA}::SharedTools\n\t(\n\timportedClassDefinitions\n\t\tThing\n\t)\n`);
  put(consumer,'Thing',cls(consumer,'Thing','Object','attributeDefinitions\n name: String[50];\n localOnly: Integer;'));
  put(consumer,'LocalThingChild',cls(consumer,'LocalThingChild','Thing'));
  const creation=createCreationModel(await scanProject(root));for(const [schema,name,alias]of [[consumer,'ImportedByName','CatalogA'],[consumer,'OtherImportedByName','CatalogB'],[child,'ChildImportedByName','CatalogA']]){const membership=consumer+'::'+alias+'::Thing';assert.deepEqual(creation.keyChoices({schema,membership}).items.map(property=>property.name),['name']);writeCreation(root,creation.preview({type:'collection',schema,name,kind:'member',membership,lifetime:'transient',keys:[{name:'name'}]}));}
  const inheritedBody=`inheritedAlias() unitTest;
vars
 value: CatalogA::Thing;
 dictionary: ChildImportedByName;
begin
 create value transient; create dictionary transient;
 value.name := "inherited alias"; dictionary.add(value);
 assertEquals(value,dictionary.getAtKey("inherited alias"));
epilog
 delete dictionary; delete value;
end;`;
  const childProgram=put(child,'InheritedPackageTests',cls(child,'InheritedPackageTests','JadeTestCase','jadeMethodDefinitions\n inheritedAlias() unitTest;',`InheritedPackageTests (\njadeMethodSources\ninheritedAlias\n{\n${inheritedBody}\n}\n)\n`));
  const body=`packageAliases() unitTest;
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
end;`;
  const program=put(consumer,'ImportedCollectionTests',cls(consumer,'ImportedCollectionTests','JadeTestCase','jadeMethodDefinitions\n packageAliases() unitTest;',`ImportedCollectionTests (\njadeMethodSources\npackageAliases\n{\n${body}\n}\n)\n`));
  const inputSnapshot=new Map();function snapshot(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())snapshot(file);else inputSnapshot.set(file,fs.readFileSync(file));}}snapshot(root);const project=await scanProject(root),config={installPath:process.env.JADE_CREATION_NATIVE_INSTALL||'C:/Jade2025',databasePath:source,iniPath:ini,server:'singleUser',workspaceRoots:[root],storagePath:path.join(stage,'state'),schema:consumer,program,files:project.schemas.flatMap(s=>s.classes.map(c=>c.file)),classFile:true,sourceProperties:true,methods:['packageAliases'],testDependencyScope:'static',timeoutMilliseconds:120000},client=service(entry,path.join(stage,'broker')),proof={cliVersion:manifest.packageVersion,cliSha256:artifacts.nativeSha256,candidateDistribution:process.env.JADE_CREATION_NATIVE_CLI_DIST||null,packageSecNewlines:'LF',jadeVersion:'25.0.02',sourcePublished:false,schemas:{exporterA,exporterB,consumer,child},results:[]};
  const record=(name,result)=>{proof.results.push({name,...result});fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify(proof,null,2));console.log(name+': '+result.code+' '+result.passed);};
  try{
   const delayed=[path.join(types(consumer),'ImportedByName.cls'),path.join(types(consumer),'OtherImportedByName.cls'),path.join(types(consumer),'ImportedCollectionTests.cls'),path.join(types(child),'ChildImportedByName.cls'),childProgram].map(file=>({file,text:fs.readFileSync(file,'utf8')}));for(const value of delayed)fs.unlinkSync(value.file);
   const baselineProject=await scanProject(root),baseline=await client.request('build',{...config,program:path.join(types(consumer),'Thing.cls'),files:baselineProject.schemas.flatMap(s=>s.classes.map(c=>c.file)),projectBuild:true});record('native-package-baseline',baseline);assert.equal(baseline.passed,true,JSON.stringify(baseline));
   const baselineTarget=(await client.request('working.location',config)).working;await client.request('disconnect',{});const baselineEvidence=path.join(base,'evidence/import-native');fs.mkdirSync(baselineEvidence,{recursive:true});
   const assembled=[];function inspectAssembly(directory){if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())inspectAssembly(file);else if(/\.(scm|ddx)$/i.test(file)&&fs.statSync(file).size<131072)assembled.push({file:path.relative(baselineTarget.assemblyRoot,file),text:require('../../extension/src/native-project').decode(fs.readFileSync(file))});}}inspectAssembly(baselineTarget.assemblyRoot);fs.writeFileSync(path.join(baselineEvidence,'assembled.json'),JSON.stringify(assembled,null,2));
   const packageMeta=await client.request('workspace.run',{...config,schema:probe,application:probe,program:path.join(types(consumer),'Thing.cls'),files:baselineProject.schemas.flatMap(s=>s.classes.map(c=>c.file))},{source:path.join(root,'package-metadata.jade'),sourceText:`vars\n provider:Schema; packages:Object; package:Object; application:Object; applications:Object;\nbegin\n provider := rootSchema.getSchema("${exporterA}");\n write provider.getName();\n packages := provider.getPropertyValue("exportedPackages").Object;\n package := packages.sendMsg("first").Object;\n write package.getPropertyValue("name");\n application := package.getPropertyValue("application").Object;\n write application = null;\n if application <> null then write application.getPropertyValue("name"); endif;\n applications := provider.getPropertyValue("_applications").Object;\n write applications.sendMsg("size");\n write provider.getLocalPackage("SharedTools") = package;\nend;`});record('native-package-application-metadata',packageMeta);assert.equal(packageMeta.passed,true);assert.ok(packageMeta.report.output.includes('\nfalse\n'+exporterA+'\n1\n'),'Native package application association required');await client.request('disconnect',{});
   for(const name of [exporterA,exporterB,consumer]){const destination=path.join(stage,'baseline-'+name);fs.mkdirSync(destination);const extracted=await client.request('native.run',{...config,databasePath:baselineTarget.databasePath,iniPath:baselineTarget.iniPath},{executable:path.join(config.installPath,'bin/jadclient.exe'),args:['path='+baselineTarget.databasePath,'ini='+baselineTarget.iniPath,'server=singleUser','schema=JadeSchema','app=JadeBatchExtract','startAppParameters','Single',path.join(destination,'schema.scm'),path.join(destination,'schema.ddx'),name,'<utf8Encoding>'],options:{timeoutMilliseconds:60000,cwd:stage}});record(name+'-baseline-extract',extracted);if(extracted.passed){fs.copyFileSync(path.join(destination,'schema.scm'),path.join(baselineEvidence,name+'-baseline.scm'));if(fs.existsSync(path.join(destination,'schema.ddx')))fs.copyFileSync(path.join(destination,'schema.ddx'),path.join(baselineEvidence,name+'-baseline.ddx'));}}
   for(const value of delayed)fs.writeFileSync(value.file,value.text);
   const built=await client.request('build',{...config,projectBuild:true});record('native-package-source',built);assert.equal(built.passed,true,JSON.stringify(built));
   const ran=await client.request('test',config);if(ran.report?.logFile&&fs.existsSync(ran.report.logFile))proof.nativeTestLog=require('../../extension/src/native-project').decode(fs.readFileSync(ran.report.logFile)).slice(-32000);record('native-package-alias-runtime',ran);assert.equal(ran.passed,true,JSON.stringify(ran));assert.equal(ran.report.tests_completed,true);
   const inherited=await client.request('test',{...config,schema:child,program:childProgram,methods:['inheritedAlias']});record('native-inherited-alias-runtime',inherited);assert.equal(inherited.passed,true,JSON.stringify(inherited));assert.equal(inherited.report.tests_completed,true);
   for(const negative of [{schema:importOnly,name:'ImportedSubclass',text:cls(importOnly,'ImportedSubclass','Thing')},{schema:consumer,name:'HiddenImportedProperty',text:cls(consumer,'HiddenImportedProperty','Object','jadeMethodDefinitions\n hidden() : String;',`HiddenImportedProperty (\njadeMethodSources\nhidden\n{\nhidden() : String;\nvars\n value: CatalogA::Thing;\nbegin\n return value.secret;\nend;\n}\n)\n`)}]){
    const file=put(negative.schema,negative.name,negative.text),rejected=await client.request('build',{...config,schema:negative.schema,program:file,projectBuild:true});record(negative.name,rejected);assert.equal(rejected.passed,false,JSON.stringify(rejected));assert.ok(rejected.report.diagnostics.some(d=>d.compiler_error===(negative.name==='ImportedSubclass'?6022:6026)),JSON.stringify(rejected));fs.unlinkSync(file);
   }
   const recovered=await client.request('build',{...config,projectBuild:true});assert.equal(recovered.passed,true,JSON.stringify(recovered));
   const target=(await client.request('working.location',config)).working;await client.request('disconnect',{});
   const evidence=path.join(base,'evidence/import-native');fs.mkdirSync(evidence,{recursive:true});
   for(const name of [exporterA,exporterB,consumer,child,probe,importOnly]){
    const destination=path.join(stage,'extract-'+name);fs.mkdirSync(destination);
    const extracted=await client.request('native.run',{...config,databasePath:target.databasePath,iniPath:target.iniPath},{executable:path.join(config.installPath,'bin/jadclient.exe'),args:['path='+target.databasePath,'ini='+target.iniPath,'server=singleUser','schema=JadeSchema','app=JadeBatchExtract','startAppParameters','Single',path.join(destination,'schema.scm'),path.join(destination,'schema.ddx'),name,'<utf8Encoding>'],options:{timeoutMilliseconds:60000,cwd:stage}});
    assert.equal(extracted.passed,true,JSON.stringify(extracted));fs.copyFileSync(path.join(destination,'schema.scm'),path.join(evidence,name+'.scm'));
   }
   for(const [file,bytes]of inputSnapshot)assert.deepEqual(fs.readFileSync(file),bytes,'Input preserved '+file);proof.inputBytesPreserved=true;proof.passed=true;proof.aliasesAndLocalSameName=true;proof.exportedPropertyKey=true;proof.inheritedImport=true;proof.inheritedAliasExecuted=true;proof.modelGeneratedImportedDictionaries=true;proof.importedSubclassRejected=true;proof.unexportedPropertyRejected=true;fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify(proof,null,2));
  }finally{try{await client.request('shutdown',{});}finally{await client.close();}}
 });
});
