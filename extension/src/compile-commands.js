'use strict';
const path=require('node:path');
const {resolveJadeSource}=require('./active-jade-source');
function registerCompileCommands(vscode,context,services){
 async function compile(projectBuild,uri){
  const output=services.output;
  let document;
  try{document=await (services.resolveSource?services.resolveSource(uri):resolveJadeSource(vscode,uri));}
  catch(error){output.appendLine(`Compile check failed: ${error.message}`);output.show(true);void vscode.window.showErrorMessage(error.message);return {passed:false,error:error.message};}
  await services.beforeOperation();
  if(services.isBusy()){void vscode.window.showErrorMessage('A Jade compile or publish is already running.');return;}
  await services.setBusy(true);
  try{
   if(!document||document.uri.scheme!=='file'||!/\.(cls|scm|sec|ddx|jcf)$/i.test(document.uri.fsPath))throw Error('Open a native Jade source file to compile.');
   if(projectBuild&&!vscode.workspace.getWorkspaceFolder(document.uri))throw Error('Open a workspace folder to build its new and changed Jade sources.');
   const config=services.classConfig(document);config.projectBuild=projectBuild;
   output.clear();output.show(true);
   output.appendLine(projectBuild?`Building new and changed Jade sources in ${config.workspaceRoots[0]} (Working; no publish) ...`:`Checking class methods in ${path.basename(config.program)} (no publish) ...`);
   await services.workingFiles(config);
   for(const file of config.files)services.diagnostics.delete(vscode.Uri.file(file));
   const operation=services.startWorking({...config,testSession:services.nativeTests,beforeNativeProcess:()=>services.nativeTests.release()},'compile',text=>output.append(text),services.reportDiagnostic);
   const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Compiling in native Jade working database',cancellable:true},async(_,token)=>{
    const subscription=token.onCancellationRequested(()=>operation.stop());if(token.isCancellationRequested)operation.stop();
    try{return await operation.completion;}finally{subscription.dispose();}
   });
   if(result.report?.error)output.appendLine(result.report.error);
   for(const error of result.report?.diagnostics||[]){output.appendLine(`Jade ${error.compiler_error} (${error.owner}::${error.method}): ${error.message}`);output.appendLine(`${error.source}:${error.line}:${error.column}`);}
   if(result.passed)output.appendLine(result.report.native_project?`Native project compile complete; synchronised ${result.report.loaded_files} source/resource file(s).`:`Native compile complete; synchronised ${result.report.loaded_files} changed CLS file(s).`);
   output.appendLine(`CompilerExitCode=${result.code}`);return result;
  }catch(error){output.appendLine(`Compile check failed: ${error.message}`);output.show(true);void vscode.window.showErrorMessage(error.message);return {passed:false,error:error.message};}
  finally{await services.setBusy(false);}
 }
 context.subscriptions.push(vscode.commands.registerCommand('jadeNative.buildWorkspace',uri=>compile(true,uri)),vscode.commands.registerCommand('jadeNative.compileClass',uri=>compile(false,uri)));
}
module.exports={registerCompileCommands};
