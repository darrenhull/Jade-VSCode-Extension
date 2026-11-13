'use strict';
const {parseSource}=require('./source_symbols');
const {LanguageModel}=require('./language-model');
const metadata=model=>({...model,text:'',code:'',excluded:[]});
const same=(a,b)=>a&&b&&a.mtime===b.mtime&&a.size===b.size;
class SourceIndex{
 constructor({list,read,stat,cache,filterCached=entries=>entries,onError=()=>{}}){this.list=list;this.read=read;this.stat=stat;this.cache=cache;this.filterCached=filterCached;this.onError=onError;this.records=new Map();this.serial=new Map();this.project=new LanguageModel();this.scan=0;this.disposed=false;this.pending=new Set();this.bulkDepth=0;this.bulkGeneration=0;this.listeners=new Set();this.status={phase:'idle',completed:0,total:0};}
 report(error){if(!this.disposed)try{this.onError(error);}catch{}}
 onDidChange(listener){this.listeners.add(listener);return {dispose:()=>this.listeners.delete(listener)};}
 announce(state,force=false){this.status=state;const now=Date.now();if(!force&&now-(this.lastNotification||0)<100)return;this.lastNotification=now;for(const listener of this.listeners)try{listener(state);}catch{}}
 document(document){const uri=document.uri.toString(),old=this.records.get(uri);if(old?.open&&old.version===document.version)return old.model;
  this.serial.set(uri,(this.serial.get(uri)||0)+1);const model=parseSource(document.getText(),uri);this.records.set(uri,{model,version:document.version,document,open:true});this.project.update(model);return model;
 }
 async restore(){
  if(!this.restoring){const scan=this.scan;this.restoring=(async()=>{
   if(!this.cache)return;const entries=this.filterCached(await this.cache.load());
   for(let i=0;i<entries.length;i++){if(this.disposed||scan!==this.scan)return;const entry=entries[i];if(!this.records.has(entry.uri)){this.records.set(entry.uri,{model:entry.model,stamp:entry.stamp,cached:true,open:false});this.project.update(entry.model);}if(i&&i%256===0)await new Promise(setImmediate);}
   if(entries.length)this.announce({phase:'cached',completed:0,total:entries.length},true);
  })().catch(error=>this.report(error));}return this.restoring;
 }
 async browserReady(){await this.restore();if(this.disposed)return;const cached=this.records.size>0;const ready=this.ready();if(cached){void ready.catch(error=>this.report(error));return;}await ready;}
 async refresh(uri,scan=this.scan,reuse=false){
  if(this.disposed||scan!==this.scan)return;const old=this.records.get(uri);if(old?.open&&(!this.cache||old.document?.isDirty!==false))return old.model;
  const sequence=(this.serial.get(uri)||0)+1;this.serial.set(uri,sequence);let text,stamp;
  try{
   if(this.stat&&this.cache){stamp=await this.stat(uri);if(this.disposed||scan!==this.scan||this.serial.get(uri)!==sequence)return;if(reuse&&same(old?.stamp,stamp)){old.cached=false;return old.model;}}
   text=await this.read(uri);
  }catch(error){if(this.serial.get(uri)===sequence)this.remove(uri);return;}
  if(this.disposed||scan!==this.scan||this.serial.get(uri)!==sequence)return;
  const model=metadata(parseSource(text,uri)),record={model,stamp,open:false};if(old?.open){this.cache?.set(uri,record);return old.model;}this.records.set(uri,record);this.project.update(model);this.cache?.set(uri,record);return model;
 }
 close(uri){const record=this.records.get(uri);if(!record)return;record.model=metadata(record.model);record.open=false;record.version=undefined;record.document=undefined;this.project.update(record.model);}
 remove(uri){this.serial.set(uri,(this.serial.get(uri)||0)+1);this.records.delete(uri);this.project.remove(uri);this.cache?.delete(uri);this.schedulePersistence();}
 schedulePersistence(){if(!this.cache||this.bulkUpdating||this.disposed||this.cacheTimer)return;this.cacheTimer=setTimeout(()=>{this.cacheTimer=undefined;void this.persist();},100);this.cacheTimer.unref?.();}
 removeSaved(uri){if(this.records.get(uri)?.open){this.cache?.delete(uri);this.schedulePersistence();return;}this.remove(uri);}
 rename(from,to){const open=this.records.get(from);this.remove(from);if(open?.open&&open.document?.uri.toString()===to)this.document(open.document);this.schedule(to);}
 schedule(uri){if(this.disposed)return;this.pending.add(uri);if(!this.bulkUpdating&&!this.timer&&!this.flushing)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush().catch(error=>this.report(error));},30);}
 async flush(){if(this.bulkUpdating||this.disposed)return;if(this.timer){clearTimeout(this.timer);this.timer=undefined;}if(this.flushing){await this.flushing;return this.pending.size?this.flush():undefined;}
  if(!this.pending.size)return;const files=[...this.pending];this.pending.clear();let next=0;
  this.flushing=Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{while(next<files.length&&!this.disposed)await this.refresh(files[next++]);}));
  try{await this.flushing;}finally{this.flushing=undefined;}if(this.pending.size)await this.flush();this.announce({phase:'ready',completed:this.records.size,total:this.records.size},true);void this.persist();
 }
 ready(){if(this.bulkUpdating)return this.warmup||Promise.resolve();if(this.warmup)return this.warmup;const scan=this.scan;
  this.warmup=(async()=>{
   await this.restore();if(this.disposed||scan!==this.scan)return;const files=await this.list();if(this.disposed||scan!==this.scan)return;
   const present=new Set(files);for(const [uri,record] of this.records)if(!record.open&&!present.has(uri))this.remove(uri);
   let next=0,completed=0;this.announce({phase:'indexing',completed,total:files.length},true);
   await Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{while(next<files.length&&!this.disposed&&scan===this.scan){const uri=files[next++],record=this.records.get(uri);if(!record||record.cached)await this.refresh(uri,scan,true);completed++;this.announce({phase:'indexing',completed,total:files.length});}}));
   if(!this.disposed&&scan===this.scan){this.announce({phase:'ready',completed,total:files.length},true);void this.persist();}
  })().catch(error=>{if(scan===this.scan)this.warmup=undefined;throw error;});return this.warmup;
 }
 persist(){if(this.cacheTimer){clearTimeout(this.cacheTimer);this.cacheTimer=undefined;}return this.cache?.flush()||Promise.resolve();}
 async rescan(){
  if(this.bulkUpdating){this.bulkRescanRequested=true;return;}
  await this.ready();const scan=this.scan,files=await this.list();if(this.disposed||scan!==this.scan)return;
  const present=new Set(files);for(const [uri,record] of this.records)if(!record.open&&!present.has(uri))this.remove(uri);
  let next=0;await Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{while(next<files.length&&!this.disposed&&scan===this.scan)await this.refresh(files[next++],scan);}));
  await this.flush();this.announce({phase:'ready',completed:this.records.size,total:this.records.size},true);void this.persist();
 }
 get bulkUpdating(){return this.bulkDepth>0;}
 async pauseDiskUpdates(){
  if(this.disposed)throw Error('Source index is disposed.');if(!this.bulkDepth)this.bulkGeneration++;this.bulkDepth++;clearTimeout(this.timer);this.timer=undefined;
  try{if(this.warmup)await this.warmup;if(this.flushing)await this.flushing;}catch(error){this.bulkDepth--;throw error;}
  let released=false;return async()=>{if(released)return;released=true;this.bulkDepth--;if(this.bulkDepth||this.disposed)return;if(this.bulkRescanRequested){this.bulkRescanRequested=false;await this.rescan();}else await this.flush();};
 }
 invalidate(){clearTimeout(this.cacheTimer);this.cacheTimer=undefined;this.scan++;this.warmup=undefined;this.restoring=undefined;this.records.clear();this.serial.clear();this.pending.clear();this.cache?.invalidate();this.project=new LanguageModel();}
 dispose(){clearTimeout(this.cacheTimer);void this.persist();this.disposed=true;this.scan++;clearTimeout(this.timer);this.pending.clear();this.records.clear();this.serial.clear();this.listeners.clear();}
}
module.exports={SourceIndex};