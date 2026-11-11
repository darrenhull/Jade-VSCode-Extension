'use strict';
const {parseSource}=require('./source_symbols');
const {LanguageModel}=require('./language-model');
const metadata=model=>({...model,text:'',code:'',excluded:[]});
class SourceIndex{
  constructor({list,read}){this.list=list;this.read=read;this.records=new Map();this.serial=new Map();this.project=new LanguageModel();this.scan=0;this.disposed=false;this.pending=new Set();this.bulkDepth=0;}
  document(document){const uri=document.uri.toString(),old=this.records.get(uri);if(old?.open&&old.version===document.version)return old.model;
    this.serial.set(uri,(this.serial.get(uri)||0)+1);const model=parseSource(document.getText(),uri);this.records.set(uri,{model,version:document.version,open:true});this.project.update(model);return model;
  }
  async refresh(uri,scan=this.scan){
    if(this.disposed||scan!==this.scan)return;const old=this.records.get(uri);if(old?.open)return old.model;
    const sequence=(this.serial.get(uri)||0)+1;this.serial.set(uri,sequence);let text;
    try{text=await this.read(uri);}catch(error){if(this.serial.get(uri)===sequence)this.remove(uri);return;}
    if(this.disposed||scan!==this.scan||this.serial.get(uri)!==sequence)return;
    const model=metadata(parseSource(text,uri));this.records.set(uri,{model,open:false});this.project.update(model);return model;
  }
  close(uri){const record=this.records.get(uri);if(!record)return;record.model=metadata(record.model);record.open=false;record.version=undefined;this.project.update(record.model);}
  remove(uri){this.serial.set(uri,(this.serial.get(uri)||0)+1);this.records.delete(uri);this.project.remove(uri);}
  schedule(uri){if(this.disposed)return;this.pending.add(uri);if(!this.bulkUpdating&&!this.timer&&!this.flushing)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},30);}
  async flush(){if(this.bulkUpdating||this.disposed)return;if(this.timer){clearTimeout(this.timer);this.timer=undefined;}if(this.flushing){await this.flushing;return this.pending.size?this.flush():undefined;}
    if(!this.pending.size)return;const files=[...this.pending];this.pending.clear();let next=0;
    this.flushing=Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{while(next<files.length&&!this.disposed)await this.refresh(files[next++]);}));
    try{await this.flushing;}finally{this.flushing=undefined;}if(this.pending.size)await this.flush();
  }
  ready(){if(this.bulkUpdating)return this.warmup||Promise.resolve();if(this.warmup)return this.warmup;const scan=this.scan;
    this.warmup=(async()=>{const files=await this.list();let next=0;
      await Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{while(next<files.length&&!this.disposed&&scan===this.scan){const uri=files[next++];if(!this.records.has(uri))await this.refresh(uri,scan);}}));
    })().catch(error=>{if(scan===this.scan)this.warmup=undefined;throw error;});return this.warmup;
  }
  async rescan(){
    if(this.bulkUpdating){this.bulkRescanRequested=true;return;}
    await this.ready();const scan=this.scan,files=await this.list();
    if(this.disposed||scan!==this.scan)return;
    const present=new Set(files);
    for(const [uri,record] of this.records)if(!record.open&&!present.has(uri))this.remove(uri);
    let next=0;
    await Promise.all(Array.from({length:Math.min(8,files.length)},async()=>{while(next<files.length&&!this.disposed&&scan===this.scan)await this.refresh(files[next++],scan);}));
    await this.flush();
  }
  get bulkUpdating(){return this.bulkDepth>0;}
  async pauseDiskUpdates(){
    if(this.disposed)throw Error('Source index is disposed.');
    this.bulkDepth++;clearTimeout(this.timer);this.timer=undefined;
    try{if(this.warmup)await this.warmup;if(this.flushing)await this.flushing;}
    catch(error){this.bulkDepth--;throw error;}
    let released=false;
    return async()=>{
      if(released)return;released=true;this.bulkDepth--;
      if(this.bulkDepth||this.disposed)return;
      if(this.bulkRescanRequested){this.bulkRescanRequested=false;await this.rescan();}
      else await this.flush();
    };
  }
  invalidate(){this.scan++;this.warmup=undefined;this.records.clear();this.serial.clear();this.pending.clear();this.project=new LanguageModel();}
  dispose(){this.disposed=true;this.scan++;clearTimeout(this.timer);this.pending.clear();this.records.clear();this.serial.clear();}
}
module.exports={SourceIndex};
