'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {registerProjectTools}=require('../../extension/src/project-tools'),gateway=require('../../extension/src/cli-gateway');
const {minimalSchema}=require('../../extension/src/native-project');
function fixture(t,change=()=>{}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-full-publish-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const workspace=path.join(root,'workspace'),folder={uri:{scheme:'file',fsPath:workspace}},types=path.join(workspace,'schemas/Pets/types');fs.mkdirSync(types,{recursive:true});
 const header=path.join(workspace,'schemas/Pets.scm'),source=path.join(types,'Cat.cls');
 const cls='jadeVersionNumber "25.0.02";\nschemaDefinition\nPets subschemaOf RootSchema partialDefinition;\ntypeHeaders\n Cat subclassOf Object transient;\ntypeDefinitions\n Cat completeDefinition\n (\n )\ndatabaseDefinitions\ntypeSources\n';
 fs.writeFileSync(header,minimalSchema('Pets','RootSchema','25.0.02'));fs.writeFileSync(source,cls);
 fs.writeFileSync(path.join(workspace,'schemas/Pets/schemaResources.ddx'),'<schema name="Pets" CompleteDefinition="false"><Form locale="5129" name="Screen"><caption>Native form</caption></Form></schema>');
 fs.writeFileSync(path.join(workspace,'schemas/Pets/_exposedListDefinitions.sec'),'_exposedListDefinitions\n');
 const calls=[],documents=[],commands=new Map();let busy=false;
 const config={installPath:root,databasePath:path.join(root,'target-system'),iniPath:path.join(root,'target.ini'),storagePath:path.join(root,'storage'),schema:'Pets',workspaceRoots:[workspace]},working={...config,root:path.join(root,'working'),databasePath:path.join(root,'working/system')};
 gateway.configure({runNative:async(executable,args)=>{
  calls.push({kind:'native',args});assert.ok(!args.includes('app=JadeBatchExtract'),'Full publication must not fall back to Every + organisation');
  if(args.includes('app=JadeJoinSchema')){const last=args.indexOf('endAppParameters');fs.writeFileSync(args[last-1],fs.readFileSync(source));}
  return {success:true,code:0,output:''};
 }});t.after(()=>gateway.configure(undefined));
 const service={sourceCapabilities:async()=>({sourceExtraction:{protocol:1,fullSchema:true,available:true,layout:'schema-ddx',requiresPromotionPermit:true,scopes:['all'],versions:['current']}}),startSourceExtraction:(_config,selection,callbacks)=>{
  calls.push({kind:'snapshot',selection,configuration:_config});fs.cpSync(path.join(workspace,'schemas'),path.join(selection.destination,'schemas'),{recursive:true});callbacks.onStage?.({stage:'inventory',completedFiles:0,totalFiles:4});return {completion:Promise.resolve({passed:true,authoritative:true,completedFiles:4}),stop(){}};
 }};
 const vscode={workspace:{workspaceFolders:[folder],textDocuments:documents,openTextDocument:async file=>({uri:{scheme:'file',fsPath:file}})},commands:{registerCommand:(name,handler)=>(commands.set(name,handler),{dispose(){}})},window:{showErrorMessage:async()=>{},showInformationMessage:async()=>{},showWarningMessage:async()=>{await change({root,workspace,source,types,documents,calls});return 'Update Jade Base';}}};
 registerProjectTools(vscode,{subscriptions:[],workspaceState:{get:(_key,fallback)=>fallback,update:async()=>{}}},{service,config:()=>config,isBusy:()=>busy,setBusy:async value=>busy=value,output:{clear(){},show(){},append(){},appendLine(){}},prepareWorking:async()=>working});
 return {run:()=>commands.get('jadeNative.publishWorkspace')(),calls,config,working,busy:()=>busy};
}
test('full publication reviews a native streamed snapshot and carries aggregate resources through native join/load',async t=>{
 const f=fixture(t),result=await f.run();assert.equal(result.success,true,result.error);assert.equal(f.calls.filter(c=>c.kind==='snapshot').length,1);assert.equal(f.calls.find(c=>c.kind==='snapshot').selection.scope,'all');const captured=f.calls.find(c=>c.kind==='snapshot');assert.deepEqual(captured.configuration.workspaceRoots,[captured.selection.destination]);assert.equal(captured.selection.cwd,captured.selection.destination);assert.notEqual(f.config.workspaceRoots[0],captured.selection.destination);assert.equal(f.calls.filter(c=>c.kind==='native'&&c.args.some(a=>a==='path='+f.config.databasePath)).length,1);assert.equal(f.busy(),false);
});
for(const [name,change] of [
 ['new source',({types,source})=>fs.copyFileSync(source,path.join(types,'NewSource.cls'))],
 ['deleted source',({source})=>fs.unlinkSync(source)],
 ['changed source',({source})=>fs.appendFileSync(source,'\n// changed during review')],
 ['dirty editor',({source,documents})=>documents.push({uri:{scheme:'file',fsPath:source},isDirty:true})],
 ['dirty associated untitled editor',({source,documents})=>documents.push({uri:{scheme:'untitled',fsPath:source},isDirty:true})]
])test('full publication refuses '+name+' introduced during approval',async t=>{
 const f=fixture(t,change),result=await f.run();assert.equal(result.success,false);assert.match(result.error,/changed|dirty|save|Multiple class\/type/i);assert.equal(f.calls.some(c=>c.kind==='native'&&c.args.includes('path='+f.config.databasePath)),false);assert.equal(f.busy(),false);
});
