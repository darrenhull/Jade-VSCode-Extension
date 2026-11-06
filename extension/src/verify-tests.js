'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {startExtract,resolveExtractConfig}=require('./extract');
const {testCatalog,compareTests}=require('./test-catalog');
function registerVerifyTests(vscode,context,options){
 context.subscriptions.push(vscode.commands.registerCommand('jadeNative.verifyPulledTests',async(selection={})=>{
  let temporary,locked=false;const output=options.output;
  try{
   await options.beforeOperation?.();
   if(options.isBusy())throw Error('A Jade operation is already running.');
   const uri=vscode.window.activeTextEditor?.document.uri,folder=uri&&vscode.workspace.getWorkspaceFolder(uri)||vscode.workspace.workspaceFolders?.[0];if(!folder)throw Error('Open the pulled source workspace.');
   await options.setBusy(true);locked=true;
   const config=resolveExtractConfig(options.settings(folder));temporary=fs.mkdtempSync(path.join(os.tmpdir(),'jade-test-verification-'));
   output.clear();output.show(true);output.appendLine('Comparing test source from '+config.databasePath+' with Test Explorer ...');
   const result=await startExtract(config,path.join(temporary,'native'),text=>output.append(text)).completion;if(!result.success)throw Error('Native extraction failed (exit '+result.code+').');
   const manifest=JSON.parse(fs.readFileSync(path.join(result.destination,'extract-manifest.json'),'utf8'));
   let expected=testCatalog(manifest.files.filter(f=>/\.cls$/i.test(f.path)).map(f=>path.join(result.destination,f.path)));
   await options.testing.discover(true);let actual=options.testing.summary().entries;
   if(selection.schemas?.length){const schemas=new Set(selection.schemas);expected=expected.filter(e=>schemas.has(e.schema));actual=actual.filter(e=>schemas.has(e.key.split('::')[0]));output.appendLine('Verification scope: '+selection.schemas.join(', '));}
   const report={database:config.databasePath,...compareTests(expected,actual)};
   output.appendLine('Native extraction: '+report.expected+' test(s); Test Explorer: '+report.discovered+' test(s); missing: '+report.missing.length+'.');
   for(const entry of report.missing)output.appendLine('MISSING: '+entry.key);
   if(!report.expected)output.appendLine('The configured database contains no extracted test source. This does not verify tests pulled from a different database.');
   else if(report.verified)void vscode.window.showInformationMessage('All '+report.expected+' database-extracted tests are present in Test Explorer.');
   else void vscode.window.showWarningMessage(report.missing.length+' pulled test(s) are missing. See Jade Tests output.');
   return report;
  }catch(error){output.appendLine('Test verification failed: '+error.message);output.show(true);void vscode.window.showErrorMessage(error.message);return {verified:false,error:error.message};}
  finally{if(temporary&&path.dirname(path.resolve(temporary))===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('jade-test-verification-'))fs.rmSync(temporary,{recursive:true,force:true});if(locked)await options.setBusy(false);}
 }));
}
module.exports={registerVerifyTests};
