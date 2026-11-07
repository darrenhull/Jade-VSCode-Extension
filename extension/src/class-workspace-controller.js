'use strict';
const {ClassWorkspaceEditorProvider}=require('./class-workspace-editor-provider');
const {classIdentity}=require('./class-workspace');
const {MethodDraftRecovery,sourceMemberKind}=require('./method-draft-recovery');
const STATE='jade.classWorkspaceContexts.v1';
function safeContext(value){
  const input=value?.row;
  if(!input||!['name','schema','projectId','file'].every(key=>typeof input[key]==='string'&&input[key].length>0&&input[key].length<=4096)||!input.file.startsWith('file:'))return;
  const row=Object.fromEntries(['name','schema','projectId','file','importIdentity','packageAlias'].filter(key=>typeof input[key]==='string').map(key=>[key,input[key].slice(0,4096)]));
  const origin=value.origin?.scope==='workspace'?{scope:'workspace',filter:{query:String(value.origin.filter?.query||'').slice(0,256),schema:typeof value.origin.filter?.schema==='string'?value.origin.filter.schema.slice(0,256):undefined,offset:Number.isSafeInteger(value.origin.filter?.offset)?Math.max(0,value.origin.filter.offset):0},selectedId:typeof value.origin.selectedId==='string'?value.origin.selectedId.slice(0,2048):'',scrollTop:Number.isFinite(value.origin.scrollTop)?Math.max(0,Math.min(10000000,value.origin.scrollTop)):0}:undefined;
  if(origin&&['tree','quickpick','catalogue'].includes(value.origin.kind))origin.kind=value.origin.kind;
  return {row,column:Number.isInteger(value.column)&&value.column>=1&&value.column<=9?value.column:undefined,origin};
}
function registerClassWorkspaces(vscode,context,{model,shell,onOriginal,viewType='jade.classWorkspace'}) {
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
    const row=await model.resolveClass({...state.row,file:uri}),key=classIdentity(row);
    if(session.isClosed?.())return {dispose(){}};
    if(uri!==row.file)throw Error('The current source file no longer defines this class. Reopen it from Classes.');
    session.panel.title=row.qualifiedName;
    remember(row,session.panel.viewColumn,state.origin);
    const editorScriptUri=session.panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','method-editor.js'));
    const draftIdentity=()=>{const selected=session.binding.snapshot();if(!selected)throw Error('Select a source member first.');return {uri:session.document.uri.toString(),projectId:row.projectId,schema:row.schema,owner:selected.owner,member:selected.member,kind:sourceMemberKind(selected.kind)};};
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
        if(await recovery.protectUnapplied(identity,snapshot)){session.binding.readOnlyReason='Restore or discard the recovered draft before editing this method.';return {...session.binding.snapshot(),readOnly:true,reason:session.binding.readOnlyReason};}
        session.binding.readOnlyReason=sourceReadOnlyReason;
        if(reservedIdentity&&JSON.stringify(identity)===JSON.stringify(reservedIdentity))return session.binding.snapshot();
        if(reservedIdentity){await recovery.release(reservedIdentity);reservedIdentity=undefined;}
        try{await recovery.reserve(identity);reservedIdentity=identity;session.binding.readOnlyReason=sourceReadOnlyReason;return {...session.binding.snapshot(),maxCharacters:recovery.maxCharacters};}
        catch(error){session.binding.readOnlyReason=error.message;return {...session.binding.snapshot(),readOnly:true,reason:error.message};}
      },
      save(draft){const identity=draftIdentity();if(draft?.owner!==identity.owner||draft?.member!==identity.member||sourceMemberKind(draft?.kind)!==identity.kind)throw Error('The selected member changed before its recovery checkpoint.');return recovery.save(identity,draft);},
      get(){const selected=session.binding.snapshot();displayedDraft=(selected&&recovery.get(draftIdentity()))||recovery.list(recoveryScope)[0];return displayedDraft;},
      acknowledge:()=>session.binding.snapshot()?recovery.acknowledge(draftIdentity(),session.binding.snapshot()):Promise.resolve(false),
      async discard(){
        if(!displayedDraft)return;
        const identity=displayedDraft.identity;await recovery.discard(identity);
        const selected=session.binding.snapshot();
        if(selected?.owner===identity.owner&&selected?.member===identity.member&&sourceMemberKind(selected.kind)===sourceMemberKind(identity.kind)){session.binding.readOnlyReason=sourceReadOnlyReason;return draftRecovery.prepare(session.binding.snapshot());}
      },
      async copy(){const draft=displayedDraft&&recovery.get(displayedDraft.identity);if(draft)await vscode.env.clipboard.writeText(draft.text);},
      async restore(){
        const identity=draftIdentity(),draft=displayedDraft&&recovery.get(displayedDraft.identity),selected=session.binding.snapshot();
        if(!draft)return selected;
        if(identity.owner!==draft.identity.owner||identity.member!==draft.identity.member||identity.kind!==sourceMemberKind(draft.identity.kind))throw Error('Select '+draft.identity.owner+'::'+draft.identity.member+' before restoring its draft.');
        if(sourceReadOnlyReason)throw Error(sourceReadOnlyReason);
        const previousReason=session.binding.readOnlyReason;let operation;
        // Bypass only the recovery lock for this explicitly confirmed edit.
        // Keep the canvas locked during native application and persistence.
        session.binding.readOnlyReason=sourceReadOnlyReason;
        try{operation=session.binding.edit({version:selected.version,owner:selected.owner,member:selected.member,kind:selected.kind,start:0,end:selected.text.length,text:draft.text});}
        finally{session.binding.readOnlyReason=previousReason;}
        const result=await operation;
        if(result.text!==draft.text)throw Error('The recovered method was not applied completely. Its draft is retained.');
        await recovery.discard(identity);session.binding.readOnlyReason=sourceReadOnlyReason;
        return draftRecovery.prepare(session.binding.snapshot());
      },
    };
    const view=shell.attach({...session,row,origin:state.origin,selectedId:state.selectedId,services:{...session.services,editorScriptUri,draftRecovery}});
    views.set(key,{panel:session.panel,view,row,binding:session.binding,origin:state.origin});
    lastActiveKey=key;
    const active=session.panel.onDidChangeViewState?.(event=>{
      const current=views.get(key),panel=event.webviewPanel;
      if(!current||current.panel!==session.panel||panel!==session.panel)return;
      if(panel.active)lastActiveKey=key;
      const column=panel.viewColumn;
      if(Number.isInteger(column)&&column>=1&&column<=9&&contexts[key]?.column!==column)remember(current.row,column,current.origin);
    });
    const closed=session.panel.onDidDispose(()=>{if(views.get(key)?.panel===session.panel)views.delete(key);});
    return {dispose(){active?.dispose();closed.dispose();view.dispose();if(reservedIdentity)void recovery.release(reservedIdentity).catch(()=>{});}};
  });
  const registration=vscode.window.registerCustomEditorProvider(viewType,provider,{supportsMultipleEditorsPerDocument:true,webviewOptions:{retainContextWhenHidden:true}});
  async function openResolved(row,{origin,selectedId}={}){
    if(disposed)throw Error('Class workspace is closed.');
    const identity=await model.resolveClass(row),key=classIdentity(identity),existing=views.get(key);
    origin??=existing?.origin;
    if(existing){
      try{
        if(origin){existing.origin=origin;existing.view.setOrigin(origin);remember(identity,existing.panel.viewColumn,origin);}
        existing.panel.reveal(existing.panel.viewColumn);
        if(selectedId)await existing.view.select(selectedId);
        return {opened:true,reused:true,uri:identity.file};
      }catch(error){
        if(!/webview is disposed/i.test(error?.message||''))throw error;
        // Native disposal may precede delivery of onDidDispose. The explicit
        // navigation request opens a fresh view, never revives the old panel.
        if(views.get(key)===existing)views.delete(key);
        existing.view.dispose();
      }
    }
    const other=[...views.values()].some(value=>value.row.file===identity.file);
    const column=other?vscode.ViewColumn.Beside:vscode.ViewColumn.Active;
    pending.set(identity.file,{row:identity,origin,selectedId});
    try{await vscode.commands.executeCommand('vscode.openWith',vscode.Uri.parse(identity.file),viewType,{preview:false,viewColumn:column});}
    catch(error){pending.delete(identity.file);throw error;}
    const created=views.get(key);if(selectedId&&created)await created.view.select(selectedId);
    return {opened:true,reused:false,uri:identity.file};
  }
  function open(row,options){
    const operation=opening.then(()=>openResolved(row,options));
    opening=operation.catch(()=>{});
    return operation;
  }
  async function prepareActiveSource(uri){
    const project=vscode.workspace?.getWorkspaceFolder?.(uri)?.uri.toString();
    for(const [key,value] of views){
      if(value.row.file!==uri.toString()&&!(project&&value.row.projectId===project))continue;
      try{
        if((value.panel.active||value.binding?.snapshot?.())&&await value.view.flushPendingEdits?.()===false)return false;
      }catch(error){
        if(!/webview is disposed/i.test(error?.message||''))throw error;
        // A native close can precede the extension-host disposal event. Its
        // stale canvas must not prevent flushing the remaining live sources.
        if(views.get(key)===value)views.delete(key);
        value.view.dispose();
      }
    }
    return true;
  }
  const controller={open,prepareActiveSource,async openOriginal(){const selected=[...views.values()].find(value=>value.panel.active)||views.get(lastActiveKey)||[...views.values()].at(-1);if(!selected)throw Error('Choose a class workspace before opening its original source.');if(!onOriginal)throw Error('Original source navigation is unavailable.');return onOriginal(selected.row,selected.view.state?.().selectedId);},refresh:()=>shell.refresh(),dispose(){if(disposed)return;disposed=true;registration.dispose();provider.dispose();shell.dispose();views.clear();pending.clear();}};
  context.subscriptions.push(controller);
  return controller;
}
module.exports={registerClassWorkspaces,safeContext};
