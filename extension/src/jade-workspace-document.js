'use strict';

const decoder=new TextDecoder('utf-8',{fatal:true});
function decodeNotebook(bytes) {
  if(bytes.byteLength===0)return {schema:'',cells:[]};
  let value;
  try {value=JSON.parse(decoder.decode(bytes).replace(/^\uFEFF/,''));}
  catch(error) {throw Error('Invalid Jade Workspace JSON: '+error.message);}
  if(!value||value.version!==1||!Array.isArray(value.cells)||value.cells.length>1000)throw Error('Unsupported Jade Workspace version or cell list.');
  if(value.schema!==undefined&&(typeof value.schema!=='string'||!/^\w*$/.test(value.schema)))throw Error('Invalid Jade Workspace schema.');
  const cells=value.cells.map(cell=>{
    if(!cell||!['code','markdown'].includes(cell.kind))throw Error('Invalid Jade Workspace cell.');
    const text=cell.source===undefined?cell.text:Array.isArray(cell.source)&&cell.source.every(line=>typeof line==='string')?cell.source.join(''):undefined;
    if(typeof text!=='string')throw Error('Invalid Jade Workspace cell; source must be text.');
    return {kind:cell.kind,text,language:cell.kind==='markdown'?'markdown':'jade-nz'};
  });
  return {schema:value.schema||'',cells};
}
function encodeNotebook(value) {
  return Buffer.from(JSON.stringify({version:1,schema:value.schema||'',cells:value.cells.map(cell=>({kind:cell.kind,source:cell.text?cell.text.split(/(?<=\n)/):[]}))},null,2)+'\n','utf8');
}
function workspaceSnapshot(text,selection) {
  const start=selection?.start??0,end=selection?.end??text.length;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>text.length)throw Error('Invalid Jade Workspace selection.');
  const source=text.slice(start,end);
  if(!source.trim())throw Error('Enter Jade code before running.');
  if(Buffer.byteLength(source,'utf8')>65536)throw Error('A Scratch Pad execution is limited to 64 KiB of UTF-8 source. Run a smaller script or selection.');
  return {text:source,offset:start};
}
function diagnosticOffsets(snapshot,diagnostic) {
  let start=diagnostic.position;
  if(!Number.isInteger(start)) {
    const lines=snapshot.text.split('\n'),line=Math.max(0,(diagnostic.line||1)-1);
    start=lines.slice(0,line).reduce((sum,text)=>sum+text.length+1,0)+Math.max(0,(diagnostic.column||1)-1);
  }
  start=Math.max(0,Math.min(snapshot.text.length,start));
  const length=Number.isInteger(diagnostic.length)?Math.max(0,diagnostic.length):1;
  return {start:snapshot.offset+start,end:snapshot.offset+Math.min(snapshot.text.length,start+length)};
}
module.exports={decodeNotebook,encodeNotebook,workspaceSnapshot,diagnosticOffsets};
