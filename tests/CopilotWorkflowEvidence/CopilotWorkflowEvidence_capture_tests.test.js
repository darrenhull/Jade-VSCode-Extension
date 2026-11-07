'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {CopilotWorkflowEvidence}=require('../../test/CopilotWorkflowEvidence');
test('captures exact saved bytes and hashes without modifying either notebook',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-evidence-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const notebookFile=path.join(root,'accepted.json'),pristineFile=path.join(root,'pristine.json'),before=JSON.stringify({cells:[{kind:'code',source:['begin\r\n',' write "🐟";\r\n','end;']}]}),initial=JSON.stringify({cells:[{kind:'code',source:['begin\nend;']}]});fs.writeFileSync(notebookFile,before);fs.writeFileSync(pristineFile,initial);
 const helper=new CopilotWorkflowEvidence(path.join(root,'evidence')),receipt=helper.capture({notebookFile,pristineFile,indexes:[0]});assert.equal(receipt.currentCellCount,1);assert.equal(receipt.cells[0].changed,true);assert.equal(fs.readFileSync(receipt.cells[0].acceptedSource,'utf8'),'begin\r\n write "🐟";\r\nend;');assert.match(receipt.cells[0].sourceSha256,/^[a-f0-9]{64}$/);assert.equal(fs.readFileSync(notebookFile,'utf8'),before);assert.equal(fs.readFileSync(pristineFile,'utf8'),initial);
 fs.appendFileSync(receipt.cells[0].acceptedSource,'tampered');assert.throws(()=>helper.recordNative({index:0,rawOutput:'',scenario:{},receipt}),/source changed/);assert.throws(()=>helper.capture({notebookFile,pristineFile,indexes:[-1]}),/Invalid evidence/);
});
