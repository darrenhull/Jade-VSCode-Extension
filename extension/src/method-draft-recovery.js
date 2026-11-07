'use strict';
const STORAGE_KEY='jade.methodDraftRecovery.v1';
function sourceMemberKind(kind){if(kind===undefined||kind==='method'||kind==='typeMethod')return 'method';if(kind==='property'||kind==='reference')return kind;throw new Error('Invalid source member kind.');}
/** Bounded safety checkpoints only. Saving and undo always belong to TextDocument. */
class MethodDraftRecovery {
  constructor(storage,{maxCharacters=262144,maxRecords=32,maxBytes=67108864}={}){
    this.storage=storage;this.maxCharacters=maxCharacters;this.maxRecords=maxRecords;this.maxBytes=maxBytes;this.queue=Promise.resolve();
    this.records=new Map();this.leases=new Map();this.unresolved=new Set();
    const values=storage.get(STORAGE_KEY);
    if(Array.isArray(values))for(const record of values.slice(0,maxRecords)){
      try{const key=this.key(record.identity);if(!record.pristine&&typeof record.text==='string'&&record.text.length<=maxCharacters&&Number.isSafeInteger(record.version)){this.records.set(key,{identity:record.identity,text:record.text,version:record.version,modifiedAt:record.modifiedAt});this.unresolved.add(key);}}catch{}
    }
  }
  key(identity){
    if(!identity||!['uri','projectId','schema','owner','member'].every(field=>typeof identity[field]==='string'&&identity[field].length>0&&identity[field].length<=4096)||!identity.uri.startsWith('file:'))throw new Error('Draft recovery requires a resolved local source identity.');
    return JSON.stringify([identity.projectId,identity.uri,identity.schema,identity.owner,identity.member,sourceMemberKind(identity.kind)]);
  }
  serial(action){const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;}
  get(identity){const value=this.records.get(this.key(identity));return value&&!value.pristine?structuredClone(value):undefined;}
  isUnresolved(identity){return this.unresolved.has(this.key(identity));}
  protectUnapplied(identity,snapshot){return this.serial(async()=>{
    const key=this.key(identity),record=this.records.get(key);
    if(!record||record.pristine)return false;
    if(!this.unresolved.has(key)&&record.text===snapshot.text)return false;
    this.unresolved.add(key);return true;
  });}
  list(scope){return [...this.records.values()].filter(record=>!record.pristine&&['uri','projectId','schema','owner'].every(field=>scope[field]===undefined||record.identity[field]===scope[field])).sort((a,b)=>b.modifiedAt-a.modifiedAt).map(record=>structuredClone(record));}
  reserve(identity){return this.serial(async()=>{
    const key=this.key(identity),next=new Map(this.records);
    if(this.unresolved.has(key))throw new Error('Restore or discard the recovered draft before editing this method.');
    if(!next.has(key))next.set(key,{identity:{...identity},text:'',version:0,modifiedAt:Date.now(),pristine:true});
    // Reserve a complete worst-case UTF8 method allocation before enabling typing.
    if(next.size>this.maxRecords||next.size*(this.maxCharacters*6+131072)>this.maxBytes)throw new Error('Method recovery storage is full. Recover or discard an existing draft before editing another method.');
    await this.storage.update(STORAGE_KEY,[...next.values()]);this.records=next;this.leases.set(key,(this.leases.get(key)||0)+1);
  });}
  release(identity){return this.serial(async()=>{const key=this.key(identity);const count=this.leases.get(key)||0;if(count>1){this.leases.set(key,count-1);return;}this.leases.delete(key);if(!this.records.get(key)?.pristine){if(this.records.has(key))this.unresolved.add(key);return;}const next=new Map(this.records);next.delete(key);await this.storage.update(STORAGE_KEY,[...next.values()]);this.records=next;});}
  save(identity,draft){return this.serial(async()=>{
    const key=this.key(identity);
    if(this.unresolved.has(key))throw new Error('Restore or discard the recovered draft before editing this method.');
    if(typeof draft?.text!=='string'||draft.text.length>this.maxCharacters)throw new Error('Method draft is too large for protected editing. Open Original Source to edit this method.');
    if(!Number.isSafeInteger(draft.version)||draft.version<0)throw new Error('Invalid source revision for draft recovery.');
    const next=new Map(this.records),record={identity:{...Object.fromEntries(['uri','projectId','schema','owner','member'].map(field=>[field,identity[field]])),kind:sourceMemberKind(identity.kind)},text:draft.text,version:draft.version,modifiedAt:Date.now()};next.set(key,record);
    const values=[...next.values()];
    if(values.length>this.maxRecords||Buffer.byteLength(JSON.stringify(values),'utf8')>this.maxBytes)throw new Error('Method recovery storage is full. Recover or discard an existing draft before editing another method.');
    await this.storage.update(STORAGE_KEY,values);this.records=next;return structuredClone(record);
  });}
  acknowledge(identity,snapshot){return this.serial(async()=>{
    const key=this.key(identity),record=this.records.get(key);
    // Native document version counters restart after reload. Exact current
    // source equality is the acknowledgement; a saved historical counter is not.
    if(!record||record.text!==snapshot.text||!Number.isSafeInteger(snapshot.version))return false;
    const next=new Map(this.records);if(this.leases.has(key))next.set(key,{...record,text:'',pristine:true});else next.delete(key);await this.storage.update(STORAGE_KEY,[...next.values()]);this.records=next;this.unresolved.delete(key);return true;
  });}
  discard(identity){return this.serial(async()=>{const next=new Map(this.records),key=this.key(identity),record=next.get(key);if(record&&this.leases.has(key))next.set(key,{...record,text:'',pristine:true});else next.delete(key);await this.storage.update(STORAGE_KEY,[...next.values()]);this.records=next;this.unresolved.delete(key);});}
}
module.exports={MethodDraftRecovery,sourceMemberKind};
