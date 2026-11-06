'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
async function renderedCatalogue(catalogue){
 const started=Date.now();
 while(Date.now()-started<20000){const snapshot=catalogue.snapshot();if(snapshot&&catalogue.renderedRevision===snapshot.revision)return snapshot;await new Promise(resolve=>setTimeout(resolve,30));}
 throw Error('Database class catalogue webview did not acknowledge its actual DOM render.');
}
function countInstanceRequests(client){
 const original=client.request.bind(client);let instances=0;
 client.request=(command,args)=>{if(command==='instances')instances++;return original(command,args);};
 return ()=>instances;
}
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');let api;
 try{
  assert.ok(process.env.JADE_TEST_SEED,'Set JADE_TEST_SEED to the private test database.');assert.ok(process.env.JADE_TEST_INI,'Set JADE_TEST_INI to its INI.');assert.ok(process.env.JADE_INSPECT_FIXTURE,'Set JADE_INSPECT_FIXTURE to native inspector evidence JSON.');
  const seed=path.resolve(process.env.JADE_TEST_SEED);assert.notEqual(seed.toLowerCase(),path.resolve('C:/Jade2025/system').toLowerCase(),'Never inspect the user source database in tests.');
  const fixture=JSON.parse(fs.readFileSync(process.env.JADE_INSPECT_FIXTURE,'utf8')),schema=fixture.item?.schema||fixture.schema,className=fixture.item?.className||fixture.className,objectOid=fixture.item?.oid||fixture.objectOid;
  assert.ok(schema&&className&&objectOid,'Native fixture evidence must contain a concrete object identity.');
  const file=path.join(root,className+'.cls');fs.writeFileSync(file,`jadeVersionNumber "25.0.02";\nschemaDefinition\n${schema} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${className} subclassOf Object;\ntypeDefinitions\n${className} completeDefinition\n(\nattributeDefinitions\nname: String[50];\n)\ntypeSources\n`);
  const ext=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');api=await ext.activate();assert.ok(api.objectExplorer);
  const settings=vscode.workspace.getConfiguration('jadeNative',vscode.workspace.workspaceFolders[0].uri),install=process.env.JADE_TEST_INSTALL||'C:/Jade2025',workingDirectory=path.resolve(root,'../inspection-working');
  for(const [name,value] of Object.entries({installPath:install,databasePath:seed,iniPath:process.env.JADE_TEST_INI,server:'singleUser',workingDatabaseDirectory:workingDirectory}))await settings.update(name,value,vscode.ConfigurationTarget.WorkspaceFolder);
  const doc=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(doc);
  const explorer=api.objectExplorer;await explorer.session.select('source');const source=await vscode.commands.executeCommand('jadeNative.connectObjects');assert.equal(source.readOnly,true);assert.equal(source.selection,'source');assert.equal(path.resolve(source.databasePath).toLowerCase(),seed.toLowerCase());
  const ready=await explorer.session.client.ready;assert.equal(ready.readOnly??ready.body?.readOnly,true);const security=ready.security||ready.body?.security;assert.equal(typeof security?.production,'boolean');assert.equal(typeof security?.developmentLibrary,'boolean');assert.equal(typeof security?.developmentLicences,'number');
  const catalog=await explorer.session.request('catalog'),target=catalog.schemas.find(s=>s.name===schema)?.classes.find(c=>c.name===className);assert.ok(target,'Native Source database catalog contains fixture class.');
  const sourceInstanceRequests=countInstanceRequests(explorer.session.client);
  const sourceGridOpen=await vscode.commands.executeCommand('jadeNative.browseDatabaseClasses');assert.equal(sourceGridOpen.shown,true);
  const classCatalogue=explorer.classCatalogue;assert.ok(classCatalogue,'Database class catalogue is exposed.');
  const sourceGrid=await renderedCatalogue(classCatalogue);assert.ok(sourceGrid.page.items.length<=100);assert.match(sourceGrid.label,/Source database.*Read-only/);assert.ok(sourceGrid.label.includes(source.databasePath));
  await classCatalogue.setFilter({schema,query:schema+'::'+className});const sourceFiltered=await renderedCatalogue(classCatalogue),sourceClass=sourceFiltered.page.items.find(row=>row.schema===schema&&row.name===className);assert.ok(sourceClass,'Live query resolves a schema-qualified database class.');
  assert.ok(sourceFiltered.suggestions.length<=10);const sourceClassOpened=await classCatalogue.open(sourceClass.browserId);assert.equal(sourceClassOpened.name,className);assert.equal(sourceInstanceRequests(),0,'Opening a catalogue class only reveals its collapsed tree node, without loading instances.');
  const sourceSchema=(await explorer.provider.getChildren()).find(row=>row.kind==='schema'&&row.name===schema);const sourceTreePage=await explorer.provider.getChildren(sourceSchema);assert.ok(sourceTreePage.filter(row=>row.kind==='class').length<=100);assert.ok(sourceTreePage.some(row=>row.kind==='class'&&row.name===className));
  await vscode.commands.executeCommand('jadeNative.toggleSystemObjects');assert.ok((await explorer.provider.getChildren()).some(row=>row.name==='RootSchema'),'System schema toggle requests native catalog entries.');await vscode.commands.executeCommand('jadeNative.toggleSystemObjects');assert.equal((await explorer.provider.getChildren()).some(row=>row.name==='RootSchema'),false);
  const opened=await vscode.commands.executeCommand('jadeNative.inspectObject',objectOid);assert.equal(opened.readOnly,true);assert.equal(opened.oid,objectOid,'Object panel waits for real webview JavaScript rendering.');assert.equal(explorer.session.history.length,1);
  const previousClipboard=await vscode.env.clipboard.readText();try{assert.equal(await vscode.commands.executeCommand('jadeNative.copyObjectOid',{oid:objectOid}),objectOid);assert.equal(await vscode.env.clipboard.readText(),objectOid);}finally{await vscode.env.clipboard.writeText(previousClipboard);}
  const sourceJump=await vscode.commands.executeCommand('jadeNative.openObjectClassSource',{className,schema});assert.equal(sourceJump.opened,true,'Class source action opens the actual matching workspace CLS.');assert.equal(path.resolve(typeof sourceJump.uri==='string'?vscode.Uri.parse(sourceJump.uri).fsPath:sourceJump.uri.fsPath),path.resolve(file));
  await explorer.session.select('working');assert.equal(explorer.session.history.length,0);assert.equal(explorer.ownsLock(),false,'Native Source process is closed before copying seed.');
  assert.equal(classCatalogue.snapshot().page.items.length,0,'Switching target immediately clears old catalogue rows.');await assert.rejects(classCatalogue.open(sourceClass.browserId),/refresh|identity|changed/i,'A stale Source class cannot open after a target switch.');
  const {prepareWorkingDatabase}=require('../src/working-database');await prepareWorkingDatabase({installPath:install,databasePath:seed,iniPath:process.env.JADE_TEST_INI,workingDatabaseDirectory:workingDirectory,storagePath:path.resolve(root,'../inspection-storage'),workspaceRoots:[root],workingDatabaseGeneration:'initial',timeoutMilliseconds:120000});
  const working=await vscode.commands.executeCommand('jadeNative.connectObjects');assert.equal(working.readOnly,true,JSON.stringify(working));assert.equal(working.selection,'working');assert.equal(path.resolve(working.databasePath),path.join(workingDirectory,'system'));assert.notEqual(working.databasePath,source.databasePath);
  const workingInstanceRequests=countInstanceRequests(explorer.session.client);
  const workingGridOpen=await vscode.commands.executeCommand('jadeNative.browseDatabaseClasses');assert.equal(workingGridOpen.reused,true,'The catalogue keeps one persistent tab while its target context changes.');
  const workingGrid=await renderedCatalogue(classCatalogue);assert.match(workingGrid.label,/Working database.*Read-only/);assert.ok(workingGrid.label.includes(working.databasePath));assert.notEqual(workingGrid.scope,sourceGrid.scope);
  await classCatalogue.setFilter({schema,query:schema+'::'+className});const workingFiltered=await renderedCatalogue(classCatalogue),workingClass=workingFiltered.page.items.find(row=>row.name===className&&row.schema===schema);assert.ok(workingClass);assert.notEqual(workingClass.browserId,sourceClass.browserId);await assert.rejects(classCatalogue.open(sourceClass.browserId),/identity/i);
  assert.equal((await classCatalogue.open(workingClass.browserId)).name,className);assert.equal(workingInstanceRequests(),0,'Working catalogue opening also leaves instance retrieval lazy.');
  const workingObject=await explorer.session.request('object',{oid:objectOid});assert.equal(workingObject.className,className);
  const collectionOid=workingObject.properties.find(p=>p.name==='children')?.oid||fixture.collectionOid;assert.ok(collectionOid,'Fixture has a real collection reference.');
  const collection=await vscode.commands.executeCommand('jadeNative.inspectObject',collectionOid);assert.equal(collection.readOnly,true,JSON.stringify(collection));
  const entries=await explorer.session.request('collection',{oid:collectionOid,limit:2});assert.ok(entries.items.length>0);assert.ok(entries.items.some(item=>item.key!==undefined),'Grid receives native dictionary keys.');if(entries.cursor){const next=await explorer.session.request('collection',{oid:collectionOid,cursor:entries.cursor,limit:2});assert.ok(next.items.length>0,'Native collection cursor advances to the next bounded page.');assert.ok(next.items.every(item=>!entries.items.some(prior=>prior.index===item.index)),'Native page positions do not repeat.');if(next.cursor)await explorer.session.request('release',{cursor:next.cursor});}
  if(process.env.JADE_OBJECT_UI_HOLD==='1'){await vscode.commands.executeCommand('jadeNative.objects.focus');await new Promise(resolve=>setTimeout(resolve,180000));}
  await explorer.releaseForOperation();assert.equal(explorer.ownsLock(),false);
  fs.writeFileSync(report,JSON.stringify({passed:true,version:ext.packageJSON.version,sourceReadOnly:true,workingReadOnly:true,workingSourceSwitch:true,historyReset:true,objectPanelRendered:true,collectionGridRendered:true,nativeKeys:true,copyOid:true,classSourceNavigation:true,sourceClassCatalogueRendered:true,workingClassCatalogueRendered:true,cataloguePageBound:100,catalogueSuggestionsBound:10,fullCatalogueQualifiedSearch:true,catalogueInstanceLoadingLazy:true,staleCatalogueIdentityRejected:true,catalogueTargetLabelAndPath:true,nativeSecurity:security,helperSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(ext.extensionPath,'native/jade-inspect-helper.exe'))).digest('hex'),sourcePath:source.databasePath,workingPath:working.databasePath,fixtureClass:schema+'::'+className},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}
 finally{await api?.objectExplorer?.releaseForOperation();}
}
module.exports={run};
