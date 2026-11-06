'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {scaffoldSchema}=require('../extension/src/native-project');
const {prepareWorkingDatabase,runNativeTests}=require('../extension/src/working-database');
const {registerProjectTools}=require('../extension/src/project-tools');
test('workspace publish creates a schema in another isolated target and reviews/applies a class deletion',{skip:process.env.JADE_CONNECTED_TESTS!=='1',timeout:240000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-publish-project-')),source=path.join(root,'source'),storage=path.join(root,'storage'),output=[];fs.mkdirSync(source);
 const seed={installPath:'C:/Jade2025',databasePath:'C:/Jade2025/system',iniPath:'C:/Jade2025/system/jade.ini',workspaceRoots:[source],storagePath:path.join(root,'target-storage'),timeoutMilliseconds:90000};
 const target=await prepareWorkingDatabase(seed,text=>output.push(text)),name='Publish'+Date.now(),created=await scaffoldSchema(source,name,'RootSchema','25.0.02');
 const cls=(owner,parent,signature,body)=>`jadeVersionNumber "25.0.02";\nschemaDefinition\n${name} subschemaOf RootSchema partialDefinition;\ntypeHeaders\n${owner} subclassOf ${parent} transient, transientAllowed, subclassTransientAllowed;\ntypeDefinitions\n${owner} completeDefinition\n(\njadeMethodDefinitions\n${signature}\n)\ntypeSources\n${owner} (\njadeMethodSources\n${body}\n)\n`;
 const widget=path.join(created.folder,'types/Widget.cls'),tests=path.join(created.folder,'types/PublishTests.cls');fs.writeFileSync(widget,cls('Widget','Object','',''));fs.writeFileSync(tests,cls('PublishTests','JadeTestCase','check() unitTest;','check\n{\ncheck() unitTest;\nbegin\nassertEquals(2,1+1);\nend;\n}'));
 const commands=new Map(),saved=new Map(),reviews=[],folder={uri:{fsPath:source}},config={...seed,databasePath:target.databasePath,iniPath:target.iniPath,storagePath:storage};let busy=false;
 const context={subscriptions:[],workspaceState:{get:(key,fallback)=>saved.has(key)?saved.get(key):fallback,update:async(key,value)=>saved.set(key,value)}};
 const api={commands:{registerCommand:(name,handler)=>{commands.set(name,handler);return {dispose(){}};}},workspace:{workspaceFolders:[folder],textDocuments:[],openTextDocument:async file=>({uri:{fsPath:file},getText:()=>fs.readFileSync(file,'utf8')})},window:{showInformationMessage:()=>{},showErrorMessage:message=>{throw Error(message);},showWarningMessage:async(_,details)=>{reviews.push(details.detail);return 'Update Jade Base';}}};
 const tools=registerProjectTools(api,context,{config:doc=>({...config,program:doc.uri.fsPath}),isBusy:()=>busy,setBusy:async value=>{busy=value;},settings:()=>seed,output:{clear(){},show(){},append:text=>output.push(text),appendLine:text=>output.push(text+'\n')}});
 try{
  const first=await tools.publish(true);assert.equal(first.success,true,JSON.stringify(first));assert.ok(reviews[0].includes('CREATE schema/resources '+name));
  const tested=await runNativeTests(target,{schema:name,owner:'PublishTests',source:tests,text:fs.readFileSync(tests,'utf8')},text=>output.push(text));assert.equal(tested.success,true,JSON.stringify(tested));
  fs.unlinkSync(widget);const deleted=await tools.publish(true);assert.equal(deleted.success,true,JSON.stringify(deleted));assert.ok(reviews[1].includes('DELETE class/override '+name+'::Widget'));
  assert.equal(busy,false);
 }finally{fs.writeFileSync(path.join(__dirname,'../evidence/publish-native-output.txt'),output.join(''));fs.writeFileSync(path.join(__dirname,'../evidence/publish-native-location.json'),JSON.stringify({root,name,target},null,2));}
});
