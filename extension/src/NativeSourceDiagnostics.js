'use strict';
const {diagnosticLocation}=require('./compiler-diagnostic-presentation');

// Native diagnostics already contain any mapped JOX or generated SCM position.
// Keep projects independent; never guess a projection position from a selection.
class NativeSourceDiagnostics {
  constructor(vscode,collection){this.vscode=vscode;this.collection=collection;this.projects=new Map();}
  report(project,result){
    if(this.disposed)return;
    const report=result?.report,entries=report?.diagnostics;
    if(report?.compiled!==true&&(!Array.isArray(entries)||!entries.length))return;
    const groups=new Map(),vscode=this.vscode;
    for(const entry of Array.isArray(entries)?entries:[]){
      if(!entry||typeof entry!=='object')continue;
      const location=diagnosticLocation(entry,report.source);if(!location)continue;
      const uri=vscode.Uri.file(location.source),key=uri.toString();
      if(!groups.has(key))groups.set(key,{uri,items:[]});
      const line=location.line-1,column=location.column-1;
      const length=Number.isSafeInteger(entry.error_length)&&entry.error_length>0?entry.error_length:1;
      const owner=[entry.schema,entry.owner||entry.class,entry.method].filter(value=>typeof value==='string'&&value).join('::');
      const diagnostic=new vscode.Diagnostic(new vscode.Range(line,column,line,column+length),
        (owner?owner+': ':'')+(entry.message||'Jade compilation failed.'),vscode.DiagnosticSeverity.Error);
      diagnostic.code=entry.compiler_error??entry.code;diagnostic.source='Jade';
      groups.get(key).items.push(diagnostic);
    }
    this.projects.set(project,groups);
    const combined=new Map();
    for(const owned of this.projects.values())for(const [key,group]of owned){
      if(!combined.has(key))combined.set(key,{uri:group.uri,items:[]});
      combined.get(key).items.push(...group.items);
    }
    this.collection.clear();for(const {uri,items}of combined.values())this.collection.set(uri,items);
  }
  dispose(){this.disposed=true;this.projects.clear();}
}
module.exports={NativeSourceDiagnostics};
