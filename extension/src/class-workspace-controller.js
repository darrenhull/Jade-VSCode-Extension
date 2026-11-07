'use strict';
const {ClassWorkspaceEditorProvider}=require('./class-workspace-editor-provider');
const {classIdentity}=require('./class-workspace');
const STATE='jade.classWorkspaceContexts.v1';
function registerClassWorkspaces(vscode,context,{model,shell}) {
  const views=new Map(),pending=new Map(),contexts=context.workspaceState?.get(STATE)||{};
  let disposed=false,opening=Promise.resolve();
  function remember(row,column,origin){
    const key=classIdentity(row);
    contexts[key]={row:{name:row.name,schema:row.schema,projectId:row.projectId,file:row.file},column,origin};
    const bounded=Object.fromEntries(Object.entries(contexts).slice(-50));
    void Promise.resolve(context.workspaceState?.update(STATE,bounded)).catch(()=>{});
  }
  const provider=new ClassWorkspaceEditorProvider(vscode,async session=>{
    const uri=session.document.uri.toString(),request=pending.get(uri);
    pending.delete(uri);
    let state=request||Object.values(contexts).find(state=>state.row.file===uri&&state.column===session.panel.viewColumn);
    if(!state){
      const {classSections}=require('./class-view-model'),classes=classSections(session.document.getText(),uri);
      if(classes.length!==1)throw Error('Select a class from Classes to open this multi-class source.');
      state={row:await model.resolveClass({name:classes[0].name,schema:classes[0].schema,file:uri})};
    }
    const row=await model.resolveClass(state.row),key=classIdentity(row);
    session.panel.title=row.qualifiedName;
    remember(row,session.panel.viewColumn,state.origin);
    const editorScriptUri=session.panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','method-editor.js'));
    const view=shell.attach({...session,row,origin:state.origin,selectedId:state.selectedId,services:{...session.services,editorScriptUri}});
    views.set(key,{panel:session.panel,view,row});
    const closed=session.panel.onDidDispose(()=>{if(views.get(key)?.panel===session.panel)views.delete(key);});
    return {dispose(){closed.dispose();view.dispose();}};
  });
  const registration=vscode.window.registerCustomEditorProvider('jade.classWorkspace',provider,{supportsMultipleEditorsPerDocument:true,webviewOptions:{retainContextWhenHidden:true}});
  async function openResolved(row,{origin,selectedId}={}){
    if(disposed)throw Error('Class workspace is closed.');
    const identity=await model.resolveClass(row),key=classIdentity(identity),existing=views.get(key);
    if(existing){existing.panel.reveal(existing.panel.viewColumn);if(selectedId)await existing.view.select(selectedId);return {opened:true,reused:true,uri:identity.file};}
    const other=[...views.values()].some(value=>value.row.file===identity.file);
    const column=other?vscode.ViewColumn.Beside:vscode.ViewColumn.Active;
    pending.set(identity.file,{row:identity,origin,selectedId});
    try{await vscode.commands.executeCommand('vscode.openWith',vscode.Uri.parse(identity.file),'jade.classWorkspace',{preview:false,viewColumn:column});}
    catch(error){pending.delete(identity.file);throw error;}
    const created=views.get(key);if(selectedId&&created)await created.view.select(selectedId);
    return {opened:true,reused:false,uri:identity.file};
  }
  function open(row,options){
    const operation=opening.then(()=>openResolved(row,options));
    opening=operation.catch(()=>{});
    return operation;
  }
  const controller={open,refresh:()=>shell.refresh(),dispose(){if(disposed)return;disposed=true;registration.dispose();provider.dispose();shell.dispose();views.clear();pending.clear();}};
  context.subscriptions.push(controller);
  return controller;
}
module.exports={registerClassWorkspaces};
