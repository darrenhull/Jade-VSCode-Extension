'use strict';
const path=require('node:path'),os=require('node:os');
const {SourceIndex}=require('./workspace-index');
const {SystemTypeCache}=require('./system-type-cache');
const {label}=require('./language-model');
const {isNestedSnapshot}=require('./source-snapshots');
const {registerFormatting}=require('./jade-formatter');

function registerLanguageTools(vscode,context){
  const selector=[{language:'jade-nz',scheme:'file',pattern:'**/*.{cls,jade}'},{language:'jade-nz',scheme:'untitled'}];
  registerFormatting(vscode,context,selector);
  const output=vscode.window.createOutputChannel('Jade Language Tools');let lastError,lastCache,lastProject;
  const supported=uri=>uri.scheme==='untitled'||/\.(cls|jade)$/i.test(uri.fsPath||'')||/[/\\]schemaDefinitions\.sec$/i.test(uri.fsPath||'');
  const accepted=uri=>supported(uri)&&!isNestedSnapshot(uri,vscode.workspace);
  const index=new SourceIndex({
    list:async()=> (await vscode.workspace.findFiles('**/{*.cls,*.jade,schemaDefinitions.sec}','**/{node_modules,.git}/**')).filter(accepted).map(uri=>uri.toString()),
    read:async uri=>Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.parse(uri))).toString('utf8')
  });
  const systemCache=new SystemTypeCache();
  function expanded(value,folder){return typeof value==='string'?value.replace(/\$\{env:([^}]+)\}/g,(_,name)=>process.env[name]||'').replaceAll('${workspaceFolder}',folder?.uri.fsPath||'').replaceAll('${userHome}',os.homedir()):value;}
  async function ready(document,token){
    if(token?.isCancellationRequested)return false;
    for(const open of vscode.workspace.textDocuments)if(accepted(open.uri)&&(open.uri.scheme==='untitled'||vscode.workspace.getWorkspaceFolder(open.uri)||open===document))index.document(open);
    if(document&&accepted(document.uri))index.document(document);
    await index.ready();await index.flush();if(token?.isCancellationRequested)return false;
    const resource=document?.uri||vscode.workspace.workspaceFolders?.[0]?.uri,folder=resource&&vscode.workspace.getWorkspaceFolder(resource),settings=vscode.workspace.getConfiguration('jadeNative',resource);
    const installPath=expanded(settings.get('installPath'),folder)||process.env.JADE_INSTALL;
    const directory=expanded(settings.get('cacheDirectory'),folder);
    const storagePath=directory?path.resolve(folder?.uri.fsPath||process.cwd(),directory):path.join(context.globalStorageUri.fsPath,'native');
    let cache;try{cache=await systemCache.get({installPath,storagePath,workspaceRoots:(vscode.workspace.workspaceFolders||[]).map(value=>value.uri.fsPath)});lastError=undefined;}
    catch(error){if(lastError!==error.message){output.appendLine('System type information unavailable: '+error.message+'. Workspace symbols remain available.');lastError=error.message;}}
    if(token?.isCancellationRequested)return false;
    if(index.project!==lastProject||cache!==lastCache){index.project.setSystemCache(cache);lastProject=index.project;lastCache=cache;}
    return true;
  }
  const model=document=>index.document(document);
  const documentation=symbol=>{const text=new vscode.MarkdownString();text.isTrusted=false;text.supportHtml=false;
    if(symbol.owner)text.appendText(`Declared in ${symbol.schema||''}${symbol.schema?'::':''}${symbol.owner}.`);
    if(symbol.documentation)text.appendText('\n\n'+symbol.documentation);return text;
  };
  const kinds={class:vscode.CompletionItemKind.Class,property:vscode.CompletionItemKind.Property,method:vscode.CompletionItemKind.Method,variable:vscode.CompletionItemKind.Variable,keyword:vscode.CompletionItemKind.Keyword};
  context.subscriptions.push(output,index,
    vscode.languages.registerCompletionItemProvider(selector,{
      async provideCompletionItems(document,position,token){if(!await ready(document,token))return;
        const current=model(document),offset=document.offsetAt(position),result=index.project.complete(current,offset);let end=offset;
        while(/[A-Za-z_0-9]/.test(current.code[end]||'')&&end<current.code.length)end++;
        const items=result.items.map(symbol=>{const item=new vscode.CompletionItem(symbol.name,kinds[symbol.kind]);item.insertText=symbol.name;item.filterText=symbol.name;
          item.range=new vscode.Range(document.positionAt(result.start??offset),document.positionAt(end));item.detail=(symbol.owner?symbol.owner+'.':'')+label(symbol);item.documentation=documentation(symbol);
          item.sortText=({variable:'0',property:'1',method:'2',class:'3',keyword:'4'}[symbol.kind]||'5')+symbol.name.toLowerCase();
          if(symbol.kind==='method')item.commitCharacters=['('];else if(['class','variable','property'].includes(symbol.kind))item.commitCharacters=['.'];return item;});
        return new vscode.CompletionList(items,result.isIncomplete);
      }
    },'.'),
    vscode.languages.registerHoverProvider(selector,{
      async provideHover(document,position,token){if(!await ready(document,token))return;const found=index.project.hover(model(document),document.offsetAt(position));if(!found)return;
        const content=new vscode.MarkdownString();content.isTrusted=false;content.supportHtml=false;content.appendCodeblock(found.label,'jade-nz');if(found.owner)content.appendText(`\nDeclared in ${found.schema}::${found.owner}.`);if(found.documentation)content.appendText('\n\n'+found.documentation);
        return new vscode.Hover(content,new vscode.Range(document.positionAt(found.range.start),document.positionAt(found.range.end)));
      }
    }),
    vscode.languages.registerSignatureHelpProvider(selector,{
      async provideSignatureHelp(document,position,token){if(!await ready(document,token))return;const found=index.project.signatureHelp(model(document),document.offsetAt(position));if(!found)return;
        const info=new vscode.SignatureInformation(found.label,documentation(found));info.parameters=found.parameters.map(parameter=>new vscode.ParameterInformation(parameter.label));
        const help=new vscode.SignatureHelp();help.signatures=[info];help.activeSignature=0;help.activeParameter=found.activeParameter;return help;
      }
    },{triggerCharacters:['(',','],retriggerCharacters:[',',')']}),
    vscode.workspace.onDidOpenTextDocument(document=>{if(accepted(document.uri))index.document(document);}),
    vscode.workspace.onDidChangeTextDocument(event=>{if(accepted(event.document.uri))index.document(event.document);}),
    vscode.workspace.onDidCloseTextDocument(document=>{const uri=document.uri.toString();if(document.uri.scheme==='untitled')index.remove(uri);else if(accepted(document.uri)){index.close(uri);index.schedule(uri);}}),
    vscode.workspace.onDidChangeWorkspaceFolders(()=>index.invalidate()),
    vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('jadeNative')){lastCache=undefined;lastProject=undefined;}})
  );
  const watcher=vscode.workspace.createFileSystemWatcher('**/*.{cls,jade,sec}');
  context.subscriptions.push(watcher,watcher.onDidCreate(uri=>{if(accepted(uri))index.schedule(uri.toString());}),watcher.onDidChange(uri=>{if(accepted(uri))index.schedule(uri.toString());}),watcher.onDidDelete(uri=>{if(accepted(uri))index.remove(uri.toString());}));
  return {index,model,ready};
}
module.exports={registerLanguageTools};
