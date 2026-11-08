'use strict';
/** Reuse unchanged indexed metadata; member typing must not re-resolve 30k projects. */
function createClassDiscoveryRows(folderFor){
 let grouped=new WeakMap();const stable=new Map();
 function rows(groups){
   const result=[],present=new Set();
   for(const entries of groups.values()){
     let values=grouped.get(entries);
     if(!values){
       const projects=new Map();
       for(const entry of entries){const folder=folderFor(entry.model.uri),id=folder?.uri.toString()||'';if(!projects.has(id))projects.set(id,{entries:[],folder});projects.get(id).entries.push(entry);}
       values=[...projects].map(([projectId,{entries,folder}])=>{
         const first=entries.find(entry=>!entry.cls.partial)||entries[0],name=first.cls.name,schema=first.model.schema,key=JSON.stringify([projectId,schema,name]);
         const value=stable.get(key)||{};
         Object.assign(value,{kind:'class',name,schema,parent:first.cls.parent,entries,projectId,projectRoot:folder?.uri.fsPath,projectName:folder?.name});
         stable.set(key,value);return {key,value};
       });
       grouped.set(entries,values);
     }
     for(const {key,value} of values){if(value.schema){present.add(key);result.push(value);}}
   }
   for(const key of stable.keys())if(!present.has(key))stable.delete(key);
   return result;
 }
 rows.invalidate=()=>{grouped=new WeakMap();stable.clear();};
 return rows;
}
module.exports={createClassDiscoveryRows};
