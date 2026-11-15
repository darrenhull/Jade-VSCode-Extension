'use strict';
function diagnosticLocation(entry,fallbackSource){
 const source=entry.diagnostic_context_unavailable?(entry.generated_source===true?entry.source:undefined):entry.source||fallbackSource;
 if(typeof source!=='string'||!source||!Number.isSafeInteger(entry.line)||entry.line<1)return;
 return{source,line:entry.line,column:Number.isSafeInteger(entry.column)&&entry.column>0?entry.column:1};
}
function diagnosticLines(entry){
 const code=entry.compiler_error??entry.code,owner=[entry.owner,entry.method].filter(value=>typeof value==='string'&&value).join('::');
 const lines=[`Jade${code===undefined?'':' '+code}${owner?' ('+owner+')':''}: ${entry.message||'Native Jade compilation failed.'}`],location=diagnosticLocation(entry);
 if(location)lines.push(`${location.source}:${location.line}:${location.column}`);
 else if(entry.diagnostic_context_unavailable)lines.push('Source context is unavailable; no source location was reported.');
 return lines;
}
module.exports={diagnosticLocation,diagnosticLines};
