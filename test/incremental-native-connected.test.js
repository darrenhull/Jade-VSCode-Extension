'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scaffoldSchema,scanProject}=require('../extension/src/native-project');
const {runProject}=require('../extension/src/project-runner');
const {loadWorkingFiles,runNativeTests}=require('../extension/src/working-database');
test('native project compiles edited bodies incrementally and executes their new results',{
 skip:process.env.JADE_INCREMENTAL_CONNECTED!=='1',timeout:120000
},async()=>{
 const base=path.resolve(__dirname,'..'),working=JSON.parse(fs.readFileSync(path.join(base,'evidence/advanced-collection-working.json'))),root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-incremental-proof-')),schema='IncrementalProof'+Date.now();
 const created=await scaffoldSchema(root,schema,'RootSchema','25.0.02'),header=`jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\n`;
 function cls(name,value){return header+`typeHeaders\n${name} subclassOf Object transient;\ntypeDefinitions\n${name} completeDefinition\n(\njadeMethodDefinitions\nvalue() : Integer;\n)\ntypeSources\n${name} (\njadeMethodSources\nvalue\n{\nvalue() : Integer;\nbegin\n return ${value};\nend;\n}\n)`;}
 const files=['IncrementalA','IncrementalB'].map((name,n)=>{const file=path.join(created.folder,'types',name+'.cls');fs.writeFileSync(file,cls(name,n+1));return file;});
 const config={program:files[0],workspaceRoots:[root],schema,databasePath:working.sourceDatabasePath};let output='';
 const full=await runProject(config,working,await scanProject(root),'compile',files,text=>output+=text);assert.equal(full.passed,true,JSON.stringify(full));
 for(let n=0;n<files.length;n++)fs.writeFileSync(files[n],cls(['IncrementalA','IncrementalB'][n],(n+1)*11));
 const started=performance.now(),incremental=await runProject(config,working,await scanProject(root),'compile',files,text=>output+=text),seconds=(performance.now()-started)/1000;
 assert.equal(incremental.passed,true,JSON.stringify(incremental));assert.equal(incremental.report.incremental,true);assert.equal(incremental.report.loaded_files,2);
 const proof=path.join(root,'Proof.cls');fs.writeFileSync(proof,header+'typeHeaders\nIncrementalChecks subclassOf JadeTestCase transient;\ntypeDefinitions\nIncrementalChecks completeDefinition\n(\njadeMethodDefinitions\nverify() unitTest;\n)\ntypeSources\nIncrementalChecks (\njadeMethodSources\nverify\n{\nverify() unitTest;\nvars\n a: IncrementalA;\n b: IncrementalB;\nbegin\n create a transient; create b transient;\n assertEquals(11,a.value()); assertEquals(22,b.value());\nepilog\n delete a; delete b;\nend;\n}\n)');
 const loaded=await loadWorkingFiles(working,[proof],text=>output+=text);assert.equal(loaded.success,true,loaded.output);
 const result=await runNativeTests(working,{schema,owner:'IncrementalChecks',methods:['verify']},text=>output+=text);assert.equal(result.success,true,JSON.stringify(result));
 fs.writeFileSync(path.join(base,'evidence/incremental-native.json'),JSON.stringify({passed:true,source:root,schema,workingDatabase:working.databasePath,changedClasses:2,incrementalSeconds:seconds,nativeExecution:true},null,2));fs.writeFileSync(path.join(base,'evidence/incremental-native-output.txt'),output);
});
