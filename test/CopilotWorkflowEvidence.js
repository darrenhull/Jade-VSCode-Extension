'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
/** Records saved UI-produced bytes; it neither generates code nor drives AI. */
class CopilotWorkflowEvidence {
  constructor(directory){this.directory=path.resolve(directory);}
  capture({notebookFile,pristineFile,indexes}){
    const bytes=fs.readFileSync(notebookFile),notebook=JSON.parse(bytes),pristine=JSON.parse(fs.readFileSync(pristineFile,'utf8'));
    if(!Array.isArray(indexes)||indexes.some(index=>!Number.isSafeInteger(index)||index<0||!notebook.cells?.[index]||!pristine.cells?.[index]))throw Error('Invalid evidence cell indexes.');
    fs.mkdirSync(this.directory,{recursive:true});
    const cells=indexes.map(index=>{
      const text=notebook.cells[index].source.join(''),initial=pristine.cells[index].source.join(''),acceptedSource=path.join(this.directory,'cell-'+index+'-accepted.'+(notebook.cells[index].kind==='code'?'jade':'md'));
      fs.writeFileSync(acceptedSource,text,'utf8');return{index,kind:notebook.cells[index].kind,sourceSha256:sha(Buffer.from(text)),initialSourceSha256:sha(Buffer.from(initial)),changed:text!==initial,acceptedSource};
    });
    const receipt={capturedAt:new Date().toISOString(),notebook:path.resolve(notebookFile),notebookSha256:sha(bytes),initialCellCount:pristine.cells.length,currentCellCount:notebook.cells.length,cells};
    fs.writeFileSync(path.join(this.directory,'live-accepted-cells.json'),JSON.stringify(receipt,null,2));return receipt;
  }
  recordNative({index,rawOutput,scenario,receipt}){
    const cell=receipt.cells.find(cell=>cell.index===index);if(!cell||cell.kind!=='code')throw Error('Native evidence requires a captured code cell.');
    const text=fs.readFileSync(cell.acceptedSource,'utf8');if(sha(Buffer.from(text))!==cell.sourceSha256)throw Error('Captured source changed before native validation.');
    const lines=String(rawOutput).split(/\r?\n/).filter(line=>line.startsWith('{')),result=JSON.parse(lines.at(-1));
    const nativeFile=path.join(this.directory,'cell-'+index+'-native.json');fs.writeFileSync(nativeFile,String(rawOutput),'utf8');
    const normalized=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
    if(typeof result.report?.source!=='string'||normalized(result.report.source)!==normalized(cell.acceptedSource))throw Error('Native result does not identify the captured accepted source file.');
    new (require('./ScratchPadCopilotWorkflow').ScratchPadCopilotWorkflow)(scenario).assertAccepted({text,initialCellCount:receipt.initialCellCount,currentCellCount:receipt.currentCellCount,nativeResult:result});
    return {index,nativeFile,nativeSha256:sha(Buffer.from(rawOutput)),sourceSha256:cell.sourceSha256,code:result.code,compiled:result.report.compiled,executed:result.report.executed,output:result.report.output,elapsedMilliseconds:result.report.elapsedMilliseconds};
  }
}
module.exports={CopilotWorkflowEvidence};
