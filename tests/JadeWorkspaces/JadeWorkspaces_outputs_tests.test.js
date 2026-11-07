'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notebookOutputs,resultText}=require('../../extension/src/jade-workspaces');
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
