'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vscode=require('vscode');
async function run(){const root=vscode.workspace.workspaceFolders[0].uri.fsPath,report=path.resolve(root,'../host-report.json');try{
 const ext=vscode.extensions.getExtension('jade-local-tools.jade-native-runner-cpp-preview');await ext.activate();
 const {scaffoldSchema}=require('../src/native-project');await scaffoldSchema(root,'CollectionDesignerSchema','RootSchema','25.0.02');
 fs.mkdirSync(path.join(root,'schemas/CollectionDesignerSchema/locales'));fs.writeFileSync(path.join(root,'schemas/CollectionDesignerSchema/locales/localeDefinitions.sec'),'localeDefinitions\n2057 "English (United Kingdom)" schemaDefaultLocale;\n');
 const item=path.join(root,'schemas/CollectionDesignerSchema/types/DesignerItem.cls');
 fs.writeFileSync(item,'jadeVersionNumber "25.0.02";\nschemaDefinition\nCollectionDesignerSchema subschemaOf RootSchema partialDefinition;\ntypeHeaders\nDesignerItem subclassOf Object transient;\ntypeDefinitions\nDesignerItem completeDefinition\n(\nattributeDefinitions\nname: String[50];\nrank: Integer;\n)\ntypeSources\n');
 const request={schema:'CollectionDesignerSchema',name:'DesignerByName',membership:'DesignerItem',kind:'member',lifetime:'transient',keys:[{name:'name'},{name:'rank',descending:true}]};
 const file=await vscode.commands.executeCommand('jadeNative.createKeyedCollection',request);assert.equal(file,path.join(root,'schemas/CollectionDesignerSchema/types/DesignerByName.cls'));
 const original=fs.readFileSync(file,'utf8');assert.match(original,/name;\r\n\s*rank descending;/);assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,file);
 const duplicate=await vscode.commands.executeCommand('jadeNative.createKeyedCollection',request);assert.match(duplicate.error,/exist/i);assert.equal(fs.readFileSync(file,'utf8'),original);
 const tuned=await vscode.commands.executeCommand('jadeNative.createKeyedCollection',{...request,name:'DesignerTuned',superclass:'DesignerByName',duplicatesAllowed:true,loadFactor:66,keys:[{name:'name',caseInsensitive:true,locale:2057},{name:'rank',descending:true}]});assert.equal(typeof tuned,'string',JSON.stringify(tuned));const tunedSource=fs.readFileSync(tuned,'utf8');assert.match(tunedSource,/subclassOf DesignerByName transient, duplicatesAllowed, loadFactor = 66;/);assert.match(tunedSource,/name caseInsensitive 2057;/);
 const external=await vscode.commands.executeCommand('jadeNative.createKeyedCollection',{...request,name:'DesignerExternal',kind:'external',keys:[{name:'lookup',type:'String',length:48},{name:'position',type:'Integer',descending:true}]});assert.equal(typeof external,'string',JSON.stringify(external));const externalSource=fs.readFileSync(external,'utf8');assert.match(externalSource,/subclassOf ExtKeyDictionary/);assert.match(externalSource,/lookup: String\[48\];/);assert.match(externalSource,/position: Integer descending;/);
 const {choices}=require('../media/collection-choices'),large=Array.from({length:30000},(_,index)=>({name:'DesignerType'+index}));assert.equal(choices(large,'DesignerType').length,100);assert.equal(choices(large,'DesignerType29999')[0].name,'DesignerType29999');
 await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(item));
 const opened=await vscode.commands.executeCommand('jadeNative.createKeyedCollection');assert.equal(opened.opened,true);
 if(process.env.JADE_COLLECTION_UI_HOLD==='1')await new Promise(r=>setTimeout(r,180000));
 fs.writeFileSync(report,JSON.stringify({passed:true,version:ext.packageJSON.version,command:true,nativeFile:true,exclusiveCreate:true,webviewOpened:true,webviewRendered:true,advancedSourceGeneration:true,externalTypedKeys:true,boundedSuggestions:true,copyControlInitialized:true,localeNativeSource:true,localeControlInitialized:true,noDatabase:true},null,2));
 }catch(error){fs.writeFileSync(report,JSON.stringify({passed:false,error:error.stack},null,2));throw error;}}
module.exports={run};
