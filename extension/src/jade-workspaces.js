'use strict';
const {decodeNotebook,encodeNotebook,diagnosticOffsets}=require('./jade-workspace-document');
const {JadeWorkspaceRunner}=require('./JadeWorkspaceRunner');
const {WorkspaceRunHistory}=require('./WorkspaceRunHistory');
const {WorkspaceDiagnostics}=require('./WorkspaceDiagnostics');
const {WorkspaceContext}=require('./WorkspaceContext');
const notebookType='jade-workspace';

async function runSequential(cells,execute) {
  for(const cell of cells){const result=await execute(cell);if(result?.passed===false||result?.cancelled)return result;}
}
function summary(result,schema,elapsed) {
  const status=result.cancelled?'Cancelled':result.timedOut?'Timed out':result.passed?'Completed':'Failed';
  const duration=elapsed>=1000?(elapsed/1000).toFixed(2)+'s':Math.round(elapsed)+'ms';
  return `${status} · Working · ${schema} · ${duration}`;
}
function resultText(result) {
  const report=result.report||{},message=report.output||'';
  return String(message).slice(-262144)+(report.outputTruncated?'\n[Native output was truncated; later output was omitted.]':'')+(result.passed?'':((message?'\n':'')+(report.error||report.diagnostics?.[0]?.message||'Native execution failed (Jade '+result.code+').')));
}
function notebookOutputs(vscode,result,schema,elapsed) {
  const outputs=[new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(summary(result,schema,elapsed),'text/plain')])],text=resultText(result);
  if(text)outputs.push(new vscode.NotebookCellOutput([result.passed?vscode.NotebookCellOutputItem.text(text,'text/plain'):vscode.NotebookCellOutputItem.error({name:'Jade '+result.code,message:text,stack:''})]));
  if(result.stale)outputs.push(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text('The code changed during execution. This output belongs to the executed snapshot; re-run to refresh Problems.','text/plain')]));
  return outputs;
}

function registerWorkspaces(vscode,context,{client,configFor,schemaChoices,beforeOperation,afterOperation}) {
  const output=vscode.window.createOutputChannel('Scratch Pad');
  const diagnostics=vscode.languages.createDiagnosticCollection('jade-workspace');
  const changes=new vscode.EventEmitter(),history=new WorkspaceRunHistory(),diagnosticState=new WorkspaceDiagnostics();
  const sourceContext=new WorkspaceContext({workspace:vscode.workspace,pickFolder:()=>vscode.window.showWorkspaceFolderPick({placeHolder:'Choose the project and Jade connection for this Scratch Pad'})});
  const runner=new JadeWorkspaceRunner({client,configFor:async document=>configFor(document,await sourceContext.resolve(document.uri)),beforeOperation,afterOperation}),plainSchemas=new Map();
  let order=0;
  const controller=vscode.notebooks.createNotebookController('jade-working-workspaces',notebookType,'Jade · Working database');
  controller.supportedLanguages=['jade-nz'];controller.supportsExecutionOrder=true;
  controller.description='Native Jade Workspace code; fresh local variables on every run';
  const serializer={
    deserializeNotebook(bytes) {
      const value=decodeNotebook(bytes),data=new vscode.NotebookData(value.cells.map(cell=>new vscode.NotebookCellData(cell.kind==='markdown'?vscode.NotebookCellKind.Markup:vscode.NotebookCellKind.Code,cell.text,cell.language)));
      data.metadata={schema:value.schema};return data;
    },
    serializeNotebook(data) {return encodeNotebook({schema:data.metadata?.schema,cells:data.cells.map(cell=>({kind:cell.kind===vscode.NotebookCellKind.Markup?'markdown':'code',text:cell.value}))});}
  };
  function notebookOf(value){return value?.notebookType===notebookType?value:value?.notebook||value?.notebookEditor?.notebook||vscode.window.activeNotebookEditor?.notebook;}
  async function selectSchema(notebook,resource) {
    if(!resource)throw Error('Open a Scratch Pad or Jade file before choosing a schema.');
    const scope=await sourceContext.resolve(resource);
    const choices=(await schemaChoices(scope)).filter(choice=>!['RootSchema','JadeSchema'].includes(choice.name||choice));
    const options=choices.map(choice=>({label:choice.name||choice,description:choice.parent?'subschema of '+choice.parent:undefined}));
    options.push({label:'$(edit) Enter schema name…',manual:true});
    const picked=await vscode.window.showQuickPick(options,{title:'Scratch Pad · Working database',placeHolder:'Choose the schema whose saved local definitions this code uses',matchOnDescription:true});
    if(!picked)return;
    const schema=picked.manual?await vscode.window.showInputBox({title:'Scratch Pad schema',prompt:'Existing user schema name',validateInput:value=>/^[A-Za-z_]\w*$/.test(value)&&!['RootSchema','JadeSchema'].includes(value)?undefined:'Enter an existing user schema name.'}):picked.label;
    if(!schema)return;
    if(notebook) {
      const edit=new vscode.WorkspaceEdit();edit.set(notebook.uri,[vscode.NotebookEdit.updateNotebookMetadata({...notebook.metadata,schema})]);
      if(!await vscode.workspace.applyEdit(edit))throw Error('Could not store the Workspace schema selection.');
    } else plainSchemas.set(resource.toString(),schema);
    changes.fire();return schema;
  }
  function updateDiagnostics(document,snapshot,result,stale,schema) {
    const report=result.report;
    // A captured snapshot does not mean Jade compiled it. Failed setup,
    // cancellation and stale runs cannot retire existing compiler Problems.
    if(stale||!(result.passed===true||report?.compiled===true||report?.executed===true||(Array.isArray(report?.diagnostics)&&report.diagnostics.length)))return;
    const key=document.uri.toString(),groups=new Map();
    for(const item of report?.diagnostics||[]) {
      let uri=document.uri,range;
      if(!item.source||item.source===key) {
        const offsets=diagnosticOffsets(snapshot,item);range=new vscode.Range(document.positionAt(offsets.start),document.positionAt(offsets.end));
      } else {
        uri=/^[A-Za-z]:[\\/]/.test(item.source)?vscode.Uri.file(item.source):vscode.Uri.parse(item.source);
        if(!['file','untitled','vscode-notebook-cell'].includes(uri.scheme))continue;
        const line=Math.max(0,(item.line||1)-1),column=Math.max(0,(item.column||1)-1);
        range=new vscode.Range(line,column,line,column+Math.max(1,item.length||1));
      }
      const diagnostic=new vscode.Diagnostic(range,item.message||'Native Jade compilation failed.',vscode.DiagnosticSeverity.Error);
      diagnostic.source='Scratch Pad';diagnostic.code=item.compiler_error||item.code;
      const id=uri.toString();if(!groups.has(id))groups.set(id,{uri,items:[]});groups.get(id).items.push(diagnostic);
    }
    diagnosticState.replace(key,groups,{schema,target:report?.workingDatabase,prepared:result.passed===true||report?.compiled===true||report?.executed===true});
    diagnostics.clear();for(const group of diagnosticState.groups().values())diagnostics.set(group.uri,group.items);
  }
  async function runCell(cell,schema) {
    if(cell.kind!==vscode.NotebookCellKind.Code)return;
    const execution=controller.createNotebookCellExecution(cell);execution.executionOrder=++order;execution.start(Date.now());
    await execution.clearOutput();const started=Date.now();let result;
    try {
      result=await runner.run({document:cell.document,schema,token:execution.token,onOutput:text=>output.append(text)});
      const elapsed=result.report?.elapsedMilliseconds??Date.now()-started,text=resultText(result);
      if(result.report?.outputCharacterLossPossible)output.appendLine('Native output encoding: '+result.report.outputEncoding+'. Characters outside that encoding may be replaced by Jade.');
      if(result.snapshot) {
        history.record(cell.document.uri.toString(),{sourceText:result.snapshot.text,output:text,schema,workingDatabase:result.report?.workingDatabase,status:result.passed?'Completed':result.cancelled?'Cancelled':result.timedOut?'Timed out':'Failed',duration:elapsed});
        updateDiagnostics(cell.document,result.snapshot,result,result.stale,schema);
      }
      await execution.replaceOutput(notebookOutputs(vscode,result,schema,elapsed));changes.fire();
    } catch(error) {
      result={passed:false};await execution.replaceOutput([new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error({name:'Scratch Pad',message:error.message,stack:''})])]);
    } finally {execution.end(result?.passed===true,Date.now());}
    return result;
  }
  controller.executeHandler=async(cells,notebook)=>{
    const schema=notebook.metadata.schema||await selectSchema(notebook,notebook.uri);if(!schema)return;
    return runSequential(cells,cell=>runCell(cell,schema));
  };
  async function newWorkspace() {
    const markup='# Scratch Pad\n\nChoose a schema, edit the code and click **Run**. Native Jade executes Workspace code in **Working**; nothing is published.\n\nEach run starts with fresh local variables. Committed Working data can survive runs. After editing and running again, use **Compare previous run** to see what changed. Application definitions use saved source files.';
    const data=new vscode.NotebookData([
      new vscode.NotebookCellData(vscode.NotebookCellKind.Markup,markup,'markdown'),
      new vscode.NotebookCellData(vscode.NotebookCellKind.Code,'begin\n    write "Hello from Jade";\nend;','jade-nz')
    ]);data.metadata={schema:''};
    const notebook=await vscode.workspace.openNotebookDocument(notebookType,data);
    controller.updateNotebookAffinity(notebook,vscode.NotebookControllerAffinity.Preferred);
    const editor=await vscode.window.showNotebookDocument(notebook);
    await vscode.commands.executeCommand('notebook.selectKernel',{notebookEditor:editor,id:controller.id,extension:context.extension.id});
    return notebook;
  }
  async function runEditor(selectionOnly=false,selectedSchema) {
    const editor=vscode.window.activeTextEditor;if(!editor||editor.document.languageId!=='jade-nz')throw Error('Open a .jade scratch file before running a Scratch Pad.');
    if(selectionOnly&&editor.selection.isEmpty)throw Error('Select complete Jade code to run.');
    const document=editor.document,schema=selectedSchema||plainSchemas.get(document.uri.toString())||await selectSchema(undefined,document.uri);if(!schema)return;
    plainSchemas.set(document.uri.toString(),schema);
    const selection=selectionOnly?{start:document.offsetAt(editor.selection.start),end:document.offsetAt(editor.selection.end)}:undefined;
    return vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Scratch Pad · Working · '+schema,cancellable:true},async(_progress,token)=>{
      output.show(true);output.appendLine('\nRunning '+(selection?'selection':'Scratch Pad')+' in '+schema+' · Working database');const started=Date.now();
      const result=await runner.run({document,schema,selection,token,onOutput:text=>output.append(text)});
      const text=resultText(result),elapsed=result.report?.elapsedMilliseconds??Date.now()-started;
      output.appendLine(summary(result,schema,elapsed));if(text)output.appendLine(text);
      if(result.snapshot){history.record(document.uri.toString(),{sourceText:result.snapshot.text,output:text,schema,workingDatabase:result.report?.workingDatabase,status:result.passed?'Completed':result.cancelled?'Cancelled':result.timedOut?'Timed out':'Failed',duration:elapsed});updateDiagnostics(document,result.snapshot,result,result.stale,schema);}
      if(result.stale)output.appendLine('Source changed during execution; output belongs to the executed snapshot.');return result;
    });
  }
  async function compare(value) {
    const activeNotebook=vscode.window.activeNotebookEditor;
    const document=value?.document||activeNotebook?.notebook.cellAt(activeNotebook.selections?.[0]?.start??0)?.document||vscode.window.activeTextEditor?.document;
    const pair=document&&history.pair(document.uri.toString());if(!pair){await vscode.window.showInformationMessage('Run this Scratch Pad twice to compare its latest runs.');return;}
    const previous=vscode.Uri.parse('jade-workspace-run:/'+pair.previous.id),current=vscode.Uri.parse('jade-workspace-run:/'+pair.current.id);
    return vscode.commands.executeCommand('vscode.diff',previous,current,'Scratch Pad · Previous ↔ Current · Working',{preview:true});
  }
  const safe=action=>(...args)=>Promise.resolve().then(()=>action(...args)).catch(error=>{void vscode.window.showErrorMessage(error.message);return {passed:false,error:error.message};});
  context.subscriptions.push(output,diagnostics,changes,controller,
    vscode.workspace.registerNotebookSerializer(notebookType,serializer,{transientOutputs:true}),
    vscode.workspace.registerTextDocumentContentProvider('jade-workspace-run',{provideTextDocumentContent:uri=>history.text(uri.path.slice(1))}),
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(notebookType,{onDidChangeCellStatusBarItems:changes.event,provideCellStatusBarItems(cell){
      if(cell.kind!==vscode.NotebookCellKind.Code)return [];
      const status=new vscode.NotebookCellStatusBarItem('$(database) Working · '+(cell.notebook.metadata.schema||'Choose schema'),vscode.NotebookCellStatusBarAlignment.Right);
      status.command={command:'jadeNative.selectWorkspaceSchema',title:'Select schema',arguments:[cell.notebook]};status.tooltip='Native execution in the private Working database. Each run starts with fresh local variables; committed Working data can survive runs.';
      const items=[status];if(history.pair(cell.document.uri.toString())){const diff=new vscode.NotebookCellStatusBarItem('$(diff) Compare previous run',vscode.NotebookCellStatusBarAlignment.Left);diff.command={command:'jadeNative.compareWorkspaceRuns',title:'Compare exact executed source and output',arguments:[cell]};items.push(diff);}return items;
    }}),
    vscode.commands.registerCommand('jadeNative.newWorkspace',safe(newWorkspace)),
    vscode.commands.registerCommand('jadeNative.runWorkspace',safe(options=>runEditor(false,options?.schema))),
    vscode.commands.registerCommand('jadeNative.runWorkspaceSelection',safe(options=>runEditor(true,options?.schema))),
    vscode.commands.registerCommand('jadeNative.scratchpadCompileInfo',()=>{void vscode.window.showInformationMessage('Scratch Pad code is compiled when you choose Run. F5 does not execute it. Class files still use F5 for compile-only checks.');return {compiled:false,executed:false};}),
    vscode.commands.registerCommand('jadeNative.selectWorkspaceSchema',safe(value=>{const notebook=notebookOf(value);return selectSchema(notebook,notebook?.uri||vscode.window.activeTextEditor?.document.uri);})),
    vscode.commands.registerCommand('jadeNative.compareWorkspaceRuns',safe(compare)),
    {dispose:()=>{history.clear();plainSchemas.clear();diagnosticState.clear();sourceContext.clear();}}
  );
  return {serializer,controller,newWorkspace,runEditor,compare,history,schemaFor:uri=>{
    const id=uri.toString();for(const notebook of vscode.workspace.notebookDocuments||[])if(notebook.uri.toString()===id||notebook.getCells().some(cell=>cell.document.uri.toString()===id))return notebook.metadata.schema;
    return plainSchemas.get(id);
  },resourceFor:uri=>sourceContext.peek(uri).folder?.uri||sourceContext.peek(uri).resource};
}
module.exports={registerWorkspaces,notebookType,runSequential,notebookOutputs,resultText};
