'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');
const {createCreationModel}=require('../../extension/src/creation-model');
const {writeCreation}=require('../../extension/src/creation-files');
const {scanProject}=require('../../extension/src/native-project');
const {service}=require('../../test/cli-integration-fixture');
test('reviewed schema, ordinary class and dictionary sources compile through native CLI in private Working',{skip:process.env.JADE_CREATION_NATIVE!=='1',timeout:240000},async()=>{
 const source=process.env.JADE_CREATION_NATIVE_SOURCE,ini=process.env.JADE_CREATION_NATIVE_INI;
 assert.ok(source&&ini,'Explicit Source paths are required for the consistent native backup.');
 const base=path.resolve(__dirname,'../..'),artifacts=new HostTestArtifacts({evidencePath:path.join(base,'evidence/creation-native.json')});
 await artifacts.run(async stage=>{
  const root=path.join(stage,'workspace');fs.mkdirSync(root);const runtime=path.join(stage,'extension/vendor/jade-tools-cli');fs.mkdirSync(path.dirname(runtime),{recursive:true});fs.cpSync(path.join(base,'extension/vendor/jade-tools-cli'),runtime,{recursive:true});const entry=path.join(runtime,'jade-cli.exe');artifacts.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex');
  const schema='CreationProof'+Date.now().toString(36),context=()=>scanProject(root).then(project=>createCreationModel(project));
  let model=await context();const plan=model.preview({type:'schema',name:schema,parent:'RootSchema',version:'25.0.02'});assert.equal(plan.files.length,5);writeCreation(root,plan);
  const item=path.join(root,'schemas',schema,'types','CreationItem.cls');fs.writeFileSync(item,`jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\nCreationItem subclassOf Object transient;\ntypeDefinitions\nCreationItem completeDefinition\n(\nattributeDefinitions\n name: String[50];\n rank: Integer;\n)\ndatabaseDefinitions\ntypeSources\n`);
  model=await context();const ordinary=model.preview({type:'class',schema,name:'CreationChild',superclass:schema+'::CreationItem',lifetime:'transient'});writeCreation(root,ordinary);
  model=await context();
  for(const request of [{name:'CreationByName',kind:'member',keys:[{name:'name'},{name:'rank',descending:true}]},{name:'CreationDuplicates',kind:'member',duplicatesAllowed:true,loadFactor:66,keys:[{name:'name',caseInsensitive:true}]},{name:'CreationExternal',kind:'external',keys:[{name:'lookup',type:'String',length:50},{name:'rank',type:'Integer',descending:true}]}])writeCreation(root,model.preview({type:'collection',schema,membership:schema+'::CreationChild',lifetime:'transient',...request}));
  const config={installPath:process.env.JADE_CREATION_NATIVE_INSTALL||'C:/Jade2025',databasePath:source,iniPath:ini,server:'singleUser',workspaceRoots:[root],storagePath:path.join(stage,'state'),schema,program:ordinary.files[0].file,classFile:true,sourceProperties:true,projectBuild:true,timeoutMilliseconds:120000};
  const client=service(entry,path.join(stage,'broker'));
  try{const result=await client.request('build',config);assert.equal(result.passed,true,JSON.stringify(result));assert.notEqual(path.resolve(result.report.workingDatabase),path.resolve(source));assert.ok(path.resolve(result.report.workingDatabase).startsWith(path.resolve(config.storagePath)+path.sep));assert.ok(result.report.loaded_files>0);const repeated=await client.request('build',config);assert.equal(repeated.passed,true,JSON.stringify(repeated));assert.equal(repeated.report.loaded_files,0);fs.writeFileSync(path.join(stage,'host-report.json'),JSON.stringify({passed:true,nativeCLI:true,generatedSchema:true,generatedOrdinaryClass:true,inheritedMemberProperties:true,memberCompositeDirection:true,duplicatesCaseInsensitiveTuning:true,externalTypedKeys:true,unchangedLoaded:0,sourcePublished:false},null,2));}
  finally{try{await client.request('shutdown',{});}finally{await client.close();}}
 });
});
