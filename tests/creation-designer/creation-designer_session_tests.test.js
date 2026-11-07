'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDesignerSession,designerHtml}=require('../../extension/src/creation-designer');
function fixture(overrides={}) {
 const sent=[],writes=[];
 const generated={files:[{file:'C:/project/A.cls',relativePath:'A.cls',text:'native source'}],summary:'A transient class A',source:'native source'};
 const model={schemas:()=>({items:[{name:'App'}],total:1}),search:r=>({items:[{name:'Fish',schema:'App',id:'App::Fish'}],total:1}),keyChoices:()=>({items:[],total:0}),preview:()=>generated};
 const session=createDesignerSession({post:async m=>sent.push(m),projects:[{id:'0',name:'Project',root:'C:/project'}],modelProvider:async()=>model,save:async(...args)=>{writes.push(args);return {files:['C:/project/A.cls']};},dirtyPaths:()=>[],...overrides});
 return {session,sent,writes,generated,model};
}
test('initialisation sends projects only and bounded searches retain schema identity',async()=>{
 const f=fixture();await f.session.handle({command:'ready'});assert.equal(f.sent[0].command,'projects');assert.equal(f.sent[0].projects[0].root,undefined);
 await f.session.handle({command:'project',project:'0',sequence:1});
 let requested;f.model.search=r=>{requested=r;return {items:[{name:'Fish',schema:'App',id:'App::Fish'}],total:1};};
 await f.session.handle({command:'search',sequence:2,schema:'App',kind:'member',query:'Fi',limit:30000});
 assert.equal(requested.limit,50);
 const reply=f.sent.find(x=>x.command==='search');assert.equal(reply.page.items[0].id,'App::Fish');assert.equal(reply.sequence,2);
});
test('save requires a reviewed preview receipt and never compiles or publishes',async()=>{
 const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});
 await f.session.handle({command:'save',sequence:2,receipt:'fake'});assert.equal(f.writes.length,0);
 await f.session.handle({command:'preview',sequence:3,request:{type:'class',schema:'App',name:'A'}});
 const p=f.sent.find(x=>x.command==='preview');assert.ok(p.receipt);
 await f.session.handle({command:'save',sequence:3,receipt:p.receipt});assert.equal(f.writes.length,1);assert.equal(f.sent.at(-1).command,'saved');
});
test('source changes since review reject save and preserve the draft',async()=>{
 const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});await f.session.handle({command:'preview',sequence:2,request:{type:'class',schema:'App',name:'A'}});
 const receipt=f.sent.at(-1).receipt;f.model.preview=()=>({...f.generated,files:[{...f.generated.files[0],text:'changed source'}]});
 await f.session.handle({command:'save',sequence:2,receipt});assert.equal(f.writes.length,0);assert.match(f.sent.at(-1).message,/changed.*review/i);
});
test('late async searches cannot replace a newer search',async()=>{
 let resolveOld;const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});
 f.model.search=r=>r.query==='old'?new Promise(r=>{resolveOld=r;}):({items:[{name:'new'}]});
 const old=f.session.handle({command:'search',sequence:2,query:'old',kind:'member',schema:'App'});await f.session.handle({command:'search',sequence:3,query:'new',kind:'member',schema:'App'});resolveOld({items:[{name:'old'}]});await old;
 assert.deepEqual(f.sent.filter(x=>x.command==='search').map(x=>x.page.items[0].name),['new']);
});
test('disposed sessions cannot save and HTML exposes accessible themed steps with strict CSP',async()=>{
 const f=fixture();f.session.dispose();await f.session.handle({command:'project',project:'0'});assert.equal(f.sent.length,0);
 const html=designerHtml({nonce:'safe',cspSource:'vscode-webview:',asset:n=>'vscode-webview:/'+n});
 assert.match(html,/default-src 'none'/);assert.match(html,/Collection class name/);assert.match(html,/Member class/);assert.match(html,/aria-live/);assert.match(html,/Review/);assert.doesNotMatch(html,/unsafe-inline|onclick=/);
});
test('editing the draft revokes its receipt before the debounced preview starts',async()=>{
 const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});await f.session.handle({command:'preview',sequence:2,request:{type:'class',schema:'App',name:'A'}});
 const receipt=f.sent.at(-1).receipt;await f.session.handle({command:'invalidate'});await f.session.handle({command:'save',sequence:2,receipt});assert.equal(f.writes.length,0);assert.match(f.sent.at(-1).message,/review/i);
});
test('native validation field metadata reaches the form without overwriting the draft',async()=>{
 const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});f.model.preview=()=>{throw Object.assign(Error('Choose a supported lifetime'),{field:'lifetime'});};
 await f.session.handle({command:'preview',sequence:2,request:{type:'class',schema:'App',name:'A'}});assert.equal(f.sent.at(-1).field,'lifetime');assert.equal(f.writes.length,0);
});
test('editing while save preparation is awaiting the catalogue prevents writing stale reviewed bytes',async()=>{
 const f=fixture();let calls=0,finish;const provider=async()=>{calls++;if(calls===2)await new Promise(r=>{finish=r;});return f.model;};
 const session=createDesignerSession({post:async m=>f.sent.push(m),projects:[{id:'0',name:'Project',root:'C:/project'}],modelProvider:provider,save:async()=>f.writes.push('write')});
 await session.handle({command:'project',project:'0',sequence:1});await session.handle({command:'preview',sequence:2,request:{type:'class',schema:'App',name:'A'}});const receipt=f.sent.at(-1).receipt;
 const writing=session.handle({command:'save',sequence:2,receipt});await session.handle({command:'invalidate'});finish();await writing;assert.equal(f.writes.length,0);assert.match(f.sent.at(-1).message,/changed during save/i);
});
test('successful saves refresh the same designer catalogue for subsequent schema and class creation',async()=>{
 const f=fixture();let written=false;
 const fresh={...f.model,schemas:()=>({items:[{name:'App'},{name:'NewSchema'}],total:2}),search:()=>({items:[{name:'NewClass',schema:'NewSchema',id:'NewSchema::NewClass'}]})};
 const session=createDesignerSession({post:async m=>f.sent.push(m),projects:[{id:'0',name:'Project',root:'C:/project'}],modelProvider:async()=>written?fresh:f.model,save:async()=>{written=true;return {files:['C:/project/NewSchema.scm']};}});
 await session.handle({command:'project',project:'0',sequence:1});await session.handle({command:'preview',sequence:2,request:{type:'schema',name:'NewSchema'}});
 await session.handle({command:'save',sequence:2,receipt:f.sent.at(-1).receipt});
 const changed=f.sent.find(m=>m.command==='catalogUpdated');assert.ok(changed);assert.equal(changed.page.items[1].name,'NewSchema');
 await session.handle({command:'search',sequence:3,schema:'NewSchema',kind:'member',query:'NewClass'});assert.equal(f.sent.at(-1).page.items[0].id,'NewSchema::NewClass');
});
test('a refresh failure after writing reports saved files and requires a project refresh without replaying writes',async()=>{
 const f=fixture();let count=0;
 const session=createDesignerSession({post:async m=>f.sent.push(m),projects:[{id:'0',name:'Project',root:'C:/project'}],modelProvider:async()=>{if(++count===3)throw Error('refresh failed');return f.model;},save:async()=>{f.writes.push('saved');return {files:['C:/project/A.cls']};}});
 await session.handle({command:'project',project:'0',sequence:1});await session.handle({command:'preview',sequence:2,request:{type:'class',schema:'App',name:'A'}});await session.handle({command:'save',sequence:2,receipt:f.sent.at(-1).receipt});
 assert.equal(f.writes.length,1);assert.equal(f.sent.at(-1).command,'saved');assert.match(f.sent.at(-1).notice,/saved.*refresh/i);
});
test('metadata review receipts include the original hash even when the proposed replacement text is unchanged',async()=>{
 const f=fixture();f.generated.files[0]={...f.generated.files[0],operation:'update',expectedHash:'a'.repeat(64),expectedText:'original'};
 await f.session.handle({command:'project',project:'0',sequence:1});await f.session.handle({command:'preview',sequence:2,request:{type:'collection',schema:'App',name:'A'}});const receipt=f.sent.at(-1).receipt;
 f.model.preview=()=>({...f.generated,files:[{...f.generated.files[0],expectedHash:'b'.repeat(64)}]});
 await f.session.handle({command:'save',sequence:2,receipt});assert.equal(f.writes.length,0);assert.match(f.sent.at(-1).message,/changed.*review/i);
});
test('a rejected stale receipt refreshes the active catalogue so a new preview can be reviewed and saved without reselecting the project',async()=>{
 const f=fixture(),updated={...f.generated,files:[{...f.generated.files[0],text:'updated native source'}]};let externalChange=false;
 const fresh={...f.model,preview:()=>updated};
 const session=createDesignerSession({post:async m=>f.sent.push(m),projects:[{id:'0',name:'Project',root:'C:/project'}],modelProvider:async()=>externalChange?fresh:f.model,save:async(root,generated)=>{f.writes.push(generated);return {files:['C:/project/A.cls']};}});
 await session.handle({command:'project',project:'0',sequence:1});await session.handle({command:'preview',sequence:2,request:{type:'class',schema:'App',name:'A'}});const oldReceipt=f.sent.at(-1).receipt;externalChange=true;
 await session.handle({command:'save',sequence:2,receipt:oldReceipt});assert.equal(f.writes.length,0);assert.match(f.sent.at(-1).message,/changed.*review/i);
 await session.handle({command:'preview',sequence:3,request:{type:'class',schema:'App',name:'A'}});const reviewed=f.sent.at(-1);assert.equal(reviewed.files[0].text,'updated native source');
 await session.handle({command:'save',sequence:3,receipt:reviewed.receipt});assert.equal(f.writes.length,1);assert.equal(f.writes[0].files[0].text,'updated native source');assert.equal(f.sent.at(-1).command,'saved');
});
test('inherited-key failures retain the native code and offending attribute across the UI boundary',async()=>{
 const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});f.model.preview=()=>{throw Object.assign(Error('Key lookup must retain inherited length (6385)'),{field:'keys',keyIndex:0,keyName:'lookup',attribute:'length',nativeCode:6385,nativeCodeProvenance:'Verified native new-subclass fixtures; not a compiler run.'});};
 await f.session.handle({command:'preview',sequence:2,request:{type:'collection',schema:'App',name:'A'}});
 assert.equal(f.sent.at(-1).keyIndex,0);assert.equal(f.sent.at(-1).keyName,'lookup');assert.equal(f.sent.at(-1).attribute,'length');assert.equal(f.sent.at(-1).nativeCode,6385);assert.match(f.sent.at(-1).nativeCodeProvenance,/not a compiler run/);assert.equal(f.writes.length,0);
});
test('unknown imported metadata diagnostics preserve their code and status at the webview boundary',async()=>{
 const f=fixture();await f.session.handle({command:'project',project:'0',sequence:1});f.model.preview=()=>{throw Object.assign(Error('Imported key properties are unavailable'),{field:'keys',code:'JADE_IMPORT_METADATA_UNAVAILABLE',metadataStatus:'nativeRequired'});};
 await f.session.handle({command:'preview',sequence:2,request:{type:'collection',schema:'App',name:'A'}});assert.equal(f.sent.at(-1).code,'JADE_IMPORT_METADATA_UNAVAILABLE');assert.equal(f.sent.at(-1).metadataStatus,'nativeRequired');assert.equal(f.writes.length,0);
});
