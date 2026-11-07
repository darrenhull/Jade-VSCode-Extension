'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');
const {createCreationModel}=require('../../extension/src/creation-model');
const {writeCreation}=require('../../extension/src/creation-files');
const {scanProject}=require('../../extension/src/native-project');
const {service}=require('../../test/cli-integration-fixture');
test('generated object collections preserve native order, uniqueness and class tuning at runtime',{skip:process.env.JADE_CREATION_NATIVE!=='1',timeout:600000},async()=>{
 const source=process.env.JADE_CREATION_NATIVE_SOURCE,ini=process.env.JADE_CREATION_NATIVE_INI;
 assert.ok(source&&ini,'Explicit Source paths are required for a native consistent backup; tests never publish.');
 const base=path.resolve(__dirname,'../..'),artifacts=new HostTestArtifacts({evidencePath:path.join(base,'evidence/creation-collections-native.json')});
 await artifacts.run(async stage=>{
  const root=path.join(stage,'workspace');fs.mkdirSync(root);const runtime=path.join(stage,'extension/vendor/jade-tools-cli');fs.mkdirSync(path.dirname(runtime),{recursive:true});fs.cpSync(process.env.JADE_CREATION_NATIVE_CLI_DIST||path.join(base,'extension/vendor/jade-tools-cli'),runtime,{recursive:true});const entry=path.join(runtime,'jade-cli.exe');artifacts.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex');
  const schema='CollectionsProof'+Date.now().toString(36),head=`jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\n`,refresh=()=>scanProject(root).then(project=>createCreationModel(project));
  let model=await refresh();writeCreation(root,model.preview({type:'schema',name:schema,parent:'RootSchema',version:'25.0.02'}));
  const folder=path.join(root,'schemas',schema,'types'),item=path.join(folder,'CollectionItem.cls');
  fs.writeFileSync(item,head+'typeHeaders\nCollectionItem subclassOf Object transient;\ntypeDefinitions\nCollectionItem completeDefinition\n(\nattributeDefinitions\nname: String[50];\n)\ndatabaseDefinitions\ntypeSources\n');
  const databaseFile=path.join(root,'schemas',schema,'databaseDefinitions.sec');fs.writeFileSync(databaseFile,fs.readFileSync(databaseFile,'utf8').replace('databaseFileDefinitions','databaseFileDefinitions\n "alternate";'));
  model=await refresh();
  for(const request of [{name:'GeneratedArray',collectionFamily:'objectArray',blockSize:16},{name:'GeneratedPopulationArray',collectionFamily:'objectArray',expectedPopulation:1000},{name:'GeneratedSet',collectionFamily:'objectSet',blockSize:16,loadFactor:66},{name:'GeneratedDefaultSet',collectionFamily:'objectSet',expectedPopulation:0}])writeCreation(root,model.preview({type:'collection',schema,membership:schema+'::CollectionItem',lifetime:'transient',keys:[],...request}));
  writeCreation(root,model.preview({type:'collection',schema,name:'GeneratedBudget512',collectionFamily:'externalDictionary',membership:schema+'::CollectionItem',lifetime:'transient',keys:[{name:'first',type:'String',length:256,comparison:'binary',locale:2057,caseInsensitive:true},{name:'second',type:'String',length:256,comparison:'binary',locale:2057,caseInsensitive:true}]}));
  const alternate=model.storage({schema}).items.find(file=>file.name==='alternate');assert.ok(alternate?.id);
  const mapping=model.preview({type:'collection',schema,name:'GeneratedMappedSet',collectionFamily:'objectSet',membership:schema+'::CollectionItem',lifetime:'transient',keys:[],mapFile:alternate.id});
  const updates=mapping.files.filter(file=>file.operation==='update');assert.equal(updates.length,1);assert.equal(updates[0].file,databaseFile);
  writeCreation(root,{...mapping,files:mapping.files.filter(file=>file.operation!=='update')});
  // The extension-host proof exercises VS Code's reviewed WorkspaceEdit. Here
  // the disposable fixture writes the exact generated update bytes so Jade can
  // independently validate their native mapping semantics.
  for(const update of updates){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(update.file)).digest('hex'),update.expectedHash);const bom=!update.bom?Buffer.alloc(0):update.encoding==='utf16le'?Buffer.from([255,254]):Buffer.from([239,187,191]);fs.writeFileSync(update.file,Buffer.concat([bom,Buffer.from(update.text,update.encoding)]));}
  fs.writeFileSync(path.join(folder,'CollectionOwner.cls'),head+'typeHeaders\nCollectionOwner subclassOf Object;\ntypeDefinitions\nCollectionOwner completeDefinition\n(\nattributeDefinitions\n ownedSet: GeneratedMappedSet readonly;\n)\ndatabaseDefinitions\ntypeSources\n');
  const body=`nativeCollectionSemantics() unitTest;
vars
 a,b: CollectionItem;
 ordered: GeneratedArray;
 unique: GeneratedSet;
 population: GeneratedPopulationArray;
 defaults: GeneratedDefaultSet;
 stats: JadeDynamicObject;
 dictionary: GeneratedBudget512;
 keyText: String;
 index: Integer;
 keyMetadata: Object;
 mapped: GeneratedMappedSet;
 classMap: Object;
begin
 create a transient; create b transient;
 create ordered transient; create unique transient;
 create population transient; create defaults transient;
 create stats transient;
 create dictionary transient;
 create mapped transient;
 ordered.add(a); ordered.add(b); ordered.add(a);
 assertEquals(3,ordered.size());
 assertEquals(a,ordered[1]); assertEquals(b,ordered[2]); assertEquals(a,ordered[3]);
 assertTrue(unique.tryAdd(a)); assertFalse(unique.tryAdd(a)); assertTrue(unique.tryAdd(b));
 assertEquals(2,unique.size()); assertTrue(unique.includes(a)); assertTrue(unique.includes(b));
 assertEquals(16,ordered.class().getPropertyValue("blockSize"));
 assertEquals(16,unique.class().getPropertyValue("blockSize"));
 assertEquals(66,unique.class().getPropertyValue("loadFactor"));
 assertEquals(1000,population.class().getPropertyValue("expectedPopulation"));
 assertEquals(0,defaults.class().getPropertyValue("expectedPopulation"));
 ordered.getStatistics(stats); assertEquals(16,stats.getPropertyValue("blockSize"));
 unique.getStatistics(stats); assertEquals(16,stats.getPropertyValue("blockSize"));
 keyText := "";
 foreach index in 1 to 127 do keyText := keyText & "a"; endforeach;
 dictionary.putAtKey(keyText,keyText,a);
 assertEquals(a,dictionary.getAtKey(keyText,keyText));
 dictionary.getStatistics(stats); assertEquals(512,stats.getPropertyValue("keyLength"));
 keyMetadata := dictionary.class().getPropertyValue("keys").Object.sendMsg("first").Object;
 assertEquals(0,keyMetadata.getPropertyValue("sortOrder"));
 assertEquals(false,keyMetadata.getPropertyValue("caseInsensitive"));
 dictionary.putAtKey("a","x",a); dictionary.putAtKey("A","x",b);
 assertEquals(b,dictionary.first());
 assertEquals(a,dictionary.getAtKey("a","x")); assertEquals(b,dictionary.getAtKey("A","x"));
 dictionary.clear(); dictionary.putAtKey("\u00e9","x",a); dictionary.putAtKey("z","x",b);
 assertEquals(b,dictionary.first()); assertEquals(a,dictionary.getAtKey("\u00e9","x"));
 classMap := mapped.class().getPropertyValue("classMapRefs").Object.sendMsg("first").Object;
 assertEquals("alternate",classMap.getPropertyValue("diskFile").Object.getPropertyValue("name"));
epilog
 delete mapped; delete dictionary; delete stats; delete defaults; delete population; delete unique; delete ordered; delete a; delete b;
end;`;
  const program=path.join(folder,'GeneratedCollectionTests.cls');fs.writeFileSync(program,head+'typeHeaders\nGeneratedCollectionTests subclassOf JadeTestCase transient;\ntypeDefinitions\nGeneratedCollectionTests completeDefinition\n(\njadeMethodDefinitions\nnativeCollectionSemantics() unitTest;\n)\ndatabaseDefinitions\ntypeSources\nGeneratedCollectionTests (\njadeMethodSources\nnativeCollectionSemantics\n{\n'+body+'\n}\n)');
  const project=await scanProject(root),config={installPath:process.env.JADE_CREATION_NATIVE_INSTALL||'C:/Jade2025',databasePath:source,iniPath:ini,server:'singleUser',workspaceRoots:[root],storagePath:path.join(stage,'state'),schema,program,files:project.schemas.flatMap(s=>s.classes.map(c=>c.file)),classFile:true,sourceProperties:true,methods:['nativeCollectionSemantics'],testDependencyScope:'static',timeoutMilliseconds:120000},client=service(entry,path.join(stage,'broker'));
  try{const built=await client.request('build',{...config,projectBuild:true});assert.equal(built.passed,true,JSON.stringify(built));assert.notEqual(path.resolve(built.report.workingDatabase),path.resolve(source));const result=await client.request('test',config);assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.report.tests_completed,true);assert.equal(result.report.failures,0);assert.equal(result.report.results.length,1);assert.equal(result.report.results[0].method,'nativeCollectionSemantics');
   const placementSource=`vars
 owner:CollectionOwner; member:CollectionItem; independent:GeneratedMappedSet;
 targetFile:DbFile; stats:JadeDynamicObject; beforeWrites,afterOwnerWrites,afterIndependentWrites:Integer64;
begin
 create stats transient; targetFile := GeneratedMappedSet.getDbFile(); write targetFile.getName();
 targetFile.getStatistics(stats);beforeWrites:=stats.getPropertyValue("logicalWrites").Integer64;
 beginTransaction;create owner persistent;create member persistent;owner.ownedSet.add(member);commitTransaction;
 targetFile.getStatistics(stats);afterOwnerWrites:=stats.getPropertyValue("logicalWrites").Integer64;
 write afterOwnerWrites=beforeWrites;
 beginTransaction;create independent persistent;independent.add(member);commitTransaction;
 targetFile.getStatistics(stats);afterIndependentWrites:=stats.getPropertyValue("logicalWrites").Integer64;
 write afterIndependentWrites>afterOwnerWrites;
 write owner.ownedSet.includes(member);write independent.includes(member);
 beginTransaction;delete independent;delete owner;delete member;commitTransaction;
epilog
 delete stats;
end;`;
   const placement=await client.request('workspace.run',config,{source:path.join(root,'native-storage-placement.jade'),sourceText:placementSource});assert.equal(placement.passed,true,JSON.stringify(placement));assert.equal(placement.report.output.trim(),'alternate\ntrue\ntrue\ntrue\ntrue');
   const target=(await client.request('working.location',config)).working;await client.request('disconnect',{});const destination=path.join(stage,'native-extract');fs.mkdirSync(destination);const extracted=await client.request('native.run',{...config,databasePath:target.databasePath,iniPath:target.iniPath},{executable:path.join(config.installPath,'bin/jadclient.exe'),args:['path='+target.databasePath,'ini='+target.iniPath,'server=singleUser','schema=JadeSchema','app=JadeBatchExtract','startAppParameters','Single',path.join(destination,'schema.scm'),path.join(destination,'schema.ddx'),schema,'<utf8Encoding>'],options:{timeoutMilliseconds:60000,cwd:stage}});assert.equal(extracted.passed,true,JSON.stringify(extracted));const nativeExtract=require('../../extension/src/native-project').decode(fs.readFileSync(path.join(destination,'schema.scm')));assert.match(nativeExtract,/GeneratedMappedSet in "alternate"/);
   // Bypass the designer only in this private fixture to prove the native
   // rejection behind the UI's known external-String budget check.
   for(const [owner,lengths]of [['Overflow513',[256,257]],['Overflow600',[300,300]]]){
    const invalid=path.join(folder,owner+'.cls');fs.writeFileSync(invalid,head+`typeHeaders\n${owner} subclassOf ExtKeyDictionary transient;\nmembershipDefinitions\n${owner} of CollectionItem;\ntypeDefinitions\n${owner} completeDefinition\n(\n)\nexternalKeyDefinitions\n${owner} completeDefinition\n(\nfirst: String[${lengths[0]}];\nsecond: String[${lengths[1]}];\n)\ndatabaseDefinitions\ntypeSources\n`);
    const rejected=await client.request('build',{...config,projectBuild:true});assert.equal(rejected.passed,false,JSON.stringify(rejected));assert.equal(rejected.code,6206,JSON.stringify(rejected));assert.ok(rejected.report.diagnostics.some(d=>Number(d.compiler_error)===6206));fs.unlinkSync(invalid);
   }
   const recovered=await client.request('build',{...config,projectBuild:true});assert.equal(recovered.passed,true,JSON.stringify(recovered));
   fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify({jadeVersion:'25.0.02',cliVersion:JSON.parse(fs.readFileSync(path.join(runtime,'distribution.json'),'utf8')).packageVersion,placementSource,placementResult:placement,nativeExtract,passed:true,nativeCLI:true,modelGeneratedSource:true,arrayOrderAndRepeatedObjects:true,setUniqueMembers:true,explicitBlockEntries:true,expectedPopulation:true,zeroNativeDefault:true,setBtreeLoadFactor:true,actualBlockStatistics:true,modelGeneratedExistingMap:true,externalNativeStringBudget512:true,externalNativeStringBudget513Rejected:6206,externalNativeStringBudget600Rejected:6206,explicitBinaryCanonicalizesStaleLocaleAndCase:true,binaryMetadataAndCaseSensitiveOrdering:true,recoveredAfterRejection:true,sourcePublished:false},null,2));}
  finally{try{await client.request('shutdown',{});}finally{await client.close();}}
 });
});
