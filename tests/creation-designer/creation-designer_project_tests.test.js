'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('../../extension/media/creation-designer');
const {createDesignerSession}=require('../../extension/src/creation-designer');
function mounted() {
 const elements=new Map(),listeners={},messages=[],tasks=[],writes=[];let state;
 function element(id='') { const attributes=new Map(),events={};return {id,value:'',children:[],dataset:{},classList:{toggle(){}},hidden:false,disabled:false,parentElement:{append(){},hidden:false},addEventListener(type,fn){events[type]=fn;},emit(type){events[type]?.({});},removeAttribute(k){attributes.delete(k);},setAttribute(k,v){attributes.set(k,v);},getAttribute(k){return attributes.get(k);},append(...els){this.children.push(...els);},replaceChildren(...els){this.children=els;if(id==='project'&&!this.value)this.value=els[0]?.value||'';},querySelector(){return element();},contains(){return false;},focus(){},scrollIntoView(){}}; }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},createElement:()=>element(),querySelectorAll:()=>[]};
 document.getElementById('steps').children=[element(),element(),element()];
 const root={JadeCreationRulesView:require('../../extension/media/creation-rules-view'),document,addEventListener:(type,fn)=>listeners[type]=fn,acquireVsCodeApi:()=>({getState:()=>undefined,setState:s=>state=structuredClone(s),postMessage:m=>{messages.push(m);if(session)tasks.push(session.handle(m));}})};
 let session,release,rejectSave=false,rejectProject=false;
 const projects=[{id:'A',name:'Alpha',root:'C:/Alpha'},{id:'B',name:'Beta',root:'C:/Beta'}];
 const model=p=>({schemas:()=>({items:[{name:'Pets'}]}),preview:()=>({summary:p.name,files:[{file:p.root+'/Created.cls',text:p.name,relativePath:'Created.cls'}]})});
 const deliver=data=>listeners.message({data});
 session=createDesignerSession({projects,post:deliver,modelProvider:async p=>{if(rejectProject&&p.id==="B")throw Error("Cannot read Beta");return model(p); },save:async root=>{await new Promise(r=>release=r);if(rejectSave)throw Error('save failed');writes.push(root);return{files:[root+'/Created.cls']};}});
 mount(root);
 async function settle(){for(let i=0;i<8;i++){const active=tasks.splice(0);await Promise.all(active);await Promise.resolve();}}
 return {elements,messages,writes,deliver,settle,get state(){return state;},release:()=>release(),fail:()=>rejectSave=true,failProject:()=>rejectProject=true,session,async reviewed(){await settle();elements.get('next').onclick();await new Promise(r=>setTimeout(r,210));await settle();},start(){elements.get('designer').onsubmit({preventDefault(){}});},dispose(){listeners.unload();session.dispose();}};
}
for(const failure of [false,true])test('mounted project selector stays on acknowledged workspace during pending '+(failure?'failed':'successful')+' save',async()=>{
 const f=mounted();try{await f.reviewed();f.start();await Promise.resolve();await Promise.resolve();
 assert.equal(f.elements.get('project').disabled,true);
 f.elements.get('project').value='B';f.elements.get('project').onchange();
 assert.equal(f.elements.get('project').value,'A');assert.equal(f.state.projectId,'A');
 f.deliver({command:'error',operation:'project',sequence:-1,message:'late project'});
 f.deliver({command:'saved',sequence:-1,files:['stale.cls']});
 f.elements.get('member').emit('focus');
 const search=f.messages.filter(m=>m.command==='search').at(-1);
 f.deliver({command:'error',operation:'search',field:'member',sequence:search?.sequence??-1,message:'late search'});
 assert.equal(f.elements.get('project').disabled,true);
 if(failure)f.fail();f.release();await f.settle();assert.equal(f.elements.get('project').disabled,false);
 assert.deepEqual(f.writes,failure?[]:['C:/Alpha']);assert.equal(f.elements.get('project').value,'A');
 f.elements.get('project').value='B';f.elements.get('project').onchange();await f.settle();assert.equal(f.state.projectId,'B');
 await new Promise(r=>setTimeout(r,210));await f.settle();f.start();await Promise.resolve();await Promise.resolve();if(failure){f.release();await f.settle();}else{f.release();await f.settle();assert.deepEqual(f.writes,['C:/Alpha','C:/Beta']);}
 }finally{f.dispose();}
});

test('failed project activation gates previews until another acknowledged selection, and stale errors cannot revoke a new review',async()=>{
 const f=mounted();try{await f.reviewed();f.failProject();f.elements.get('project').value='B';f.elements.get('project').onchange();await f.settle();
 const before=f.messages.filter(m=>m.command==='preview').length;f.elements.get('next').onclick();await new Promise(r=>setTimeout(r,210));await f.settle();
 assert.equal(f.messages.filter(m=>m.command==='preview').length,before);assert.equal(f.elements.get('save').disabled,true);
 f.elements.get('refresh-choices').onclick();await f.settle();await new Promise(r=>setTimeout(r,210));await f.settle();assert.equal(f.elements.get('save').disabled,false);
 f.deliver({command:'error',operation:'project',sequence:0,message:'old failure'});assert.equal(f.elements.get('save').disabled,false);assert.equal(f.state.projectId,'A');
 }finally{f.dispose();}
});
test('backend rejects a preview or save explicitly bound to a different acknowledged project',async()=>{
 const sent=[],writes=[],model={schemas:()=>({items:[]}),preview:()=>({summary:'A',files:[{file:'C:/Alpha/A.cls',text:'A'}]})};
 const session=createDesignerSession({projects:[{id:'A',root:'C:/Alpha'}],post:m=>sent.push(m),modelProvider:async()=>model,save:async()=>writes.push('write')});
 await session.handle({command:'project',project:'A',sequence:1});await session.handle({command:'preview',project:'B',sequence:2,request:{}});assert.match(sent.at(-1).message,/active project changed/i);
 await session.handle({command:'preview',project:'A',sequence:3,request:{}});const receipt=sent.at(-1).receipt;await session.handle({command:'save',project:'B',sequence:3,receipt});assert.equal(writes.length,0);assert.match(sent.at(-1).message,/active project changed/i);session.dispose();
});
