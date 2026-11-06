'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scanProject,scaffoldSchema}=require('../extension/src/native-project');
const {joinProject,loadProject}=require('../extension/src/native-project-build');
const {prepareWorkingDatabase,runNativeTests}=require('../extension/src/working-database');
const {applyRenames}=require('../extension/src/native-renames');
test('native class rename preserves persistent instances and can be replayed',{skip:process.env.JADE_CONNECTED_TESTS!=='1',timeout:180000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-rename-')),source=path.join(root,'source');fs.mkdirSync(source);const name='Rename'+Date.now(),created=await scaffoldSchema(source,name,'RootSchema','25.0.02'),output=[];
 const prefix=`jadeVersionNumber "25.0.02";\nschemaDefinition\n${name} subschemaOf RootSchema partialDefinition;\n`;
 const widget=path.join(created.folder,'types/Widget.cls'),tests=path.join(created.folder,'types/DataTests.cls');
 fs.writeFileSync(widget,prefix+'typeHeaders\nWidget subclassOf Object highestOrdinal=1;\ntypeDefinitions\nWidget completeDefinition\n(\nattributeDefinitions\nstoredValue: Integer number=1, ordinal=1;\n)\ndatabaseDefinitions\ntypeSources\n');
 fs.writeFileSync(tests,prefix+'typeHeaders\nDataTests subclassOf JadeTestCase transient;\ntypeDefinitions\nDataTests completeDefinition\n(\njadeMethodDefinitions\nseed() unitTest;\npreserved() unitTest;\n)\ntypeSources\nDataTests (\njadeMethodSources\nseed\n{\nseed() unitTest;\nvars\nw : Widget;\nbegin\nbeginTransaction;\ncreate w persistent;\nw.storedValue := 42;\ncommitTransaction;\nassertEquals(42,w.storedValue);\nend;\n}\npreserved\n{\npreserved() unitTest;\nbegin\nassertNotNull(Widget.firstInstance);\nassertEquals(42,Widget.firstInstance.storedValue);\nend;\n}\n)\n');
 const config={installPath:'C:/Jade2025',databasePath:'C:/Jade2025/system',iniPath:'C:/Jade2025/system/jade.ini',workspaceRoots:[source],storagePath:path.join(root,'storage'),timeoutMilliseconds:90000};let working;
 const record=text=>output.push(text);
 async function build(){const project=await scanProject(source);await applyRenames(working,project,record);const bundle=await joinProject(working,project,record);const result=await loadProject(working,bundle,record);assert.equal(result.success,true,JSON.stringify(result));return project;}
 async function run(method){const result=await runNativeTests(working,{schema:name,owner:'DataTests',source:tests,text:fs.readFileSync(tests,'utf8'),methods:[method]},record);assert.equal(result.success,true,JSON.stringify(result));}
 try{
  working=await prepareWorkingDatabase(config,record);await build();await run('seed');
  fs.writeFileSync(widget,fs.readFileSync(widget,'utf8').replaceAll('Widget','RenamedWidget'));fs.writeFileSync(tests,fs.readFileSync(tests,'utf8').replaceAll('Widget','RenamedWidget'));
  const migrations=path.join(source,'migrations');fs.mkdirSync(migrations);fs.writeFileSync(path.join(migrations,'001-rename.jcf'),'JadeCommandFile\nJadeVersionNumber 25.0.02\nCommands\nRename Class '+name+'::Widget RenamedWidget\n');
  const project=await build();await run('preserved');assert.deepEqual(await applyRenames(working,project,record),[]);await run('preserved');
 }finally{fs.writeFileSync(path.join(__dirname,'../evidence/rename-native-output.txt'),output.join(''));fs.writeFileSync(path.join(__dirname,'../evidence/rename-native-location.json'),JSON.stringify({root,name,working},null,2));}
});
