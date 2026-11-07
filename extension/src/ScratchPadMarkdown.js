'use strict';
/** Uses the native Notebook editor and renderer; never runs Jade code. */
class ScratchPadMarkdown {
 constructor(vscode){this.vscode=vscode;}
 cell(value){
  const editor=this.vscode.window.activeNotebookEditor,candidate=value?.cell||value;
  const cell=candidate?.document?candidate:editor?.notebook.cellAt(editor.selections?.[0]?.start??0);
  if(!cell||cell.notebook?.notebookType!=='jade-workspace'||cell.kind!==this.vscode.NotebookCellKind.Markup)throw Error('Choose a Markdown cell in a Scratch Pad. Jade code cells execute code; Markdown cells display text and diagrams.');
  return cell;
 }
 async mode(value,command){const cell=this.cell(value);await this.vscode.window.showNotebookDocument(cell.notebook,{selections:[new this.vscode.NotebookRange(cell.index,cell.index+1)]});await this.vscode.commands.executeCommand(command);return cell;}
 edit(value){return this.mode(value,'notebook.cell.edit');}
 preview(value){return this.mode(value,'notebook.cell.quitEdit');}
 async insertMermaid(value){
  const cell=this.cell(value),source=cell.document.getText();
  if(!/^\s*`{3,}mermaid\b/m.test(source)){
   const raw=/^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|pie|gitGraph|mindmap|timeline|requirementDiagram|quadrantChart|C4\w*|sankey-beta|xychart-beta|block-beta|architecture-beta|packet-beta|kanban)\b/.test(source);
   const body=raw?source:'flowchart LR\n    A[Source] --> B[Working]';
   const diagram='```mermaid\n'+body+(body.endsWith('\n')?'':'\n')+'```';
   const text=source.trim()&&!raw?source+'\n\n'+diagram:diagram;
   const edit=new this.vscode.WorkspaceEdit();edit.replace(cell.document.uri,new this.vscode.Range(cell.document.positionAt(0),cell.document.positionAt(source.length)),text);
   if(!await this.vscode.workspace.applyEdit(edit))throw Error('The Markdown cell changed before the Mermaid diagram could be inserted.');
  }
  await this.preview(cell);return cell;
 }
}
module.exports={ScratchPadMarkdown};
