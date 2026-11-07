'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('../../extension/media/creation-designer');
const {createDesignerSession}=require('../../extension/src/creation-designer');
const {createCreationModel}=require('../../extension/src/creation-model');
const {parseSource}=require('../../extension/src/source_symbols');
const path=require('node:path');

function comparisonFixture() {
 let propertyType='Integer';
 const models=new Map();
 function build(project) {
  const schema=(name,type)=>({name,parent:'RootSchema',folder:path.join(project.root,'schemas',name),header:{text:'jadeVersionNumber "25.0.02";'},entries:[],classes:[['Item',type],['TextItem','String']].map(([owner,fieldType])=>({owner,model:parseSource('schemaDefinition\n'+name+' subschemaOf RootSchema partialDefinition;\ntypeHeaders\n'+owner+' subclassOf Object transient;\ntypeDefinitions\n'+owner+' completeDefinition\n(\nattributeDefinitions\nname: '+(fieldType==='String'?'String[50]':fieldType)+';\n)\ntypeSources\n',owner+'.cls')}))});
  const actual=createCreationModel({root:project.root,schemas:[schema('Pets',project.id==='B'?'String':propertyType),schema('Other','String')]});
  models.set(project.id,actual);return actual;
 }
 const f=mounted({modelForProject:project=>{build(project);return Object.fromEntries(['schemas','keyChoices','describe','preview'].map(method=>[method,(...args)=>models.get(project.id)[method](...args)]));}});
 f.replaceMetadata=()=>{propertyType='String';build({id:'A',root:'C:/Alpha'});};
 f.input=(id,value)=>{const el=f.get(id);el.value=value;if(el.oninput)el.oninput();else el.emit('input');};
 f.waitPreview=async()=>{await new Promise(r=>setTimeout(r,215));await f.settle();};
 f.begin=async()=>{
  await f.settle();f.get('kind').value='collection';f.get('kind').onchange();
  f.input('name','ItemsByName');f.input('member','Item');f.input('key-0','name');
  f.get('key-0').focus();f.get('key-0').emit('focus');await f.settle();f.get('key-results-0').children.find(row=>row.textContent==='name').onclick();
  await f.waitPreview();assert.equal(f.get('key-comparison-0').parentElement.hidden,true);
  f.get('key-case-0').checked=true;f.get('key-case-0').onchange();f.input('key-locale-0','2057');
 };
 f.assertTextPreview=async()=>{
  await f.waitPreview();
  assert.equal(f.get('key-comparison-0').parentElement.hidden,false);
  assert.equal(f.get('key-comparison-0').children.find(row=>row.value==='binary').disabled,false);
  assert.equal(f.get('key-case-0').parentElement.hidden,false);
  assert.equal(f.get('key-case-0').checked,true);assert.equal(f.get('key-locale-0').value,2057);
  const request=f.messages.filter(m=>m.command==='preview').at(-1).request;
  assert.equal(request.keys[0].locale,2057);assert.equal(request.keys[0].caseInsensitive,true);
  assert.match(f.get('live-source').textContent,/name caseInsensitive 2057;/);
 };
 return f;
}
test('typed member transition re-resolves Integer to String and preserves comparison controls and generated source',async()=>{
 const f=comparisonFixture();try{await f.begin();f.input('member','TextItem');await f.assertTextPreview();}finally{f.dispose();}
});
test('catalogue refresh after a successful save re-resolves metadata without trying to create the saved class again',async()=>{
 const f=mounted();try{
  await f.reviewed();f.start();await Promise.resolve();await Promise.resolve();
  const before=f.messages.filter(m=>m.command==='preview').length;
  f.release();await f.settle();await new Promise(r=>setTimeout(r,215));await f.settle();
  assert.equal(f.messages.filter(m=>m.command==='preview').length,before);
  assert.match(f.get('status').textContent,/^Saved /);
 }finally{f.dispose();}
});
test('late metadata cannot restore a previous member type and unresolved paths cannot enable Binary',async()=>{
 const f=comparisonFixture();try{
  await f.begin();await f.waitPreview();const previous=f.messages.filter(m=>m.command==='describe').at(-1);
  f.input('member','TextItem');
  f.deliver({command:'describe',sequence:previous.sequence,rules:{memberKeyTypes:[{name:'name',type:'Integer'}]}});
  assert.equal(f.get('key-comparison-0').children.find(row=>row.value==='binary').disabled,true);
  await f.assertTextPreview();
  f.deliver({command:'describe',sequence:previous.sequence,rules:{memberKeyTypes:[{name:'name',type:'Integer'}]}});
  assert.equal(f.get('key-comparison-0').parentElement.hidden,false);
  f.input('key-0','missing');f.get('key-comparison-0').value='binary';f.get('key-comparison-0').onchange();
  await f.waitPreview();assert.equal(f.get('save').disabled,true);assert.equal(f.get('key-comparison-0').children.find(row=>row.value==='binary').disabled,true);
 }finally{f.dispose();}
});
for(const context of ['schema','project','catalogue'])test(context+' changes invalidate member-key types and re-resolve actual String metadata',async()=>{
 const f=comparisonFixture();try{
  await f.begin();
  if(context==='schema')f.input('schema','Other');
  if(context==='project'){f.get('project').value='B';f.get('project').onchange();await f.settle();}
  if(context==='catalogue'){f.replaceMetadata();f.deliver({command:'catalogUpdated',project:'A',page:{items:[{name:'Pets'},{name:'Other'}]}});}
  await f.assertTextPreview();
 }finally{f.dispose();}
});
function mounted({modelForProject}={}) {
 const elements=new Map(),listeners={},messages=[],tasks=[],writes=[];let state;
 function element(id='') { const attributes=new Map(),events={};return {id,value:'',selectedOptions:[],children:[],dataset:{},classList:{toggle(){}},hidden:false,disabled:false,parentElement:{append(){},hidden:false},addEventListener(type,fn){events[type]=fn;},emit(type){events[type]?.({});},removeAttribute(k){attributes.delete(k);},setAttribute(k,v){attributes.set(k,v);},getAttribute(k){return attributes.get(k);},append(...els){this.children.push(...els);for(const el of els)el.parentElement=this;},replaceChildren(...els){this.children=els;if(id==='project'&&!this.value)this.value=els[0]?.value||'';},querySelector(){return element();},contains(){return false;},focus(){document.activeElement=this;},scrollIntoView(){}}; }
 const document={getElementById(id){const walk=el=>el.id===id?el:el.children.map(walk).find(Boolean);for(const el of elements.values()){const found=walk(el);if(found)return found;}if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},createElement:()=>element(),querySelectorAll:()=>[]};
 document.getElementById('steps').children=[element(),element(),element()];
 const root={JadeCreationRulesView:require('../../extension/media/creation-rules-view'),document,addEventListener:(type,fn)=>listeners[type]=fn,acquireVsCodeApi:()=>({getState:()=>undefined,setState:s=>state=structuredClone(s),postMessage:m=>{messages.push(m);if(session)tasks.push(session.handle(m));}})};
 let session,release,rejectSave=false,rejectProject=false;
 const projects=[{id:'A',name:'Alpha',root:'C:/Alpha'},{id:'B',name:'Beta',root:'C:/Beta'}];
 const model=p=>modelForProject?.(p)||({schemas:()=>({items:[{name:'Pets'}]}),keyChoices:()=>({items:[{name:'name',type:'String'}]}),preview:()=>({summary:p.name,files:[{file:p.root+'/Created.cls',text:p.name,relativePath:'Created.cls'}]})});
 const deliver=data=>listeners.message({data});
 session=createDesignerSession({projects,post:deliver,modelProvider:async p=>{if(rejectProject&&p.id==="B")throw Error("Cannot read Beta");return model(p); },save:async root=>{await new Promise(r=>release=r);if(rejectSave)throw Error('save failed');writes.push(root);return{files:[root+'/Created.cls']};}});
 mount(root);
 async function settle(){for(let i=0;i<8;i++){const active=tasks.splice(0);await Promise.all(active);await Promise.resolve();}}
 return {get:id=>document.getElementById(id),elements,messages,writes,deliver,settle,get state(){return state;},release:()=>release(),fail:()=>rejectSave=true,failProject:()=>rejectProject=true,session,async reviewed(){await settle();elements.get('next').onclick();await new Promise(r=>setTimeout(r,210));await settle();},start(){elements.get('designer').onsubmit({preventDefault(){}});},dispose(){listeners.unload();session.dispose();}};
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

test('mounted Binary comparison disables retained locale and case settings and restores them on native mode',async()=>{
 const f=mounted();try{await f.settle();f.elements.get('kind').value='collection';f.elements.get('kind').onchange();f.elements.get('dictionary').value='external';f.elements.get('dictionary').onchange();
 const locale=f.get('key-locale-0'),ci=f.get('key-case-0');locale.value='2057';locale.oninput();ci.checked=true;ci.onchange();
 const comparison=f.get('key-comparison-0');assert.equal(comparison.children.find(x=>x.value==='binary').disabled,false);assert.equal(comparison.children.find(x=>x.value==='latin1').disabled,true);
 comparison.value='binary';comparison.onchange();assert.equal(locale.disabled,true);assert.equal(ci.disabled,true);assert.equal(locale.parentElement.hidden,true);assert.match(f.get('key-comparison-help-0').textContent,/Latin1.*not.*proved/i);
 await new Promise(r=>setTimeout(r,210));await f.settle();let request=f.messages.filter(m=>m.command==='preview').at(-1).request;assert.equal(request.keys[0].comparison,'binary');assert.equal(request.keys[0].locale,undefined);assert.equal(request.keys[0].caseInsensitive,undefined);
 comparison.value='native';comparison.onchange();assert.equal(locale.disabled,false);assert.equal(ci.disabled,false);assert.equal(locale.value,'2057');assert.equal(ci.checked,true);
 await new Promise(r=>setTimeout(r,210));await f.settle();request=f.messages.filter(m=>m.command==='preview').at(-1).request;assert.equal(request.keys[0].locale,2057);assert.equal(request.keys[0].caseInsensitive,true);
 }finally{f.dispose();}
});

test('typing a different member path invalidates prior String metadata before enabling Binary again',async()=>{
 const f=mounted();try{await f.settle();f.elements.get('kind').value='collection';f.elements.get('kind').onchange();
 let name=f.get('key-0');name.focus();name.emit('focus');await f.settle();f.get('key-results-0').children[0].onclick();
 let comparison=f.get('key-comparison-0');assert.equal(comparison.children.find(x=>x.value==='binary').disabled,false);comparison.value='binary';comparison.onchange();
 name=f.get('key-0');name.value='age';name.oninput();comparison=f.get('key-comparison-0');assert.equal(comparison.children.find(x=>x.value==='binary').disabled,true);assert.match(f.get('key-comparison-help-0').textContent,/known String/);
 await new Promise(r=>setTimeout(r,210));await f.settle();assert.equal(f.elements.get('save').disabled,true);assert.match(f.elements.get('error').textContent,/known String/);
 }finally{f.dispose();}
});
