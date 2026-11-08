'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createClassWorkspaces}=require('../../extension/src/class-workspace');
const {createClassWorkspaceModel,memberId}=require('../../extension/src/class-workspace-model');
const {LanguageModel}=require('../../extension/src/language-model');
const {parseSource}=require('../../extension/src/source_symbols');
function deferred(){let resolve;return{promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)};}
async function setup(){
 const uri='file:///one/Fish.cls',row={schema:'Pets',owner:'Fish',file:uri};
 let text=`schemaDefinition\nPets subschemaOf RootSchema;\ntypeHeaders\nFish subclassOf Object transient;\ntypeDefinitions\nFish completeDefinition\n(\nattributeDefinitions\n${Array.from({length:110},(_,i)=>`p${String(i).padStart(3,'0')}: Integer;`).join('\n')}\n)\ntypeSources\n`;
 const project=new LanguageModel();project.update(parseSource(text,uri));let receive,close,gate,prepareGate,failedLookup,noticeGate,workspaceGate;
 const sent=[],selected=[],stored=new Map(),document={uri:{toString:()=>uri},isDirty:false};
 const vscode={Uri:{parse:value=>({toString:()=>value}),joinPath:()=>({toString:()=> 'file:///media'})},workspace:{getWorkspaceFolder:()=>({name:'one',uri:{toString:()=> 'file:///one'}})}};
 const model=createClassWorkspaceModel({vscode,language:{index:{project,ready:async()=>{},flush:async()=>{}}},readSource:async()=>({text,doc:{version:1,isDirty:false}})});
 const shell=createClassWorkspaces(vscode,{extensionUri:{},workspaceState:{get:key=>stored.get(key),update:async(key,value)=>stored.set(key,value)}},{load:async(row,state)=>{if(state.selectedId===failedLookup)throw Error('Lookup failed');const value=await model.load(row,state);if(gate&&state.selectedId===gate.id){const pending=gate;gate=undefined;await pending.promise;}return value;},preview:async()=>({text:'preview'})});
 const panel={webview:{cspSource:'resource:',asWebviewUri:uri=>uri.toString(),postMessage:async value=>{sent.push(value);if(value.command==='workspace'&&workspaceGate&&value.snapshot.state.selectedId===workspaceGate.id){const pending=workspaceGate;workspaceGate=undefined;pending.started.resolve();await pending.promise;}if(value.command==='notice'&&noticeGate){const pending=noticeGate;noticeGate=undefined;pending.started.resolve();await pending.promise;}return true;},onDidReceiveMessage:callback=>{receive=callback;return{dispose(){}};}},onDidDispose:callback=>{close=callback;return{dispose(){}};}};
 const binding={select:(owner,member)=>{selected.push(member);return{available:true,owner,member,text:member,version:1};}};
 const view=shell.attach({panel,row,document,binding,services:{draftRecovery:{get:async()=>undefined,prepare:async snapshot=>{if(prepareGate&&snapshot.member===prepareGate.name){const pending=prepareGate;prepareGate=undefined;await pending.promise;return{...snapshot,text:'stale draft'};}return snapshot;}}}});await receive({command:'ready'});
 const id=name=>memberId({schema:'Pets',owner:'Fish',kind:'property',name});
 return{view,shell,sent,selected,id,source:()=>text,receive:value=>receive(value),close:()=>close(),remove(name){text=text.replace(name+': Integer;','');project.update(parseSource(text,uri));},pauseWorkspace(name){workspaceGate={...deferred(),started:deferred(),id:id(name)};return workspaceGate;},pauseNotice(){noticeGate={...deferred(),started:deferred()};return noticeGate;},failLookup(name){failedLookup=id(name);},pausePrepare(name){prepareGate={...deferred(),name};return prepareGate;},pause(name){gate={...deferred(),id:id(name)};return gate;},snapshot:()=>sent.filter(value=>value.command==='workspace').at(-1).snapshot};
}
test('reused selection resolves an off-page property with the real model while retaining a bounded page',async()=>{
 const f=await setup();try{await f.view.select(f.id('p109'));await f.receive({command:'select',id:f.id('p109')});assert.equal(f.view.state().selectedId,f.id('p109'));assert.equal(f.snapshot().selected.name,'p109');assert.equal(f.snapshot().groups.flatMap(group=>group.items).length,100);assert.equal(f.view.state().offset,0);assert.deepEqual(f.selected,['p109']);}finally{f.shell.dispose();}
});
test('reused selection resolves a filter-excluded property without clearing the filter or its page',async()=>{
 const f=await setup();try{await f.receive({command:'search',query:'p000'});await f.receive({command:'select',id:f.id('p109')});assert.equal(f.view.state().selectedId,f.id('p109'));assert.equal(f.view.state().query,'p000');assert.equal(f.snapshot().groups.flatMap(group=>group.items).length,1);assert.equal(f.snapshot().selected.name,'p109');assert.deepEqual(f.selected,['p109']);}finally{f.shell.dispose();}
});
for(const action of ['new selection','close','refresh'])test(`a delayed off-page selection cannot overwrite ${action}`,async()=>{
 const f=await setup();try{const pending=f.pause('p109'),selection=f.receive({command:'select',id:f.id('p109')});await new Promise(resolve=>setImmediate(resolve));if(action==='new selection')await f.receive({command:'select',id:f.id('p001')});else if(action==='close')f.close();else await f.view.refresh();const sent=f.sent.length;pending.resolve();await selection;assert.ok(!f.selected.includes('p109'));assert.equal(f.sent.length,sent);if(action==='new selection')assert.equal(f.view.state().selectedId,f.id('p001'));}finally{f.shell.dispose();}
});

test('a superseded draft preparation cannot overwrite a newer selection of the same member',async()=>{
 const f=await setup();try{const pending=f.pausePrepare('p001'),first=f.receive({command:'select',id:f.id('p001')});await new Promise(resolve=>setImmediate(resolve));await f.receive({command:'select',id:f.id('p002')});await f.receive({command:'select',id:f.id('p001')});const sent=f.sent.length;pending.resolve();await first;assert.equal(f.sent.length,sent);assert.equal(f.sent.filter(message=>message.command==='editorSnapshot').at(-1).snapshot.text,'p001');}finally{f.shell.dispose();}
});

for(const failure of ['unknown member','lookup error'])test(`a refused external selection preserves the existing member after ${failure}`,async()=>{
 const f=await setup();try{await f.receive({command:'select',id:f.id('p001')});const state=f.view.state(),snapshot=f.snapshot(),editor=f.sent.filter(message=>message.command==='editorSnapshot').at(-1),bindings=[...f.selected];if(failure==='lookup error')f.failLookup('missing');await f.receive({command:'select',id:f.id('missing')});assert.deepEqual(f.view.state(),state);assert.deepEqual(f.snapshot(),snapshot);assert.deepEqual(f.selected,bindings);assert.deepEqual(f.sent.filter(message=>message.command==='editorSnapshot').at(-1),editor);assert.ok(!f.sent.some(message=>message.command==='notice'&&message.message.includes('overview')));}finally{f.shell.dispose();}
});

test('a stale missing-member notice cannot replace a newer filtered model snapshot',async()=>{
 const f=await setup();try{await f.receive({command:'select',id:f.id('p001')});f.remove('p001');const pending=f.pauseNotice(),refresh=f.view.refresh();await pending.started.promise;await f.receive({command:'search',query:'p109'});const snapshot=f.snapshot();assert.equal(snapshot.groups.flatMap(group=>group.items)[0].name,'p109');pending.resolve();await refresh;assert.deepEqual(f.snapshot(),snapshot);assert.equal(f.view.state().query,'p109');}finally{f.shell.dispose();}
});

for(const action of ['search','filter','refresh','unknown selection'])test(`selected member preparation finishes after unrelated ${action}`,async()=>{
 const f=await setup();try{await f.receive({command:'select',id:f.id('p001')});const source=f.source(),pending=f.pausePrepare('p002'),selection=f.receive({command:'select',id:f.id('p002')});await new Promise(resolve=>setImmediate(resolve));if(action==='search')await f.receive({command:'search',query:'p109'});else if(action==='filter')await f.receive({command:'filter',kind:'method'});else if(action==='refresh')await f.view.refresh();else await f.receive({command:'select',id:f.id('missing')});assert.equal(f.view.state().selectedId,f.id('p002'));pending.resolve();await selection;assert.equal(f.sent.filter(message=>message.command==='editorSnapshot').at(-1).snapshot.member,'p002');assert.deepEqual(f.selected,['p001','p002']);assert.equal(f.source(),source);}finally{f.shell.dispose();}
});
test('closing a workspace cancels its pending selected member preparation',async()=>{
 const f=await setup();try{await f.receive({command:'select',id:f.id('p001')});const pending=f.pausePrepare('p002'),selection=f.receive({command:'select',id:f.id('p002')});await new Promise(resolve=>setImmediate(resolve));f.close();const count=f.sent.length;pending.resolve();await selection;assert.equal(f.sent.length,count);}finally{f.shell.dispose();}
});

test('a catalogue refresh after off-page metadata is committed still initializes its selected editor',async()=>{
 const f=await setup();try{await f.receive({command:'select',id:f.id('p001')});const source=f.source(),pending=f.pauseWorkspace('p109'),selection=f.receive({command:'select',id:f.id('p109')});await pending.started.promise;await f.receive({command:'search',query:'p000'});pending.resolve();await selection;assert.equal(f.sent.filter(message=>message.command==='editorSnapshot').at(-1).snapshot.member,'p109');assert.equal(f.view.state().query,'p000');assert.equal(f.source(),source);}finally{f.shell.dispose();}
});

for(const action of ['unknown selection','failed lookup','valid selection'])test(`committed off-page selection preparation handles a later ${action}`,async()=>{
 const f=await setup();try{await f.receive({command:'select',id:f.id('p001')});const pending=f.pauseWorkspace('p109'),selection=f.receive({command:'select',id:f.id('p109')});await pending.started.promise;if(action==='failed lookup')f.failLookup('missing');await f.receive({command:'select',id:f.id(action==='valid selection'?'p002':'missing')});pending.resolve();await selection;const expected=action==='valid selection'?'p002':'p109';assert.equal(f.view.state().selectedId,f.id(expected));assert.equal(f.sent.filter(message=>message.command==='editorSnapshot').at(-1).snapshot.member,expected);assert.deepEqual(f.selected,['p001',expected]);}finally{f.shell.dispose();}
});
