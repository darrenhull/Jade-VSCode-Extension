 'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const paths={userSource:process.env.JADE_TEST_SOURCE};
const {prepareWorkingDatabase,loadWorkingFiles,runNativeTests}=require('../extension/src/working-database');
test('native working base compiles workspace classes and executes the real Jade test framework',{skip:process.env.JADE_CONNECTED_TESTS!=='1',timeout:180000},async()=>{
 if(!process.env.JADE_TEST_CONFIG || !paths.userSource) throw Error('Set JADE_TEST_CONFIG to a private fixture config and JADE_TEST_SOURCE to its source fixture.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jade-native-working-')),workspace=path.join(temp,'workspace'),storage=path.join(temp,'storage');fs.mkdirSync(workspace);const output=[];let working;
 const files=['schemas/SJetSchema/types/Fish.cls','schemas/SJetTestSchema/types/BaseUnitTest.cls','schemas/SJetTestSchema/types/FishTest.cls'].map(file=>{const to=path.join(workspace,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,fs.readFileSync(path.join(paths.userSource,file),'utf8').replaceAll('BaseUnitTest','FreshBaseUnitTest').replaceAll('FishTest','FreshFishTest'));return to;});
 const config={...JSON.parse(fs.readFileSync(process.env.JADE_TEST_CONFIG,'utf8')),storagePath:storage,workspaceRoots:[workspace],timeoutMilliseconds:90000};
 const record=text=>{output.push(text);};
 try{
  working=await prepareWorkingDatabase(config,record);assert.ok(working.databasePath.startsWith(storage));assert.notEqual(path.resolve(working.databasePath).toLowerCase(),path.resolve(config.databasePath).toLowerCase());
  const loaded=await loadWorkingFiles(working,files,record);assert.equal(loaded.success,true,JSON.stringify(loaded));
  const passed=await runNativeTests(working,{schema:'SJetTestSchema',owner:'FreshFishTest',source:files[2],text:fs.readFileSync(files[2],'utf8')},record);assert.equal(passed.success,true,JSON.stringify(passed));assert.equal(passed.results.length,4);assert.ok(passed.results.every(row=>row.status==='passed'));
  const tests=files[2],original=fs.readFileSync(tests,'utf8');fs.writeFileSync(tests,original.replace('assertEquals(18, fish.getLengthCm())','assertEquals(19, fish.getLengthCm())'));
  assert.equal((await loadWorkingFiles(working,[tests],record)).success,true);
  const failed=await runNativeTests(working,{schema:'SJetTestSchema',owner:'FreshFishTest',source:files[2],text:fs.readFileSync(files[2],'utf8')},record);assert.equal(failed.success,false);const failure=failed.results.find(row=>row.status==='failed'&&row.method==='accessors_SetValues_ReturnsValues');assert.ok(failure);assert.equal(failure.line,fs.readFileSync(tests,'utf8').split(/\r?\n/).findIndex(line=>line.includes('assertEquals(19,'))+1);
  const domain=files[0];fs.writeFileSync(domain,fs.readFileSync(domain,'utf8').replace('return self.name;','return self.noSuchProperty;'));
  const rejected=await loadWorkingFiles(working,[domain],record);assert.equal(rejected.success,false);assert.match(rejected.output,/6026|Unknown property/i);assert.equal(rejected.results[0].diagnostics[0].line,fs.readFileSync(domain,'utf8').split(/\r?\n/).findIndex(line=>line.includes('return self.noSuchProperty'))+1);
 }finally{
  fs.writeFileSync(path.join(__dirname,'../evidence/native-controls-output.txt'),output.join(''));fs.writeFileSync(path.join(__dirname,'../evidence/native-controls-location.json'),JSON.stringify({temp,working},null,2));
  console.log('Retained native working-base evidence: '+temp);
 }
});
