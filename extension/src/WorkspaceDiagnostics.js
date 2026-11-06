'use strict';

/** Keeps cell errors independent while retiring resolved shared dependencies. */
class WorkspaceDiagnostics {
  constructor(){this.owners=new Map();}
  replace(owner,groups,{schema='',target='',prepared=false}={}) {
    if(prepared&&target)for(const [key,entry]of this.owners)if(entry.schema===schema&&entry.target===target)for(const id of entry.groups.keys())if(id!==key)entry.groups.delete(id);
    this.owners.delete(owner);this.owners.set(owner,{schema,target,groups});
    while(this.owners.size>50)this.owners.delete(this.owners.keys().next().value);
  }
  groups(){const all=new Map();for(const entry of this.owners.values())for(const [id,group]of entry.groups){if(!all.has(id))all.set(id,{uri:group.uri,items:[]});all.get(id).items.push(...group.items);}return all;}
  clear(){this.owners.clear();}
}
module.exports={WorkspaceDiagnostics};
