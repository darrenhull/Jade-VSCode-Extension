'use strict';
const {ClassWorkspaceEditorProvider}=require('./class-workspace-editor-provider');
const {classIdentity}=require('./class-workspace');
const {MethodDraftRecovery}=require('./method-draft-recovery');
const STATE='jade.classWorkspaceContexts.v1';
function safeContext(value){
  const input=value?.row;
  if(!input||!['name','schema','projectId','file'].every(key=>typeof input[key]==='string'&&input[key].length>0&&input[key].length<=4096)||!input.file.startsWith('file:'))return;
  const row=Object.fromEntries(['name','schema','projectId','file','importIdentity','packageAlias'].filter(key=>typeof input[key]==='string').map(key=>[key,input[key].slice(0,4096)]));
  const origin=value.origin?.scope==='workspace'?{scope:'workspace',filter:{query:String(value.origin.filter?.query||'').slice(0,256),schema:typeof value.origin.filter?.schema==='string'?value.origin.filter.schema.slice(0,256):undefined,offset:Number.isSafeInteger(value.origin.filter?.offset)?Math.max(0,value.origin.filter.offset):0},selectedId:typeof value.origin.selectedId==='string'?value.origin.selectedId.slice(0,2048):'',scrollTop:Number.isFinite(value.origin.scrollTop)?Math.max(0,Math.min(10000000,value.origin.scrollTop)):0}:undefined;
  return {row,column:Number.isInteger(value.column)&&value.column>=1&&value.column<=9?value.column:undefined,origin};
}
function registerClassWorkspaces(vscode,context,{model,shell,onOriginal}) {
  const views=new Map(),pending=new Map();
  const recovery=new MethodDraftRecovery(context.workspaceState);
  let contexts=Object.fromEntries(Object.values(context.workspaceState?.get(STATE)||{}).slice(-50).map(safeContext).filter(Boolean).map(value=>[classIdentity(value.row),value]));
  let disposed=false,opening=Promise.resolve(),lastActiveKey;
  function remember(row,column,origin){
    const key=classIdentity(row);
    const value=safeContext({row,column,origin});if(!value)return;
    delete contexts[key];contexts[key]=value;
    contexts=Object.fromEntries(Object.entries(contexts).slice(-50));
    void Promise.resolve(context.workspaceState?.update(STATE,contexts)).catch(()=>{});
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
    if(session.isClosed?.())return {dispose(){}};
    session.panel.title=row.qualifiedName;
    remember(row,session.panel.viewColumn,state.origin);
    const editorScriptUri=session.panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','method-editor.js'));
    const draftIdentity=()=>{const selected=session.binding.snapshot();if(!selected)throw Error('Select a source method first.');return {uri:session.document.uri.toString(),projectId:row.projectId,schema:row.schema,owner:selected.owner,member:selected.member};};
    const recoveryScope={uri:session.document.uri.toString(),projectId:row.projectId,schema:row.schema,owner:row.name};
    let displayedDraft;
    let reservedIdentity;
    const sourceReadOnlyReason=session.binding.readOnlyReason;
    const draftRecovery={
      maxCharacters:recovery.maxCharacters,
      async prepare(snapshot){
        if(!snapshot?.available)return snapshot;
        if(sourceReadOnlyReason)return {...snapshot,readOnly:true,reason:sourceReadOnlyReason};
        if(snapshot.text.length>recovery.maxCharacters)return {...snapshot,readOnly:true,reason:'This method is too large for protected editing. Open Original Source to edit it.'};
        const identity=draftIdentity();
        if(reservedIdentity&&JSON.stringify(identity)===JSON.stringify(reservedIdentity))return snapshot;
        if(reservedIdentity){await recovery.release(reservedIdentity);reservedIdentity=undefined;}
        try{await recovery.reserve(identity);reservedIdentity=identity;session.binding.readOnlyReason=sourceReadOnlyReason;return {...session.binding.snapshot(),maxCharacters:recovery.maxCharacters};}
        catch(error){session.binding.readOnlyReason=error.message;return {...session.binding.snapshot(),readOnly:true,reason:error.message};}
      },
      save(draft){const identity=draftIdentity();if(draft?.owner!==identity.owner||draft?.member!==identity.member)throw Error('The selected method changed before its recovery checkpoint.');return recovery.save(identity,draft);},
      get(){const selected=session.binding.snapshot();displayedDraft=(selected&&recovery.get(draftIdentity()))||recovery.list(recoveryScope)[0];return displayedDraft;},
      acknowledge:()=>session.binding.snapshot()?recovery.acknowledge(draftIdentity(),session.binding.snapshot()):Promise.resolve(false),
      discard:()=>displayedDraft?recovery.discard(displayedDraft.identity):Promise.resolve(),
      async copy(){const draft=displayedDraft&&recovery.get(displayedDraft.identity);if(draft)await vscode.env.clipboard.writeText(draft.text);},
      async restore(){const identity=draftIdentity(),draft=displayedDraft&&recovery.get(displayedDraft.identity),selected=session.binding.snapshot();if(!draft)return selected;if(identity.owner!==draft.identity.owner||identity.member!==draft.identity.member)throw Error('Select '+draft.identity.owner+'::'+draft.identity.member+' before restoring its draft.');const result=await session.binding.edit({version:selected.version,owner:selected.owner,member:selected.member,start:0,end:selected.text.length,text:draft.text});if(result.text===draft.text)await recovery.discard(identity);return result;},
    };
    const view=shell.attach({...session,row,origin:state.origin,selectedId:state.selectedId,services:{...session.services,editorScriptUri,draftRecovery}});
    views.set(key,{panel:session.panel,view,row});
    lastActiveKey=key;
    const active=session.panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active)lastActiveKey=key;});
    const closed=session.panel.onDidDispose(()=>{if(views.get(key)?.panel===session.panel)views.delete(key);});
    return {dispose(){active?.dispose();closed.dispose();view.dispose();if(reservedIdentity)void recovery.release(reservedIdentity).catch(()=>{});}};
  });
  const registration=vscode.window.registerCustomEditorProvider('jade.classWorkspace',provider,{supportsMultipleEditorsPerDocument:true,webviewOptions:{retainContextWhenHidden:true}});
  async function openResolved(row,{origin,selectedId}={}){
    if(disposed)throw Error('Class workspace is closed.');
    const identity=await model.resolveClass(row),key=classIdentity(identity),existing=views.get(key);
    if(existing){if(origin){existing.view.setOrigin(origin);remember(identity,existing.panel.viewColumn,origin);}existing.panel.reveal(existing.panel.viewColumn);if(selectedId)await existing.view.select(selectedId);return {opened:true,reused:true,uri:identity.file};}
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
  const controller={open,async openOriginal(){const selected=[...views.values()].find(value=>value.panel.active)||views.get(lastActiveKey)||[...views.values()].at(-1);if(!selected)throw Error('Choose a class workspace before opening its original source.');if(!onOriginal)throw Error('Original source navigation is unavailable.');return onOriginal(selected.row,selected.view.state?.().selectedId);},refresh:()=>shell.refresh(),dispose(){if(disposed)return;disposed=true;registration.dispose();provider.dispose();shell.dispose();views.clear();pending.clear();}};
  context.subscriptions.push(controller);
  return controller;
}
module.exports={registerClassWorkspaces,safeContext};
