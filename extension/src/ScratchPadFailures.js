'use strict';
/** Bounded, transient native error context tied to the exact executed cell. */
class ScratchPadFailures {
 constructor(){this.entries=new Map();}
 record(document,result,schema,version){
  const sourceUri=document.uri.toString();this.entries.delete(sourceUri);
  const report=result?.report,sourceText=result?.snapshot?.text;
  if(result?.passed!==false||result.cancelled||result.timedOut||result.stale||!Number.isInteger(result.code)||document.version!==version||typeof sourceText!=='string'||sourceText!==document.getText())return;
  const allDiagnostics=Array.isArray(report?.diagnostics)?report.diagnostics:[];
  if(allDiagnostics.some(item=>!item||typeof item!=='object'||(item.source&&item.source!==sourceUri)))return;
  const diagnostics=allDiagnostics.slice(0,20);
  if(!diagnostics.length&&report?.compiled!==true&&report?.executed!==true)return;
  const context=Object.freeze({sourceUri,sourceText,version,schema:String(schema||''),code:result.code,message:String(report?.error||diagnostics[0]?.message||'Native Jade execution failed.').slice(0,8192),diagnostics:diagnostics.map(item=>Object.freeze({source:sourceUri,position:item.position,line:item.line,column:item.column,length:item.length,compiler_error:item.compiler_error??item.code??result.code,message:String(item.message||'Native Jade error.').slice(0,4096)}))});
  this.entries.set(sourceUri,context);while(this.entries.size>50)this.entries.delete(this.entries.keys().next().value);
 }
 get(document,schema){const value=this.entries.get(document.uri.toString());return value&&!document.isClosed&&value.version===document.version&&value.sourceText===document.getText()&&value.schema===(schema||'')?value:undefined;}
 clear(uri){if(uri)return this.entries.delete(uri);this.entries.clear();return false;}
}
module.exports={ScratchPadFailures};
