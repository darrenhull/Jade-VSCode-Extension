'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const scenarios=require('../../test/fixtures/scratch-pad-copilot-workflows.json');
const {ScratchPadCopilot}=require('../../extension/src/ScratchPadCopilot');
const {ScratchPadCopilotWorkflow}=require('../../test/ScratchPadCopilotWorkflow');
function fixture(scenario){
 const document={version:1,uri:{toString:()=> 'vscode-notebook-cell:/workflow'},getText:()=>scenario.source,positionAt:offset=>{const lines=scenario.source.slice(0,offset).split('\n');return{line:lines.length-1,character:lines.at(-1).length};}},cell={index:0,kind:2,document},notebook={notebookType:'jade-workspace',cellCount:1,metadata:{schema:'Pets'},cellAt:()=>cell};cell.notebook=notebook;
 const cursor=scenario.selection==='partial'?{start:document.positionAt(7),end:document.positionAt(12)}:{start:document.positionAt(scenario.source.length),end:document.positionAt(scenario.source.length)},calls=[],contexts=[];
 const vscode={NotebookCellKind:{Code:2,Markup:1},NotebookRange:class{constructor(start,end){Object.assign(this,{start,end});}},Selection:class{constructor(start,end){Object.assign(this,{start,end});}},window:{activeTextEditor:{document,selections:[cursor]},activeNotebookEditor:{notebook},showNotebookDocument:async()=>({notebook})},commands:{getCommands:async()=>['inlineChat.start'],executeCommand:async(command,...args)=>{calls.push({command,args,selections:vscode.window.activeTextEditor.selections});}}};
 const helper=new ScratchPadCopilot(vscode,{contextFor:async text=>{contexts.push(text);return {scheme:'jade-scratch-context',toString:()=> 'jade-scratch-context:/workflow.md'};}});return{cell,helper,calls,contexts,document};
}
for(const scenario of scenarios)test('user workflow '+scenario.id+' scopes native editing to the existing entire cell and keeps original source intact',async()=>{
 const f=fixture(scenario);if(scenario.action==='fix')await f.helper.fix(f.cell,{sourceUri:f.document.uri.toString(),sourceVersion:1,sourceText:scenario.source,schema:'Pets',code:scenario.id.includes('decimal')?7699:6026,error:'Native compile failure'});else await f.helper.edit(f.cell);
 const invocation=f.calls.find(call=>call.command==='inlineChat.start');assert.ok(invocation);assert.deepEqual(invocation.selections.map(range=>[range.start,range.end]),[[f.document.positionAt(0),f.document.positionAt(scenario.source.length)]]);assert.equal(f.document.getText(),scenario.source);assert.equal(f.cell.notebook.cellCount,1);assert.deepEqual(f.calls.map(call=>call.command),['notebook.cell.edit','inlineChat.start']);
 if(scenario.action==='fix'){assert.ok(f.contexts[0].includes(JSON.stringify(scenario.source)));assert.equal(invocation.args[0].message,'Fix the errors in this cell.');assert.equal(invocation.args[0].autoSend,false);}
});
test('acceptance checks reject duplicated bodies, descriptor omissions and foreign string conversions',()=>{
 const scenario={requiredDeclarations:[],preservedStrings:[]},workflow=new ScratchPadCopilotWorkflow(scenario),counts={initialCellCount:1,currentCellCount:1};
 for(const source of ['begin end;\nbegin end;','vars\n amount : Decimal;\nbegin end;','vars\n x : Integer;\nbegin\n write x.asString();\nend;'])assert.throws(()=>workflow.assertSource(source,counts));
 assert.throws(()=>workflow.assertSource('begin end;',{initialCellCount:1,currentCellCount:2}),/cell count/);
});
test('acceptance never equates a proposal or accepted native editor mutation with a successful native compile',()=>{
 const workflow=new ScratchPadCopilotWorkflow({}),source={text:'begin\n write "controlled validator input";\nend;',initialCellCount:1,currentCellCount:1};
 workflow.assertSource(source.text,source);assert.throws(()=>workflow.assertAccepted(source),/native compilation/);assert.throws(()=>workflow.assertAccepted({...source,nativeResult:{code:0,passed:true,report:{}}}),/compilation evidence/);
});
test('source expectations accept equivalent grouped declarations and descriptor spacing without requiring an exact AI response',()=>{const workflow=new ScratchPadCopilotWorkflow({requiredDeclarations:[{name:'firstFloat',type:'Real'},{name:'amount',type:'Decimal[12,2]'}],requiredTypes:['Boolean','Character','Byte']});workflow.assertSource('vars\n firstFloat, otherFloat : Real;\n amount : Decimal [ 12, 2 ];\n flag : Boolean;\n character : Character;\n b : Byte;\nbegin\n write amount.String;\nend;',{initialCellCount:1,currentCellCount:1});});
test('conversion assertions allow native Any.asString while retaining declared numeric receiver regressions',()=>{const workflow=new ScratchPadCopilotWorkflow({}),counts={initialCellCount:1,currentCellCount:1};workflow.assertSource('vars\n value : Any;\nbegin\n value := 42;\n write value.asString();\nend;',counts);for(const type of ['Real','Integer'])assert.throws(()=>workflow.assertSource('vars\n firstFloat, firstInt : '+type+';\nbegin\n write firstFloat.asString() & firstInt.toString();\nend;',counts),/native primitive/);});
