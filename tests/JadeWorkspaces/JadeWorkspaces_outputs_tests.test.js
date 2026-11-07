'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notebookOutputs,resultText}=require('../../extension/src/jade-workspaces');
test('failed native setup shows every reported compiler diagnostic and its original source position in both output paths',()=>{
 const result={passed:false,code:6023,report:{compiled:false,error:'Native schema load failed (exit 6023). See native output.',diagnostics:[{source:'C:\\repo\\ExplorerDemoPet.cls',line:11,column:12,compiler_error:6023,message:'Unknown type'},{source:'C:\\repo\\Other.cls',line:27,column:4,code:6026,message:'Unknown property or method'}]}};
 const text=resultText(result);assert.match(text,/Jade 6023: Unknown type/);assert.match(text,/C:\\repo\\ExplorerDemoPet\.cls:11:12/);assert.match(text,/Jade 6026: Unknown property or method/);assert.match(text,/C:\\repo\\Other\.cls:27:4/);
 const api={NotebookCellOutput:class{constructor(items){this.items=items;}},NotebookCellOutputItem:{text:(text)=>({text}),error:value=>value}};
 assert.equal(notebookOutputs(api,result,'Pets',1)[1].items[0].message,text);assert.equal(result.report.diagnostics[0].line,11);
});
test('runtime failures retain output and runtime error without inventing compiler positions',()=>{
 const text=resultText({passed:false,code:1002,report:{output:'before failure',error:'Invalid parameter value'}});assert.equal(text,'before failure\nInvalid parameter value');
});
test('identifies failed workspace preparation without claiming Scratch code was executed or mislabelling script failures',()=>{
 const setup={passed:false,code:6023,report:{native_project:true,compiled:false,error:'Native schema load failed',diagnostics:[{source:'C:\\repo\\Pet.cls',line:11,column:12,compiler_error:6023,message:'Unknown type'}]}};
 const text=resultText(setup);assert.ok(text.startsWith('Workspace preparation failed. Scratch code was not executed.'));assert.match(text,/Jade 6023: Unknown type\nC:\\repo\\Pet.cls:11:12/);
 for(const report of [{compiled:false,executed:false,error:'Unknown identifier'},{compiled:true,executed:true,error:'Invalid parameter value'},{native_project:true,compiled:true,error:'Execution failed'}])assert.doesNotMatch(resultText({passed:false,code:6027,report}),/Workspace preparation failed/);
});
const api={NotebookCellOutput:class{constructor(items){this.items=items;}},NotebookCellOutputItem:{text:text=>({mime:'text/plain',text}),error:error=>({mime:'application/vnd.code.notebook.error',error})}};
test('summary and native stdout are separately visible output records, not duplicate alternate MIME representations',()=>{
 const outputs=notebookOutputs(api,{passed:true,report:{output:'42'}},'Pets',17);
 assert.ok(outputs.some(output=>output.items.some(item=>item.text==='42')));
 assert.ok(outputs.some(output=>output.items.some(item=>item.text?.includes('Completed'))));
 for(const output of outputs)assert.equal(new Set(output.items.map(item=>item.mime)).size,output.items.length);
 assert.ok(outputs.length>=2);
});
test('failure, stale snapshot and native truncation are explicit while normal output remains available',()=>{
 const result={passed:false,code:6027,stale:true,report:{output:'first part',outputTruncated:true,error:'Unknown identifier'}};
 const outputs=notebookOutputs(api,result,'Pets',2);
 assert.ok(outputs.some(output=>output.items.some(item=>item.error?.message.includes('Unknown'))));
 assert.ok(outputs.some(output=>output.items.some(item=>item.text?.includes('changed'))));
 assert.match(resultText(result),/truncated|omitted/i);
});
test('long native durations use compact readable seconds rather than unrounded millisecond noise',()=>{
 const outputs=notebookOutputs(api,{passed:true,report:{}},'Pets',3441.8427);assert.match(outputs[0].items[0].text,/3\.44s/);
});
