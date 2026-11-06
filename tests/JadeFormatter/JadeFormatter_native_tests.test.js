'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {requirePrivateSeed,createFixture,configFor,service}=require('../../test/cli-integration-fixture');
const {formattingEdits}=require('../../extension/src/jade-formatter');
test('native Jade compiles and executes the same tests before and after indentation formatting',{skip:process.env.JADE_FORMATTER_NATIVE!=='1',timeout:180000},async()=>{
  requirePrivateSeed();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-formatting-proof-')),fixture=createFixture(root);
  const entry=process.env.JADE_CLI_ENTRY||path.resolve(__dirname,'../../extension/vendor/jade-tools-cli/jade-cli.exe');
  const client=service(entry,path.join(root,'broker')),config=configFor(fixture,fixture.testFile);
  fs.writeFileSync(fixture.domainFile,fixture.domain('result').replace('begin\n return result;', 'vars\n result: Integer;\nbegin\n result := 40;\n if result > 0 then\n while result < 42 do\n result := result + 1;\n endwhile;\n endif;\n return result;'));
  try {
    const before=await client.request('test',config);assert.equal(before.passed,true,JSON.stringify(before));assert.equal(before.report.tests_completed,true);
    let changed=0;
    for(const file of [fixture.domainFile,fixture.testFile]) {
      let source=fs.readFileSync(file,'utf8');const edits=formattingEdits(source,{insertSpaces:true,tabSize:4},undefined,file);changed+=edits.length;
      for(const edit of edits.reverse())source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
      fs.writeFileSync(file,source);assert.deepEqual(formattingEdits(source,{insertSpaces:true,tabSize:4},undefined,file),[]);
    }
    assert.ok(changed>=8,'The native proof must actually format nested control/declaration lines.');
    const after=await client.request('test',config);assert.equal(after.passed,true,JSON.stringify(after));assert.equal(after.report.tests_completed,true);
    assert.ok(after.report.loaded_files>0,'Formatted sources must actually reach the native compiler.');
    assert.deepEqual(after.report.results.map(row=>({method:row.method,status:row.status})),before.report.results.map(row=>({method:row.method,status:row.status})));
  } finally {await client.request('shutdown').catch(()=>{});await client.close();}
});
