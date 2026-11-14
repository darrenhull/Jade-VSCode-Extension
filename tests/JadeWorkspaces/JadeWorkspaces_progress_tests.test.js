'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerWorkspaces,notebookOutputs}=require('../../extension/src/jade-workspaces');
const api={NotebookCellOutput:class{constructor(items){this.items=items;}},NotebookCellOutputItem:{text:text=>({text}),error:error=>({error})}};
test('pending notebook run shows preparation progress before native completion instead of an empty timer-only cell',async()=>{
 const outputs=[],channel=[],noop=()=>({dispose(){}}),resource=value=>({scheme:'file',fsPath:value,toString:()=>value});
 let finish;const folder={uri:resource('C:/synthetic')},document={uri:{scheme:'vscode-notebook-cell',toString:()=> 'vscode-notebook-cell:/scratch#0'},version:1,getText:()=> 'begin\n write 42;\nend;',positionAt:value=>value};
 const notebook={metadata:{schema:'Pets'},uri:resource('untitled:scratch'),notebookType:'jade-workspace',getCells:()=>[cell]},cell={kind:2,document,notebook};
 const execution={token:{isCancellationRequested:false,onCancellationRequested:noop},start(){},end(){},clearOutput:async()=>{},replaceOutput:async value=>outputs.push(value.flatMap(output=>output.items).map(item=>item.text||item.error?.message||'').join('\n'))};
 const vscode={...api,window:{createOutputChannel:()=>({append:text=>channel.push(text),appendLine:text=>channel.push(text),dispose(){}})},languages:{createDiagnosticCollection:()=>({clear(){},set(){},dispose(){}})},EventEmitter:class{constructor(){this.event=noop;}fire(){}dispose(){}},Range:class{},Diagnostic:class{},DiagnosticSeverity:{Error:0},notebooks:{createNotebookController:()=>({dispose(){},createNotebookCellExecution:()=>execution}),registerNotebookCellStatusBarItemProvider:noop},workspace:{getConfiguration:()=>({get:()=>false}),workspaceFolders:[folder],notebookDocuments:[notebook],getWorkspaceFolder:()=>folder,registerNotebookSerializer:noop,registerTextDocumentContentProvider:noop},commands:{registerCommand:noop},NotebookCellKind:{Code:2}};
 const tools=registerWorkspaces(vscode,{subscriptions:[]},{client:{request(command,body,onOutput){onOutput('[Scratch Pad] Scanning saved sources ...\n');return {id:1,promise:new Promise(resolve=>finish=resolve)};}},configFor:async()=>({schema:'Pets'}),schemaChoices:async()=>[]});
 const run=tools.controller.executeHandler([cell],notebook);
 while(!finish)await new Promise(resolve=>setImmediate(resolve));
 const deadline=Date.now()+1500;while(!outputs.join('\n').includes('Scanning saved sources')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 try{assert.match(outputs.join('\n'),/Waiting for JADE|Scanning saved sources/);assert.doesNotMatch(outputs.join('\n'),/Executing scratch code/);assert.ok(channel.join('').includes('Scanning saved sources'));}
 finally{finish({code:0,passed:true,report:{compiled:true,executed:true,output:'42'}});await run;}
 assert.match(outputs.at(-1),/Scratch code executed/);assert.match(outputs.at(-1),/42/);
});

test('completion only confirms positive native execution; false or absent markers do not prove code never ran',()=>{
 const text=report=>notebookOutputs(api,{passed:true,report},'Pets',1).flatMap(output=>output.items).map(item=>item.text).join('\n');
 assert.match(text({executed:true}),/Scratch code executed/);
 assert.match(text({executed:false,compiled:true,error:'Native process exited without its result marker'}),/Scratch code execution was not confirmed/);
 assert.doesNotMatch(text({executed:false,compiled:true}),/Scratch code was not executed/);
 assert.match(text({}),/Scratch code execution was not confirmed/);
});