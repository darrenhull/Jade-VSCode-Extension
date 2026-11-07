"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../../test/fixtures/object-ui.cjs');
async function fixture(run){const s=setup();try{await s.connect();await run(s);}finally{await s.cleanup();}}
async function open(s){const schema=(await s.controller.provider.getChildren()).find(x=>x.kind==='schema');const row=(await s.controller.provider.getChildren(schema)).find(x=>x.kind==='class');await s.commands.get('jadeNative.filterObjectInstances')(row);const panel=s.panels.at(-1);await panel.receive({command:'ready'});return {panel,row,catalogue:s.controller.instanceCatalogue(row)};}
test('instance filter shares catalogue autocomplete matcher without native reads or getters',()=>fixture(async s=>{
 const {panel,catalogue}=await open(s);const count=s.clients[0].requests.length;
 await panel.receive({command:'query',query:'pets fish 9002.30',schema:'',offset:0});
 const state=catalogue.snapshot();assert.equal(state.page.items.length,1);assert.equal(state.page.items[0].name,'9002.30');assert.equal(state.suggestions.length,1);assert.equal(s.clients[0].requests.length,count);assert.match(panel.webview.html,/current native page/i);assert.match(panel.webview.html,/aria-label="Instance search"/);assert.match(panel.webview.html,/aria-label="Native instance pages"/);assert.deepEqual(state.columns,['name','className','schema']);
 await panel.receive({command:'query',query:'missing',schema:'',offset:0});assert.match(catalogue.snapshot().emptyMessage,/No matching instances/);
 await panel.receive({command:'query',query:'',schema:'',offset:0});assert.equal(catalogue.snapshot().page.items.length,100);
}));
test('native instance Next and First preserve filter and never invent Previous or a database total',()=>fixture(async s=>{
 const {panel,catalogue}=await open(s);await panel.receive({command:'query',query:'fish',schema:'',offset:0});
 await panel.receive({command:'nativeNext'});let value=catalogue.snapshot();assert.equal(value.filter.query,'fish');assert.equal(value.nativePaging.number,2);assert.equal(value.nativePaging.hasMore,false);assert.equal(value.page.items[0].name,'9002.110');assert.match(value.page.label,/current page/);assert.equal(value.page.hasPrevious,false);
 await panel.receive({command:'nativeFirst'});value=catalogue.snapshot();assert.equal(value.nativePaging.number,1);assert.equal(value.filter.query,'fish');assert.equal(s.clients[0].requests.filter(x=>x.command==='instances').length,3);
}));
test('disconnected instance filter retains bounded snapshot but disables opening and paging',()=>fixture(async s=>{
 const {panel,catalogue}=await open(s);const before=catalogue.snapshot();s.clients[0].finishClose();await new Promise(r=>setImmediate(r));const count=s.clients[0].requests.length;
 await panel.receive({command:'query',query:'fish',schema:'',offset:0});assert.equal(catalogue.snapshot().page.items.length,100);assert.equal(catalogue.snapshot().nativePaging.stale,true);
 await panel.receive({command:'nativeNext'});await panel.receive({command:'open',id:before.page.items[0].browserId});assert.equal(s.clients[0].requests.length,count);
}));
test('empty instance pages distinguish absence from filtered no matches',()=>fixture(async s=>{
 const client=s.clients[0], original=client.request;client.request=async(command,args)=>command==='instances'?{items:[],hasMore:false}:original(command,args);
 const {catalogue}=await open(s);assert.equal(catalogue.snapshot().page.items.length,0);assert.match(catalogue.snapshot().emptyMessage,/No persistent instances/);assert.equal(catalogue.snapshot().nativePaging.hasMore,false);
}));
test('instance filters and stale tree identities remain isolated after target changes',()=>fixture(async s=>{
 const first=await open(s);await first.catalogue.setFilter({query:'9002.30'});s.clients[0].finishClose();await new Promise(r=>setImmediate(r));
 await s.controller.session.select('working');await s.commands.get('jadeNative.connectObjects')();
 const second=await open(s);assert.notEqual(first.catalogue,second.catalogue);assert.equal(second.catalogue.snapshot().filter.query,'');assert.equal(first.catalogue.snapshot().filter.query,'9002.30');assert.equal(first.catalogue.snapshot().nativePaging.stale,true);
 const count=s.clients[1].requests.length;await s.commands.get('jadeNative.filterObjectInstances')(first.row);assert.equal(s.clients[1].requests.length,count);assert.equal(s.panels.length,2);
}));
test('tree paging synchronizes the instance grid and released tree cursors require First restart',()=>fixture(async s=>{
 const {row,catalogue,panel}=await open(s);await catalogue.setFilter({query:'fish'});
 await s.commands.get('jadeNative.moreObjectInstances')(row);await new Promise(r=>setImmediate(r));assert.equal(catalogue.snapshot().nativePaging.number,2);assert.equal(catalogue.snapshot().page.items[0].name,'9002.110');
 await s.commands.get('jadeNative.firstObjectInstances')(row);await new Promise(r=>setImmediate(r));assert.equal(catalogue.snapshot().nativePaging.cursorReleased,true);const count=s.clients[0].requests.filter(x=>x.command==='instances').length;
 await panel.receive({command:'nativeNext'});assert.equal(s.clients[0].requests.filter(x=>x.command==='instances').length,count);
 await panel.receive({command:'nativeFirst'});assert.equal(catalogue.snapshot().nativePaging.number,1);assert.equal(catalogue.snapshot().filter.query,'fish');assert.equal(catalogue.snapshot().nativePaging.cursorReleased,false);
}));
test('closing an instance grid releases its shared native page and removes retained snapshot',()=>fixture(async s=>{
 const {row,panel}=await open(s);panel.dispose();await new Promise(r=>setImmediate(r));assert.equal(s.controller.instanceCatalogue(row),undefined);assert.ok(s.clients[0].requests.some(x=>x.command==='release'&&x.args.cursor==='next-100'));
}));
test('simultaneous instance search opens reuse one class/session grid',()=>fixture(async s=>{
 const schema=(await s.controller.provider.getChildren()).find(x=>x.kind==='schema');const row=(await s.controller.provider.getChildren(schema)).find(x=>x.kind==='class');
 await Promise.all([s.commands.get('jadeNative.filterObjectInstances')(row),s.commands.get('jadeNative.filterObjectInstances')(row)]);assert.equal(s.panels.length,1);
}));
test('instance search tabs are bounded and closing one permits another without silent eviction',()=>fixture(async s=>{
 const schema=(await s.controller.provider.getChildren()).find(x=>x.kind==='schema');const row=(await s.controller.provider.getChildren(schema)).find(x=>x.kind==='class');
 for(let i=0;i<13;i++)await s.commands.get('jadeNative.filterObjectInstances')({...row,oid:'9050.'+i,name:'Fish'+i});
 assert.equal(s.panels.length,12);assert.match(s.errors.at(-1),/12 tabs maximum/);s.panels[0].dispose();await new Promise(r=>setImmediate(r));await s.commands.get('jadeNative.filterObjectInstances')({...row,oid:'9050.12',name:'Fish12'});assert.equal(s.panels.length,13);
}));
for(const command of ['nativeFirst','refresh'])test('closing instance grid cancels late '+command+' cursor without retaining it',()=>fixture(async s=>{
 const {row,panel}=await open(s),client=s.clients[0],original=client.request;let resolve;
 client.request=async(name,args)=>{if(name==='instances'){client.requests.push({command:name,args});return new Promise(r=>resolve=r);}return original(name,args);};
 await panel.receive({command});assert.equal(typeof resolve,'function');panel.dispose();resolve({items:[{oid:'9002.999',className:'Fish',schema:'Pets'}],cursor:'late-after-close',hasMore:true});
 for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));assert.ok(client.requests.some(x=>x.command==='release'&&x.args.cursor==='late-after-close'));
 client.request=original;assert.equal(s.controller.instanceCatalogue(row),undefined);const rows=await s.controller.provider.getChildren(row);assert.equal(rows.filter(x=>x.kind==='object').length,100);
}));
test('closing grid preserves an in-flight native page still owned by the tree',()=>fixture(async s=>{
 const {row,panel}=await open(s),client=s.clients[0],original=client.request;let resolve;
 client.request=async(name,args)=>{if(name==='instances'){client.requests.push({command:name,args});return new Promise(r=>resolve=r);}return original(name,args);};
 await panel.receive({command:'nativeFirst'});const tree=s.controller.provider.getChildren(row);panel.dispose();resolve({items:[{oid:'9002.999',className:'Fish',schema:'Pets'}],cursor:'tree-owned',hasMore:true});const rows=await tree;
 assert.equal(rows.find(x=>x.kind==='object').oid,'9002.999');assert.equal(client.requests.some(x=>x.command==='release'&&x.args.cursor==='tree-owned'),false);client.request=original;
}));
test('late closed-grid page cannot replace a reopened instance grid',()=>fixture(async s=>{
 const {row,panel}=await open(s),client=s.clients[0],original=client.request,resolvers=[];
 client.request=async(name,args)=>{if(name==='instances'){client.requests.push({command:name,args});return new Promise(r=>resolvers.push(r));}return original(name,args);};
 await panel.receive({command:'nativeFirst'});panel.dispose();const reopen=s.commands.get('jadeNative.filterObjectInstances')(row);await new Promise(r=>setImmediate(r));assert.equal(resolvers.length,2);
 resolvers[1]({items:[{oid:'9002.777',className:'Fish',schema:'Pets'}],cursor:'new-grid',hasMore:true});await reopen;const fresh=s.controller.instanceCatalogue(row);await s.panels.at(-1).receive({command:'ready'});
 resolvers[0]({items:[{oid:'9002.999',className:'Fish',schema:'Pets'}],cursor:'old-grid',hasMore:true});for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
 assert.equal(fresh.snapshot().page.items[0].name,'9002.777');assert.ok(client.requests.some(x=>x.command==='release'&&x.args.cursor==='old-grid'));assert.equal(client.requests.some(x=>x.command==='release'&&x.args.cursor==='new-grid'),false);client.request=original;
}));
test('closing a grid does not cancel its pending Next when the native tree joins that request',()=>fixture(async s=>{
 const {row,panel}=await open(s),client=s.clients[0],original=client.request;let resolve;
 client.request=async(name,args)=>{if(name==='instances'){client.requests.push({command:name,args});return new Promise(r=>resolve=r);}return original(name,args);};
 await panel.receive({command:'nativeNext'});const tree=s.commands.get('jadeNative.moreObjectInstances')(row);panel.dispose();assert.equal(client.requests.filter(x=>x.command==='release'&&x.args.cursor==='next-100').length,0);
 resolve({items:[{oid:'9002.999',className:'Fish',schema:'Pets'}],cursor:'tree-next',hasMore:true});await tree;const rows=await s.controller.provider.getChildren(row);assert.equal(rows.find(x=>x.kind==='object').oid,'9002.999');assert.equal(client.requests.some(x=>x.command==='release'&&x.args.cursor==='tree-next'),false);client.request=original;
}));
