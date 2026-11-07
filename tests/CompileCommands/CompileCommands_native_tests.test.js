'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {requirePrivateSeed,createFixture,configFor,service}=require('../../test/cli-integration-fixture');
test('native project build includes unrelated changed and new classes while an unchanged workspace loads nothing',{skip:process.env.JADE_PROJECT_BUILD_NATIVE!=='1',timeout:240000},async t=>{
 requirePrivateSeed();const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-f5-native-proof-'));t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('jade-f5-native-proof-'));fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 const fixture=createFixture(root),entry=process.env.JADE_CLI_ENTRY||path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe'),client=service(entry,path.join(root,'broker'));
 const source=(owner,value)=>`jadeVersionNumber "25.0.02";\nschemaDefinition\n${fixture.schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf Object transient;\ntypeDefinitions\n${owner} completeDefinition\n(\njadeMethodDefinitions\nvalue() : Integer;\n)\ntypeSources\n${owner} (\njadeMethodSources\nvalue\n{\nvalue() : Integer;\nbegin\n return ${value};\nend;\n}\n)\n`;
 const other=path.join(path.dirname(fixture.domainFile),'CliUnrelated.cls');fs.writeFileSync(other,source('CliUnrelated','99'));fixture.files.push(other);
 const config={...configFor(fixture,fixture.domainFile),projectBuild:true},proof={};
 try{
  let result=await client.request('build',config);assert.equal(result.passed,true,JSON.stringify(result));assert.ok(result.report.loaded_files>0);proof.initialLoaded=result.report.loaded_files;assert.notEqual(path.resolve(result.report.workingDatabase),path.resolve(config.databasePath));assert.ok(path.resolve(result.report.workingDatabase).startsWith(path.resolve(fixture.storagePath)+path.sep));
  result=await client.request('build',config);assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.report.loaded_files,0);proof.unchangedLoaded=0;
  fs.writeFileSync(other,source('CliUnrelated','self.missingValue'));
  result=await client.request('build',{...config,projectBuild:false});assert.equal(result.passed,true,JSON.stringify(result));proof.currentFileIgnoresUnrelated=true;
  result=await client.request('build',config);assert.equal(result.passed,false,JSON.stringify(result));assert.ok(result.report.diagnostics.some(item=>Number(item.compiler_error)===6026&&path.resolve(item.source)===path.resolve(other)),JSON.stringify(result));proof.unrelatedChangedError=6026;
  fs.writeFileSync(other,source('CliUnrelated','101'));const created=path.join(path.dirname(other),'CliNewTarget.cls');fs.writeFileSync(created,source('CliNewTarget','102'));fixture.files.push(created);
  result=await client.request('build',config);assert.equal(result.passed,true,JSON.stringify(result));assert.ok(result.report.loaded_files>0);proof.newClassLoaded=true;
  result=await client.request('build',config);assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.report.loaded_files,0);proof.finalUnchangedLoaded=0;
  console.log('Native F5 incremental proof: '+JSON.stringify(proof));
 }finally{try{await client.request('shutdown',{});}finally{await client.close();}}
});
