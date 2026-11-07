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
