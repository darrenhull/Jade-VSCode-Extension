'use strict';
/** Explicit workspace opt-in to VS Code's native notebook editing agent. */
class NotebookCopilotSetup {
  constructor(vscode){this.vscode=vscode;this.wasEnabledAtActivation=vscode.workspace.getConfiguration('inlineChat').get('notebookAgent')===true;this.requiresReload=!this.wasEnabledAtActivation;}
  ensure(){
    if(!this.pending)this.pending=this.prepare().finally(()=>{this.pending=undefined;});
    return this.pending;
  }
  async prepare(){
    const vscode=this.vscode,configuration=vscode.workspace.getConfiguration('inlineChat');
    const supported=configuration.inspect?.('notebookAgent');
    if(typeof supported?.defaultValue!=='boolean'){
      void vscode.window.showInformationMessage('Update VS Code and GitHub Copilot to use native notebook editing for Markdown. The older inline editor can drop Markdown content.');
      return false;
    }
    if(configuration.get('notebookAgent')===true){
      if(!this.requiresReload)return true;
      const action='Reload';
      const selected=await vscode.window.showInformationMessage('Native notebook editing was enabled after this window started. Reload this window before editing Markdown with Copilot so the older inline editor cannot drop content.',{modal:true},action);
      if(selected===action)await vscode.commands.executeCommand('workbench.action.reloadWindow');
      return false;
    }
    this.requiresReload=true;
    if(!vscode.workspace.workspaceFolders?.length){
      void vscode.window.showInformationMessage('Open a project folder before enabling native notebook editing for Markdown. This setting is enabled only for your workspace.');
      return false;
    }
    const action='Enable and Reload';
    const selected=await vscode.window.showInformationMessage('The older Copilot inline editor can drop Markdown text or diagrams. Enable VS Code’s experimental native notebook editing agent for this workspace and reload this window? Your global settings will not change.',{modal:true},action);
    if(selected!==action)return false;
    await configuration.update('notebookAgent',true,vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
    return false;
  }
}
module.exports={NotebookCopilotSetup};
