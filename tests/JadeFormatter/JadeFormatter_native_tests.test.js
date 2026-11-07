'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {requirePrivateSeed,createFixture,configFor,service}=require('../../test/cli-integration-fixture');
const {formattingEdits}=require('../../extension/src/jade-formatter');
test('native Jade compiles and executes the same tests before and after indentation formatting',{skip:process.env.JADE_FORMATTER_NATIVE!=='1',timeout:180000},async t=>{
  requirePrivateSeed();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-formatting-proof-'));
  t.after(()=>{
    const resolved=path.resolve(root);
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('jade-formatting-proof-'));
    fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    assert.equal(fs.existsSync(root),false,'The owned native fixture must be removed after shutdown.');
  });
  const fixture=createFixture(root);
  const entry=process.env.JADE_CLI_ENTRY||path.resolve(__dirname,'../../extension/vendor/jade-tools-cli/jade-cli.exe');
  const client=service(entry,path.join(root,'broker')),config=configFor(fixture,fixture.testFile);
  fs.writeFileSync(fixture.domainFile,fixture.domain('result').replace('jadeMethodDefinitions','attributeDefinitions\n    publishedValue: Integer;\njadeMethodDefinitions').replace('begin\n return result;', 'vars\n result: Integer;\nbegin\n result := 40;\n if result > 0\n and result < 42 then\n while result < 42 do\n result := result + 1;\n endwhile;\n endif;\n switch result do\n case 42:\n result := 42;\n default:\n result := 0;\n endswitch;\n return result;'));
  try {
    const before=await client.request('test',config);assert.equal(before.passed,true,JSON.stringify(before));assert.equal(before.report.tests_completed,true);
    let changed=0;
    for(const file of [fixture.domainFile,fixture.testFile]) {
      let source=fs.readFileSync(file,'utf8');const original=source,edits=formattingEdits(source,{insertSpaces:true,tabSize:4},undefined,file);changed+=edits.length;
      for(const edit of edits.reverse())source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
      fs.writeFileSync(file,source);assert.deepEqual(formattingEdits(source,{insertSpaces:true,tabSize:4},undefined,file),[]);
      assert.equal(source.replace(/\s/g,''),original.replace(/\s/g,''));
      if(file===fixture.domainFile)assert.ok(source.includes('\n        publishedValue: Integer;'));
    }
    assert.ok(changed>=8,'The native proof must actually format nested control/declaration lines.');
    const after=await client.request('test',config);assert.equal(after.passed,true,JSON.stringify(after));assert.equal(after.report.tests_completed,true);
    assert.ok(after.report.loaded_files>0,'Formatted sources must actually reach the native compiler.');
    assert.deepEqual(after.report.results.map(row=>({method:row.method,status:row.status})),before.report.results.map(row=>({method:row.method,status:row.status})));
  } finally {
    await client.request('shutdown').catch(()=>{});await client.close();
  }
});
