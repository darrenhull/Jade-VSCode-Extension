'use strict';
const MAX_BYTES=16*1024,MAX_FIELD_BYTES=256,MAX_OPERATIONS=32;
const contextFields=['executionSchema','sourceVersion','stage','targetSchema','lastSuccessfullySelectedSchema','currentType'];
const operationFields=['stage','targetSchema','lastSuccessfullySelectedSchema','currentType','operation','receiverNull','receiverKind'];
function label(value){
 if(typeof value!=='string'||!value)return undefined;
 let text='',bytes=0;
 for(let character of value){
  if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(character))character=' ';
  if(character.length===1&&character.charCodeAt(0)>=0xd800&&character.charCodeAt(0)<=0xdfff)character='\ufffd';
  const size=Buffer.byteLength(character);
  if(bytes+size>MAX_FIELD_BYTES-3)return text+'…';
  text+=character;bytes+=size;
 }
 return text;
}
function metadata(value,fields){
 if(!value||typeof value!=='object'||Array.isArray(value))return '';
 const parts=[];
 for(const field of fields){
  if(field==='receiverNull'){if(typeof value[field]==='boolean')parts.push(field+'='+value[field]);}
  else{const text=label(value[field]);if(text!==undefined)parts.push(field+'='+JSON.stringify(text));}
 }
 return parts.join(' ');
}
/** Extra failure context only; the caller prints the original native error first. */
function sourceExtractionFailureContext(result){
 try{
  if(result?.passed!==false||result.status!=='failed')return [];
  const report=result.report;
  if(!report||typeof report!=='object'||Array.isArray(report))return [];
  const lines=[],context=metadata(report,contextFields);
  if(context)lines.push('Native extraction context: '+context);
  const operations=(Array.isArray(report.recentOperations)?report.recentOperations.slice(-MAX_OPERATIONS):[report.lastOperation]).map(value=>metadata(value,operationFields)).filter(Boolean);
  let remaining=MAX_BYTES-Buffer.byteLength(lines.join('\n'))-100;
  const recent=[];
  // Prefer the newest safe operations when the total output bound is reached.
  for(let index=operations.length-1;index>=0;index--){
   const line='  '+operations[index],bytes=Buffer.byteLength(line)+1;
   if(bytes>remaining)break;
   recent.unshift(line);remaining-=bytes;
  }
  if(recent.length){const truncated=recent.length<operations.length||(Array.isArray(report.recentOperations)&&report.recentOperations.length>MAX_OPERATIONS);lines.push('Recent native operations (last '+recent.length+(truncated?'; older operations omitted':'')+'):',...recent);}
  return lines;
 }catch{return [];}
}
module.exports={sourceExtractionFailureContext};
