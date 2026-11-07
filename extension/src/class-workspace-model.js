'use strict';
const {classSections}=require('./class-view-model');
const GROUPS=['Properties','References','Methods','Type methods','Constants','Collection keys','Inheritance'];
const memberId=member=>JSON.stringify([member.schema,member.owner,member.kind,member.name]);
function createClassWorkspaceModel({vscode,language,readSource}) {
  const parsed=new Map();
  const folderOf=uri=>vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri));
  const projectOf=uri=>folderOf(uri)?.uri.toString()||'';
  async function ready(){await language.index.ready();await language.index.flush();}
  function entriesFor(name,schema,project){return (language.index.project.groups.get(schema+'::'+name)||[]).filter(entry=>!project||projectOf(entry.model.uri)===project);}
  async function classData(entries,name){
    const groups=new Map(GROUPS.map(label=>[label,[]]));let document;
    for(const entry of entries){
      const uri=entry.model.uri,record=language.index.records?.get(uri),cached=parsed.get(uri);
      let value=cached;
      if(!cached||cached.indexModel!==entry.model||record?.open&&cached.version!==record.version){
        const loaded=await readSource(uri),text=loaded.text??loaded.doc.getText();
        value={indexModel:entry.model,version:loaded.doc?.version,doc:loaded.doc,classes:classSections(text,uri),text};
        if(parsed.size>=24)parsed.delete(parsed.keys().next().value);
        parsed.set(uri,value);
      }
      document ||= value.doc;
      const cls=value.classes.find(cls=>cls.name===name);
      for(const group of cls?.groups||[])for(const member of group.items){
        const kind=group.label==='Type methods'?'typeMethod':member.kind;
        groups.get(group.label)?.push({...member,kind,id:memberId({...member,kind}),declaringClass:name,declaringSchema:entry.model.schema,inherited:false});
      }
    }
    return {document,groups:[...groups].map(([label,items])=>({label,items})),entries};
  }
  async function resolveClass(row){
    await ready();
    const name=row.owner||row.className||row.name,schema=row.schema;
    if(!name||!schema)throw Error('Select a schema-qualified workspace class.');
    let entries=entriesFor(name,schema),project=row.projectId||row.projectRoot||row.workspaceRoot;
    const selectedUri=row.file||row.entries?.[0]?.model.uri;
    if(selectedUri)project=projectOf(selectedUri);
    if(project&&!entries.some(entry=>projectOf(entry.model.uri)===project)){
      // Public navigation may supply the native filesystem workspace path.
      project=entries.map(entry=>folderOf(entry.model.uri)).find(folder=>folder?.uri.fsPath===project)?.uri.toString()||project;
    }
    if(project)entries=entries.filter(entry=>projectOf(entry.model.uri)===project);
    const projects=[...new Set(entries.map(entry=>projectOf(entry.model.uri)))];
    if(projects.length>1)throw Error('This class exists in more than one project. Select its project in Classes.');
    if(!entries.length)throw Error('Workspace class source is missing. Refresh Classes or open its original source.');
    if(entries.filter(entry=>!entry.cls.partial).length>1)throw Error('Ambiguous class: multiple complete declarations exist in this project.');
    const primary=entries.find(entry=>!entry.cls.partial)||entries[0],folder=folderOf(primary.model.uri);
    return {qualifiedName:schema+'::'+name,name,schema,projectId:projects[0],projectRoot:folder?.uri.fsPath,projectName:folder?.name||'Workspace',file:primary.model.uri,superclass:primary.cls.parent,entries};
  }
  async function snapshot(row,includeInherited){
    const identity=await resolveClass(row),local=await classData(identity.entries,identity.name);
    const groups=new Map(local.groups.map(group=>[group.label,[...group.items]])),known=new Set(local.groups.flatMap(g=>g.items).filter(m=>m.kind!=='base').map(m=>m.name));
    let inheritedAvailable=true,inheritedReason='',parent=identity.superclass,schema=identity.schema;
    const seen=new Set([schema+'::'+identity.name]);
    while(parent){
      let entries=entriesFor(parent,schema,identity.projectId),resolvedSchema=schema;
      const schemas=new Set();
      while(!entries.length&&resolvedSchema&&!schemas.has(resolvedSchema)){
        schemas.add(resolvedSchema);resolvedSchema=language.index.project.parent(resolvedSchema);
        if(resolvedSchema)entries=entriesFor(parent,resolvedSchema,identity.projectId);
      }
      const key=(resolvedSchema||'RootSchema')+'::'+parent;
      if(seen.has(key)){inheritedAvailable=false;inheritedReason='Superclass ownership contains a cycle.';break;}
      seen.add(key);
      if(entries.length){
        if(entries.filter(e=>!e.cls.partial).length>1){inheritedAvailable=false;inheritedReason='Superclass source has ambiguous declarations.';break;}
        const base=entries.find(e=>!e.cls.partial)||entries[0];
        if(includeInherited){const data=await classData(entries,parent);for(const group of data.groups)for(const member of group.items){if(member.kind==='base'||known.has(member.name))continue;known.add(member.name);groups.get(group.label).push({...member,inherited:true});}}
        parent=base.cls.parent;schema=base.model.schema;
      }else{
        const system=language.index.project.system.get(parent);
        if(!system){inheritedAvailable=false;inheritedReason='Superclass metadata is unavailable. Declared members remain available.';break;}
        if(includeInherited)for(const member of system.members||[]){if(known.has(member.name))continue;known.add(member.name);const kind=member.typeMethod?'typeMethod':member.kind;const label=kind==='typeMethod'?'Type methods':kind==='method'?'Methods':'Properties';groups.get(label).push({...member,kind,id:memberId({...member,kind,owner:system.name,schema:'RootSchema'}),owner:system.name,schema:'RootSchema',declaringClass:system.name,declaringSchema:'RootSchema',inherited:true,system:true});}
        parent=system.parent;schema='RootSchema';
      }
    }
    const {entries,...publicIdentity}=identity;
    return {identity:{...publicIdentity,dirty:local.document?.isDirty||false},groups:[...groups].map(([label,items])=>({label,items:items.sort((a,b)=>a.name.localeCompare(b.name))})),inheritedAvailable,inheritedReason};
  }
  async function load(row,state={}){
    const data=await snapshot(row,state.includeInherited===true),all=data.groups.flatMap(group=>group.items),query=(state.query||'').trim().toLowerCase();
    const matching=all.filter(member=>(!state.kind||state.kind==='all'||member.kind===state.kind)&&(!query||[member.name,member.detail,member.type].filter(Boolean).join(' ').toLowerCase().includes(query)));
    const limit=100,total=matching.length,offset=Math.min(Math.max(0,Number.isSafeInteger(state.offset)?state.offset:0),total?Math.floor((total-1)/limit)*limit:0),page=new Set(matching.slice(offset,offset+limit).map(m=>m.id));
    return {...data,groups:data.groups.map(group=>({...group,total:group.items.length,items:group.items.filter(member=>page.has(member.id))})),total,offset,hasMore:offset+limit<total,selected:all.find(member=>member.id===state.selectedId),overview:{counts:data.groups.map(group=>({label:group.label,count:group.items.length})),source:data.identity.file,superclass:data.identity.superclass}};
  }
  async function preview(row,id){const data=await snapshot(row,true),member=data.groups.flatMap(g=>g.items).find(m=>m.id===id);if(!member)return;const value=parsed.get(member.file);return {...member,text:value?value.text.slice(member.bodyStart??member.start,member.bodyStart===undefined?member.end:member.end-1).trim():member.detail||member.name};}
  return {resolveClass,load,members:load,preview};
}
module.exports={createClassWorkspaceModel,memberId};
