'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerWorkspaces}=require('../../extension/src/jade-workspaces'),{ScratchPadCopilot}=require('../../extension/src/ScratchPadCopilot');
test('notebook toolbar resolves the existing selected cell and supplies only bundled language guidance URIs',async()=>{
 const noop=()=>({dispose(){}}),commands=new Map(),selected={document:{},kind:1},received=[];
 const vscode={Uri:{joinPath:(uri,...parts)=>({toString:()=>uri.toString()+'/'+parts.join('/')})},window:{activeNotebookEditor:{notebook:{cellAt:index=>{assert.equal(index,2);return selected;}},selections:[{start:2}]},createOutputChannel:()=>({dispose(){}})},languages:{createDiagnosticCollection:()=>({dispose(){}})},EventEmitter:class{constructor(){this.event=noop;}dispose(){}},notebooks:{createNotebookController:()=>({dispose(){}}),registerNotebookCellStatusBarItemProvider:noop},workspace:{registerNotebookSerializer:noop,registerTextDocumentContentProvider:noop},commands:{registerCommand:(name,run)=>{commands.set(name,run);return noop();}}};
 const original=ScratchPadCopilot.prototype.edit;ScratchPadCopilot.prototype.edit=function(cell){received.push({cell,guidance:this.guidance,markdownGuidance:this.markdownGuidance});};
 try{registerWorkspaces(vscode,{subscriptions:[],extensionUri:{toString:()=> 'file:///trusted/extension'}},{client:{},configFor(){}});await commands.get('jadeNative.editScratchPadWithCopilot')();assert.strictEqual(received[0].cell,selected);assert.deepEqual(received[0].markdownGuidance?.map(uri=>uri.toString()),['file:///trusted/extension/skills/mermaid/SKILL.md']);assert.deepEqual(received[0].guidance.map(uri=>uri.toString()),['SKILL.md','references/language-reference.md','references/syntax-reference.md','references/primitive-types.md','references/language-syntax.md'].map(file=>'file:///trusted/extension/skills/jade-language/'+file));}
 finally{ScratchPadCopilot.prototype.edit=original;}
});
