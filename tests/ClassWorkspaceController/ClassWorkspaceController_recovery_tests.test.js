'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerClassWorkspaces}=require('../../extension/src/class-workspace-controller');
const {MethodDocumentBinding}=require('../../extension/src/method-document-binding');
const {MethodDraftRecovery}=require('../../extension/src/method-draft-recovery');
async function fixture({pendingAtStartup=true}={}){
 const stored=new Map(),storage={get:key=>stored.get(key),update:async(key,value)=>stored.set(key,structuredClone(value))},identity={name:'Fish',schema:'Pets',projectId:'file:///project',file:'file:///project/Fish.cls',qualifiedName:'Pets::Fish'};
 let text='schemaDefinition\nPets subschemaOf RootSchema;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\njadeMethodDefinitions\nname() : String;\nother();\n)\ntypeSources\nFish (\njadeMethodSources\nname\n{\nname() : String;\nbegin\n return "baseline";\nend;\n}\nother\n{\nother();\nbegin\nend;\n}\n)',version=1,provider,services;
 const document={uri:{scheme:'file',toString:()=>identity.file},fileName:'Fish.cls',getText:()=>text,get version(){return version;},isDirty:false};
 const binding=new MethodDocumentBinding(document,async(start,end,value)=>{text=text.slice(0,start)+value+text.slice(end);version++;document.isDirty=true;binding.changed([{rangeOffset:start,rangeLength:end-start,text:value}]);return true;});
 const initial=binding.select('Fish','name'),recoveredText=initial.text.replace('baseline','recovered');
 if(pendingAtStartup)await new MethodDraftRecovery(storage).save({uri:identity.file,projectId:identity.projectId,schema:'Pets',owner:'Fish',member:'name'},{text:recoveredText,version:9});
 const disposable={dispose(){}},panel={active:true,viewColumn:1,webview:{asWebviewUri:value=>value},onDidDispose:()=>disposable};
 const vscode={Uri:{parse:value=>({toString:()=>value}),joinPath:()=>({toString:()=>''})},ViewColumn:{Active:-1,Beside:-2},window:{registerCustomEditorProvider:(_id,value)=>{provider=value;return disposable;}},commands:{executeCommand:async()=>provider.createView({document,panel,binding,services:{}})}};
 const controller=registerClassWorkspaces(vscode,{extensionUri:{},subscriptions:[],workspaceState:storage},{model:{resolveClass:async()=>identity},shell:{attach:session=>{services=session.services.draftRecovery;return {dispose(){},state:()=>({})};},dispose(){}}});await controller.open(identity);
 return {binding,services,recoveredText,document,controller};
}
test('reopening a method keeps an unapplied recovery read-only and rejects new baseline edits',async()=>{
 const f=await fixture();const prepared=await f.services.prepare(f.binding.snapshot());assert.equal(prepared.readOnly,true);assert.match(prepared.reason,/Restore|discard/i);
 const before=f.document.getText();await assert.rejects(f.services.save({owner:'Fish',member:'name',text:'unrelated new edit',version:1}),/Restore|discard/i);await assert.rejects(f.binding.edit({version:1,start:0,end:0,text:'unsafe'}),/Restore|discard/i);
 assert.equal(await f.services.acknowledge(),false);assert.equal(f.services.get().text,f.recoveredText);assert.equal(f.document.getText(),before);
});
test('explicit discard removes only the recovery and makes the unchanged native source editable',async()=>{
 const f=await fixture();await f.services.prepare(f.binding.snapshot());const before=f.document.getText();f.services.get();await f.services.discard();assert.equal(f.binding.snapshot().readOnly,false);assert.equal(f.document.getText(),before);assert.equal(f.services.get(),undefined);
});
test('explicit restore writes the recovery through the native binding and re-enables editing',async()=>{
 const f=await fixture();await f.services.prepare(f.binding.snapshot());f.services.get();const restored=await f.services.restore();assert.equal(restored.text,f.recoveredText);assert.equal(restored.readOnly,false);assert.equal(f.document.isDirty,true);assert.match(f.document.getText(),/"recovered"/);assert.equal(f.services.get(),undefined);
});
test('recreating only the method canvas protects a live unapplied checkpoint without a new controller',async()=>{
 const f=await fixture({pendingAtStartup:false});assert.equal((await f.services.prepare(f.binding.snapshot())).readOnly,false);
 await f.services.save({owner:'Fish',member:'name',text:f.recoveredText,version:1});
 const prepared=await f.services.prepare(f.binding.select('Fish','name'));assert.equal(prepared.readOnly,true);
 await assert.rejects(f.services.save({owner:'Fish',member:'name',text:'new baseline input',version:1}),/Restore|discard/i);assert.equal(f.services.get().text,f.recoveredText);
});
test('returning from an unresolved method restores the independent method editing permission',async()=>{
 const f=await fixture();let state=await f.services.prepare(f.binding.select('Fish','other'));assert.equal(state.readOnly,false);
 state=await f.services.prepare(f.binding.select('Fish','name'));assert.equal(state.readOnly,true);assert.match(state.reason,/Restore|discard/i);
 state=await f.services.prepare(f.binding.select('Fish','other'));assert.equal(state.readOnly,false);assert.equal(state.reason,undefined);
 await f.services.save({owner:'Fish',member:'other',text:state.text+'// deliberate other edit',version:state.version});
 f.binding.select('Fish','name');assert.equal(f.services.get().text,f.recoveredText);
});
