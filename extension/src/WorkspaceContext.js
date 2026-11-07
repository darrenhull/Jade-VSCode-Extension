'use strict';

/** Resolves virtual editors to their own project before reading a connection. */
class WorkspaceContext {
  constructor({workspace,pickFolder}){this.workspace=workspace;this.pickFolder=pickFolder;this.remembered=new Map();}
  peek(uri) {
    const notebooks=this.workspace.notebookDocuments||[];
    const notebook=notebooks.find(notebook=>notebook.uri.toString()===uri.toString()||notebook.getCells().some(cell=>cell.document.uri.toString()===uri.toString()));
    if(uri.scheme==='vscode-notebook-cell'&&!notebook)throw Error('The Scratch Pad document is closed or was not found.');
    const resource=notebook?.uri||uri,folders=this.workspace.workspaceFolders||[],remembered=this.remembered.get(resource.toString());
    const containingFolder=this.workspace.getWorkspaceFolder(resource);
    const folder=containingFolder||folders.find(folder=>folder.uri.toString()===remembered?.uri.toString())||(folders.length===1?folders[0]:undefined);
    return {resource,folder,configurationResource:containingFolder?resource:folder?.uri};
  }
  async resolve(uri) {
    const scope=this.peek(uri);scope.folder ||= await this.pickFolder();
    if(!scope.folder)throw Error('No project was selected; the Scratch Pad was not executed.');
    scope.configurationResource ||= scope.folder.uri;
    this.remembered.delete(scope.resource.toString());this.remembered.set(scope.resource.toString(),scope.folder);
    while(this.remembered.size>100)this.remembered.delete(this.remembered.keys().next().value);
    return scope;
  }
  clear(){this.remembered.clear();}
}
module.exports={WorkspaceContext};
