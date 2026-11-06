'use strict';

/** Keeps reproducible previous/current run evidence in bounded memory only. */
class WorkspaceRunHistory {
  constructor({maxCells=50,maxBytes=2*1024*1024}={}) {this.entries=new Map();this.maxCells=maxCells;this.maxBytes=maxBytes;this.nextId=0;}
  get size(){return this.entries.size;}
  get bytes(){let size=0;for(const rows of this.entries.values())for(const row of rows)size+=Buffer.byteLength(JSON.stringify(row));return size;}
  record(key,value) {
    const fullOutput=String(value.output||'');let output=fullOutput.slice(-32768);
    if(output.charCodeAt(0)>=0xdc00&&output.charCodeAt(0)<=0xdfff)output=output.slice(1);
    const row=Object.freeze({id:String(++this.nextId),sourceText:String(value.sourceText||''),output,outputTruncated:output.length<fullOutput.length,schema:String(value.schema||''),workingDatabase:String(value.workingDatabase||''),status:String(value.status||''),duration:Number(value.duration)||0});
    const rows=[...(this.entries.get(key)||[]),row].slice(-2);this.entries.delete(key);this.entries.set(key,rows);
    while(this.entries.size>this.maxCells||this.bytes>this.maxBytes)this.entries.delete(this.entries.keys().next().value);
    return row;
  }
  pair(key){const rows=this.entries.get(key);return rows?.length===2?{previous:rows[0],current:rows[1]}:undefined;}
  find(id){for(const rows of this.entries.values()){const row=rows.find(row=>row.id===id);if(row)return row;}}
  text(id){const row=this.find(id);return row?`Scratch Pad · Working database\nSchema: ${row.schema}\nDatabase: ${row.workingDatabase||'(not reported)'}\nResult: ${row.status} · ${Math.round(row.duration)} ms\n\n--- Executed source ---\n${row.sourceText}\n\n--- Native output${row.outputTruncated?' excerpt; earlier output omitted':''} ---\n${row.output}\n`:'This run is no longer retained. Run the Scratch Pad twice to compare its latest results.';}
  clear(){this.entries.clear();}
}
module.exports={WorkspaceRunHistory};
