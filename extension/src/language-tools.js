'use strict';
const path=require('node:path'),os=require('node:os');
const {SourceIndex}=require('./workspace-index');
const {SourceIndexCache}=require('./SourceIndexCache');
const {SystemTypeCache}=require('./system-type-cache');
const {label}=require('./language-model');
const {isNestedSnapshot}=require('./source-snapshots');
const {isIndexableSourcePath}=require('./source-index-scope');
const {registerFormatting}=require('./jade-formatter');
const {parseSource}=require('./source_symbols');

function registerLanguageTools(vscode,context,services={}){
  const selector=[{language:'jade-nz',scheme:'file',pattern:'**/*.{cls,jade}'},{language:'jade-nz',scheme:'untitled'},{language:'jade-nz',scheme:'vscode-notebook-cell'}];
  registerFormatting(vscode,context,selector);
  const output=vscode.window.createOutputChannel('Jade Language Tools');let lastError,lastCache,lastProject;
  const supported=uri=>uri.scheme==='untitled'||isIndexableSourcePath(uri.fsPath);
  const accepted=uri=>supported(uri)&&!isNestedSnapshot(uri,vscode.workspace);
  const filterScan=uris=>{const markers=new Map();return uris.filter(uri=>supported(uri)&&!isNestedSnapshot(uri,vscode.workspace,markers));};
  const reportIndexError=error=>output.appendLine('Workspace index: '+error.message);
  let capabilityPromise;
  const nativeVersion=()=>capabilityPromise||=(async()=>{
    try{const capability=(await services.client?.sourceCapabilities({}))?.sourceIndex;if(capability?.format!==2||capability.databaseRequired!==false||typeof capability.nativeVersion!=='string'||!capability.nativeVersion||!Array.isArray(capability.commands)||!['source.index.refresh','source.index.prepare','source.index.browser.update'].every(command=>capability.commands.includes(command)))throw Error('Update the Jade CLI bundle: shared source index format 2 is unavailable.');return capability.nativeVersion;}
    catch(error){capabilityPromise=undefined;throw error;}
  })();
  const preparedReceipts=new Map(),preparedRoots=new Set(),preparingRoots=new Map();
  const rootKey=root=>{const value=path.resolve(root);return process.platform==='win32'?value.toLowerCase():value;};
  let sourceGeneration=0;
  function sourceConfig(root){
    const seconds=vscode.workspace.getConfiguration?.('jadeNative',vscode.Uri.file(root)).get('sourceIndexTimeoutSeconds',600)??600;
    if(!Number.isInteger(seconds)||seconds<1||seconds>7200)throw Error('Set jadeNative.sourceIndexTimeoutSeconds to an integer between 1 and 7200.');
    return{workspaceRoots:[root],timeoutMilliseconds:seconds*1000};
  }
  async function prepareSourceIndex(root,onProgress=()=>{}){
    const identity=rootKey(root),available=preparedReceipts.get(identity);preparedReceipts.delete(identity);if(available){preparedRoots.add(identity);return available;}
    if(preparingRoots.has(identity))return preparingRoots.get(identity);
    const generation=sourceGeneration,preparation=(async()=>{
      const version=await nativeVersion(),config=sourceConfig(root),write=text=>{output.appendLine(text.trimEnd());onProgress(text.trimEnd());};
      output.appendLine('Preparing saved Git source index: '+root+' (timeout '+config.timeoutMilliseconds/1000+'s).');
      let result=await services.client.request('source.index.prepare',{config},write).promise;
      // Only JADE's explicit cache-repair diagnosis permits a rebuild. Git,
      // transport, ownership and cancellation failures retain their cause.
      if(result?.passed===false&&result.code===2&&result.report?.error==='Refresh Workspace source cache using jade-cli source refresh or Initialise Workspace before preparing source inputs: cache is missing or incompatible.'){
        const message='Initialising the shared Git source index: '+root;output.appendLine(message);onProgress(message);
        result=await services.client.request('source.index.refresh',{config},write).promise;
      }
      if(result?.passed!==true||result.code!==0)throw Error(result?.report?.error||'Native Git source preparation failed. Run Initialise Workspace.');
      const descriptor=result.cache;
      if(descriptor?.format!==2||descriptor.nativeVersion!==version||!descriptor.roots?.some(value=>typeof value.root==='string'&&rootKey(value.root)===identity))throw Error('Native source index returned an incompatible workspace binding. Update the Jade CLI bundle.');
      if(generation!==sourceGeneration)throw Error('Workspace changed during source index preparation; retry the operation.');
      preparedRoots.add(identity);return descriptor;
    })();
    preparingRoots.set(identity,preparation);
    try{return await preparation;}finally{if(preparingRoots.get(identity)===preparation)preparingRoots.delete(identity);}
  }
  async function ensureSourceIndex(config,onProgress){
    for(const root of config.workspaceRoots||[])if(!preparedRoots.has(rootKey(root)))await prepareSourceIndex(root,onProgress);
  }
  const cache=new SourceIndexCache({roots:()=> (vscode.workspace.workspaceFolders||[]).filter(folder=>folder.uri.scheme==='file').map(folder=>folder.uri.fsPath),nativeVersion,prepare:prepareSourceIndex,request:(...args)=>services.client.request(...args),onError:reportIndexError});
  const index=new SourceIndex({
    list:async()=>filterScan((await cache.savedUris()).map(uri=>vscode.Uri.parse(uri))).map(uri=>uri.toString()),
    proof:uri=>cache.proof(uri),
    read:async uri=>vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
    stat:async uri=>{const value=await vscode.workspace.fs.stat(vscode.Uri.parse(uri));return {mtime:value.mtime,size:value.size};},
    cache,filterCached:entries=>{const markers=new Map();return entries.filter(entry=>{const uri=vscode.Uri.parse(entry.uri);return supported(uri)&&!isNestedSnapshot(uri,vscode.workspace,markers);});},onError:reportIndexError,onTiming:timing=>{if(timing.totalMs>=1000)output.appendLine('Slow workspace source: '+JSON.stringify(timing));}
  });
  async function refreshSourceIndex(folder){
    const version=await nativeVersion(),folders=folder?[folder]:(vscode.workspace.workspaceFolders||[]).filter(value=>value.uri.scheme==='file');
    await index.persist();
    for(const selected of folders){const root=selected.uri.fsPath;preparedRoots.delete(rootKey(root));preparedReceipts.delete(rootKey(root));if(!(vscode.workspace.workspaceFolders||[]).some(value=>path.resolve(value.uri.fsPath).toLowerCase()===path.resolve(root).toLowerCase()))throw Error('Workspace changed before source index refresh.');const config=sourceConfig(root);output.appendLine('Refreshing Git source index: '+root+' (timeout '+config.timeoutMilliseconds/1000+'s).');
      const result=await services.client.request('source.index.refresh',{config},text=>output.appendLine(text.trimEnd())).promise;
      if(result?.passed!==true||result.code!==0){const message=result?.report?.error||'Native source index refresh failed. Run Initialise Workspace.';output.appendLine('Source index refresh incomplete; existing browser data was retained. '+message);throw Error(message);}
      if(result.cache?.format!==2||result.cache.nativeVersion!==version||!result.cache.roots?.some(value=>path.resolve(value.root).toLowerCase()===path.resolve(root).toLowerCase()))throw Error('Native source index refresh returned an incompatible workspace binding. Update the Jade CLI bundle.');
      preparedReceipts.set(rootKey(root),result.cache);preparedRoots.add(rootKey(root));
    }
    await index.reloadSavedCache();output.appendLine('Shared source index refreshed.');return{passed:true};
  }
  context.subscriptions.push(index);
  let bulkMarkers;
  const acceptedDisk=uri=>{
    if(!index.bulkUpdating){bulkMarkers=undefined;return accepted(uri);}
    if(bulkMarkers?.generation!==index.bulkGeneration)bulkMarkers={generation:index.bulkGeneration,values:new Map()};
    return supported(uri)&&!isNestedSnapshot(uri,vscode.workspace,bulkMarkers.values);
  };
  if(vscode.workspace.onDidCreateFiles)context.subscriptions.push(vscode.workspace.onDidCreateFiles(event=>{const markers=new Map();for(const uri of event.files)if(supported(uri)&&vscode.workspace.getWorkspaceFolder(uri)&&!isNestedSnapshot(uri,vscode.workspace,markers))index.schedule(uri.toString());}));
  if(vscode.workspace.onDidDeleteFiles)context.subscriptions.push(vscode.workspace.onDidDeleteFiles(event=>{for(const uri of event.files){const prefix=uri.toString().replace(/\/$/,'');for(const known of [...index.records.keys()])if(known===prefix||known.startsWith(prefix+'/'))index.removeSaved(known);}}));
  if(vscode.workspace.onDidRenameFiles)context.subscriptions.push(vscode.workspace.onDidRenameFiles(event=>{
    const markers=new Map();for(const {oldUri,newUri} of event.files){const from=oldUri.toString().replace(/\/$/,''),to=newUri.toString().replace(/\/$/,''),known=[...index.records.keys()].filter(uri=>uri===from||uri.startsWith(from+'/'));
      if(!known.length&&supported(oldUri))known.push(from);
      for(const uri of known){const target=to+uri.slice(from.length),newSource=vscode.Uri.parse(target);if(vscode.workspace.getWorkspaceFolder(newSource)&&supported(newSource)&&!isNestedSnapshot(newSource,vscode.workspace,markers))index.rename(uri,target);else index.remove(uri);}
    }
  }));
  const systemCache=new SystemTypeCache();
  function expanded(value,folder){return typeof value==='string'?value.replace(/\$\{env:([^}]+)\}/g,(_,name)=>process.env[name]||'').replaceAll('${workspaceFolder}',folder?.uri.fsPath||'').replaceAll('${userHome}',os.homedir()):value;}
  async function ready(document,token){
    if(token?.isCancellationRequested)return false;
    for(const open of vscode.workspace.textDocuments)if(accepted(open.uri)&&(open.uri.scheme==='untitled'||vscode.workspace.getWorkspaceFolder(open.uri)||open===document))index.document(open);
    if(document&&accepted(document.uri))index.document(document);
    await index.ready();await index.flush();if(token?.isCancellationRequested)return false;
    const resource=(document&&workspaceResource(document.uri))||document?.uri||vscode.workspace.workspaceFolders?.[0]?.uri,folder=resource&&vscode.workspace.getWorkspaceFolder(resource),settings=vscode.workspace.getConfiguration('jadeNative',resource);
    const installPath=expanded(settings.get('installPath'),folder)||process.env.JADE_INSTALL;
    const directory=expanded(settings.get('cacheDirectory'),folder);
    const storagePath=directory?path.resolve(folder?.uri.fsPath||process.cwd(),directory):path.join(context.globalStorageUri.fsPath,'native');
    let cache;try{cache=await systemCache.get({installPath,storagePath,workspaceRoots:(vscode.workspace.workspaceFolders||[]).map(value=>value.uri.fsPath)});lastError=undefined;}
    catch(error){if(lastError!==error.message){output.appendLine('System type information unavailable: '+error.message+'. Workspace symbols remain available.');lastError=error.message;}}
    if(token?.isCancellationRequested)return false;
    if(index.project!==lastProject||cache!==lastCache){index.project.setSystemCache(cache);lastProject=index.project;lastCache=cache;}
    return true;
  }
  let workspaceSchema=()=>undefined,workspaceResource=uri=>uri;
  const model=document=>{
    if(document.uri.scheme==='vscode-notebook-cell'||/\.jade$/i.test(document.uri.fsPath||'')) {
      const source=parseSource(document.getText(),document.uri.toString());
      if(document.uri.scheme==='vscode-notebook-cell'||/^\s*(?:vars|constants|begin)\b/.test(source.code))return {...source,workspace:true,schema:workspaceSchema(document.uri)||vscode.workspace.getConfiguration('jadeNative',document.uri).get('schema')||'RootSchema'};
    }
    return index.document(document);
  };
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
    vscode.workspace.onDidChangeWorkspaceFolders(()=>{sourceGeneration++;preparedReceipts.clear();preparedRoots.clear();index.invalidate();}),
    vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('jadeNative')){lastCache=undefined;lastProject=undefined;sourceGeneration++;preparedReceipts.clear();preparedRoots.clear();}})
  );
  const watcher=vscode.workspace.createFileSystemWatcher('**/*.{cls,jade,sec}');
  context.subscriptions.push(watcher,watcher.onDidCreate(uri=>{if(acceptedDisk(uri))index.schedule(uri.toString());}),watcher.onDidChange(uri=>{if(acceptedDisk(uri))index.schedule(uri.toString());}),watcher.onDidDelete(uri=>{if(acceptedDisk(uri))index.removeSaved(uri.toString());}));
  return {index,model,ready,refreshSourceIndex,ensureSourceIndex,setWorkspaceSchemaResolver:resolver=>{workspaceSchema=resolver;},setWorkspaceResourceResolver:resolver=>{workspaceResource=resolver;}};
}
module.exports={registerLanguageTools};
