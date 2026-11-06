'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scanProject,scaffoldSchema}=require('../extension/src/native-project');
const {joinProject,loadProject}=require('../extension/src/native-project-build');
const {prepareWorkingDatabase,runNativeTests}=require('../extension/src/working-database');
const {startExtract,resolveExtractConfig}=require('../extension/src/extract');
test('native project creates a new schema, runs its tests, renames and deletes types without rebuilding the database',{skip:process.env.JADE_CONNECTED_TESTS!=='1',timeout:240000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-project-')),source=path.join(root,'source');fs.mkdirSync(source);
 const name='NativeFeature'+Date.now(),created=await scaffoldSchema(source,name,'RootSchema','25.0.02'),output=[];
 const cls=(owner,parent,definitions,methods)=>`jadeVersionNumber "25.0.02";\nschemaDefinition\n${name} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf ${parent} transient, transientAllowed, subclassTransientAllowed;\ntypeDefinitions\n${owner} completeDefinition\n(\njadeMethodDefinitions\n${definitions}\n)\ntypeSources\n${owner} (\njadeMethodSources\n${methods}\n)\n`;
 const domain=path.join(created.folder,'types/Widget.cls'),tests=path.join(created.folder,'types/WidgetTests.cls');
 fs.writeFileSync(domain,cls('Widget','Object','getValue() : Integer;','getValue\n{\ngetValue() : Integer;\nbegin\nreturn 42;\nend;\n}'));
 fs.writeFileSync(tests,cls('WidgetTests','JadeTestCase','check() unitTest;','check\n{\ncheck() unitTest;\nvars\nw : Widget;\nbegin\ncreate w transient;\nassertEquals(42,w.getValue());\nepilog\ndelete w;\nend;\n}'));
 const config={installPath:'C:/Jade2025',databasePath:'C:/Jade2025/system',iniPath:'C:/Jade2025/system/jade.ini',workspaceRoots:[source],storagePath:path.join(root,'storage'),timeoutMilliseconds:90000};
 let working;
 async function build(){const bundle=await joinProject(working,await scanProject(source),record);const result=await loadProject(working,bundle,record);assert.equal(result.success,true,JSON.stringify(result));return bundle;}
 const record=text=>output.push(text);
 async function extracted(label){const folder=path.join(root,label);const result=await startExtract(resolveExtractConfig({...config,databasePath:working.databasePath,iniPath:working.iniPath}),folder,record).completion;assert.equal(result.success,true);return path.join(folder,name,'Types');}
 try{
  working=await prepareWorkingDatabase(config,record);await build();
  const passed=await runNativeTests(working,{schema:name,owner:'WidgetTests',source:tests,text:fs.readFileSync(tests,'utf8')},record);assert.equal(passed.success,true,JSON.stringify(passed));
  fs.writeFileSync(domain,fs.readFileSync(domain,'utf8').replaceAll('Widget','RenamedWidget'));fs.writeFileSync(tests,fs.readFileSync(tests,'utf8').replaceAll('Widget','RenamedWidget'));
  // File names deliberately do not match the renamed classes.
  await build();const afterRename=await extracted('renamed');assert.equal(fs.existsSync(path.join(afterRename,'Widget.cls')),false);assert.equal(fs.existsSync(path.join(afterRename,'RenamedWidget.cls')),true);
  fs.unlinkSync(domain);fs.unlinkSync(tests);await build();const afterDelete=await extracted('deleted');assert.equal(fs.existsSync(path.join(afterDelete,'RenamedWidget.cls')),false);
 }finally{fs.writeFileSync(path.join(__dirname,'../evidence/project-native-output.txt'),output.join(''));fs.writeFileSync(path.join(__dirname,'../evidence/project-native-location.json'),JSON.stringify({root,name,working},null,2));}
});
