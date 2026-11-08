'use strict';
const {randomUUID}=require('node:crypto');
/** Immutable, bounded native text documents used only as Copilot attachments. */
class ScratchPadCopilotContext {
  constructor(vscode,{maxEntries=32,maxBytes=4*1024*1024,maxEntryBytes=1024*1024}={}){
    for(const value of [maxEntries,maxBytes,maxEntryBytes])if(!Number.isSafeInteger(value)||value<1)throw Error('Invalid Scratch Pad context capacity.');
    Object.assign(this,{vscode,maxEntries,maxBytes,maxEntryBytes});this.entries=new Map();this.bytes=0;this.closed=false;
    this.registration=vscode.workspace.registerTextDocumentContentProvider('jade-scratch-context',{provideTextDocumentContent:uri=>{
      const value=this.entries.get(uri.toString());if(this.closed||!value)throw Error('Scratch Pad context is closed or unavailable.');return value.text;
    }});
  }
  async create(text){
    if(this.closed)throw Error('Scratch Pad context is closed.');
    if(typeof text!=='string')throw Error('Invalid Scratch Pad context text.');
    const bytes=Buffer.byteLength(text,'utf8');if(bytes>this.maxEntryBytes)throw Error('Scratch Pad context exceeds the permitted size.');
    for(const record of this.entries.values())if(record.text===text){await record.ready;if(this.closed)throw Error('Scratch Pad context is closed.');return record.uri;}
    if(this.entries.size>=this.maxEntries||this.bytes+bytes>this.maxBytes)throw Error('Scratch Pad context capacity limit reached. Reload the extension before attaching more error snapshots.');
    const uri=this.vscode.Uri.parse('jade-scratch-context:/native-error-'+randomUUID()+'.md'),key=uri.toString(),record={uri,text};
    this.entries.set(key,record);this.bytes+=bytes;
    record.ready=Promise.resolve().then(()=>this.vscode.workspace.openTextDocument(uri));
    try{await record.ready;if(this.closed)throw Error('Scratch Pad context is closed.');return uri;}
    catch(error){if(this.entries.get(key)===record){this.entries.delete(key);this.bytes-=bytes;}throw error;}
  }
  dispose(){if(this.closed)return;this.closed=true;this.entries.clear();this.bytes=0;this.registration.dispose();}
}
module.exports={ScratchPadCopilotContext};
