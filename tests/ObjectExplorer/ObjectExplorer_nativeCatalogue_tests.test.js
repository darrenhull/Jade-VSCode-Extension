'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('../../test/fixtures/object-ui.cjs');
function nativeCatalogue(){
 const calls=[],schemas=[{name:'Empty',oid:'9002.500',total:0},{name:'Pets',oid:'9002.1',total:260}],rows=Array.from({length:260},(_,i)=>({name:'Fish'+String(i).padStart(3,'0'),schema:'Pets',schemaOid:'9002.1',oid:'9002.'+(1000+i),schemaOffset:i}));
 let snapshotId='snapshot-A';
 return {calls,replace:()=>snapshotId='snapshot-B',handler:async args=>{
   calls.push(args);
   assert.ok(Number.isInteger(args.limit)&&args.limit>=1&&args.limit<=100,'Every catalogue call must be bounded');
   assert.ok(['schemas','classes'].includes(args.view),'No legacy full tree request');
   if(args.snapshotId&&args.snapshotId!==snapshotId)throw Error('Native catalogue snapshot changed; refresh required.');
   const selected=args.view==='schemas'?schemas:rows.filter(row=>(!args.schema||row.schema===args.schema)&&(!args.name||row.name===args.name)&&(!args.query||(row.schema+'::'+row.name).toLowerCase().includes(args.query.toLowerCase())));
   const offset=args.offset||0,items=selected.slice(offset,offset+args.limit);
   return {readOnly:true,catalogueVersion:1,snapshotId,view:args.view,rows:items,total:selected.length,offset,next_offset:offset+items.length<selected.length?offset+items.length:null,totalClasses:260};
 }};
}
test('registered Database Objects connects through a bounded probe and schema directory including empty schemas',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();
  assert.deepEqual(f.transportOptions[0].catalogArgs,{includeSystem:false,view:'schemas',offset:0,limit:1});
  const schemas=(await f.controller.provider.getChildren()).filter(x=>x.kind==='schema');
  assert.deepEqual(schemas.map(x=>x.name),['Empty','Pets']);
  assert.match(schemas[0].description,/0 classes/);
  assert.equal(n.calls.every(x=>x.view==='schemas'),true,'Connect must not transfer class rows');
 }finally{await f.cleanup();}
});
test('tree paging asks native for only the requested class page and reaches the final row',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();const schema=(await f.controller.provider.getChildren()).find(x=>x.name==='Pets');
  let children=await f.controller.provider.getChildren(schema);
  assert.equal(children.filter(x=>x.kind==='class').length,100);
  assert.equal(children[0].name,'Fish000');
  await f.commands.get('jadeNative.pageObjectClasses')('Pets',200);
  children=await f.controller.provider.getChildren(schema);
  assert.equal(children.filter(x=>x.kind==='class').length,60);
  assert.equal(children.filter(x=>x.kind==='class').at(-1).name,'Fish259');
  assert.ok(n.calls.some(x=>x.view==='classes'&&x.schema==='Pets'&&x.offset===200&&x.limit===100));
  assert.ok(n.calls.every(x=>x.limit<=100));
 }finally{await f.cleanup();}
});
test('class catalogue filters remotely and selected off-page identity reveals its native schema position',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();await f.commands.get('jadeNative.browseDatabaseClasses')();
  const panel=f.panels.at(-1);await panel.receive({command:'ready'});
  await panel.receive({command:'query',query:'Fish259',schema:'Pets',offset:0});
  const payload=panel.messages.filter(x=>x.command==='catalogue').at(-1);
  assert.equal(payload.page.total,1);assert.equal(payload.page.items[0].name,'Fish259');
  assert.ok(n.calls.some(x=>x.query==='Fish259'&&x.schema==='Pets'&&x.limit===100));
  await panel.receive({command:'open',id:payload.page.items[0].browserId});
  assert.ok(n.calls.some(x=>x.view==='classes'&&x.schema==='Pets'&&x.name==='Fish259'&&x.limit===1),'Revalidate exact identity before revealing');
  assert.ok(n.calls.some(x=>x.view==='classes'&&x.schema==='Pets'&&x.offset===200));
 }finally{await f.cleanup();}
});
test('legacy-only catalogue fails closed after a bounded request rather than downloading a full tree',async()=>{
 const calls=[],f=setup({catalogHandler:async args=>{calls.push(args);return {readOnly:true,rows:[],total:0,offset:0,next_offset:null};},closeAutomatically:true});
 try{await f.connect();assert.match(f.errors.at(-1),/update.*Jade CLI|catalogue.*capability/i);assert.ok(calls.every(x=>x.limit>=1&&x.limit<=100));}
 finally{await f.cleanup();}
});
test('refresh replaces snapshot while an old class page is pending and never publishes its rows',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();const schema=(await f.controller.provider.getChildren()).find(x=>x.name==='Pets');
  const original=f.clients[0].request;let release;
  f.clients[0].request=async(cmd,args)=>{if(cmd==='catalog'&&args.view==='classes'){const response=await original(cmd,args);await new Promise(r=>release=r);return response;}return original(cmd,args);};
  const pending=f.controller.provider.getChildren(schema);await new Promise(r=>setImmediate(r));
  n.replace();await f.commands.get('jadeNative.refreshObjects')();release();
  const stale=await pending;assert.equal(stale.some(x=>x.kind==='class'),false);
  assert.ok(n.calls.some(x=>x.view==='schemas'&&x.refresh===true),'Explicit refresh replaces native snapshot');
 }finally{await f.cleanup();}
});

test('refresh discards old class identities before any instance request',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();const schema=(await f.controller.provider.getChildren()).find(x=>x.name==='Pets');
  const row=(await f.controller.provider.getChildren(schema)).find(x=>x.kind==='class');
  n.replace();await f.commands.get('jadeNative.refreshObjects')();
  const before=f.clients[0].requests.filter(x=>x.command==='instances').length;
  const result=await f.controller.provider.getChildren(row);
  assert.equal(result.some(x=>x.kind==='object'),false);
  assert.equal(f.clients[0].requests.filter(x=>x.command==='instances').length,before,'Old snapshot OIDs must not cross refresh');
 }finally{await f.cleanup();}
});

test('schema directory itself stays paged and exact class reveal reaches an initially unloaded schema',async()=>{
 const schemas=Array.from({length:205},(_,i)=>({name:'Schema'+String(i).padStart(3,'0'),oid:'9002.'+(500+i),total:i===204?1:0,schemaOffset:i}));
 const row={schema:'Schema204',name:'Last',oid:'9002.999',schemaOffset:0},calls=[];
 const f=setup({closeAutomatically:true,catalogHandler:async args=>{
   calls.push(args);assert.ok(args.limit<=100);
   const values=args.view==='schemas'?schemas.filter(x=>!args.schema||x.name===args.schema):(!args.schema||args.schema===row.schema)&&(!args.name||args.name===row.name)?[row]:[];
   const rows=values.slice(args.offset,args.offset+args.limit);
   return {readOnly:true,catalogueVersion:1,snapshotId:'directory-one',view:args.view,rows,total:values.length,offset:args.offset,next_offset:args.offset+rows.length<values.length?args.offset+rows.length:null,totalClasses:1};
 }});
 try{
  await f.connect();let roots=await f.controller.provider.getChildren();
  assert.equal(roots.filter(x=>x.kind==='schema').length,100);
  assert.equal(roots.some(x=>x.kind==='more'&&x.name==='Next 100 schemas…'),true);
  await f.commands.get('jadeNative.pageObjectSchemas')(100);
  roots=await f.controller.provider.getChildren();assert.equal(roots.filter(x=>x.kind==='schema').length,100);
  await f.commands.get('jadeNative.browseDatabaseClasses')('Schema204');
  const panel=f.panels.at(-1);await panel.receive({command:'ready'});
  let payload=panel.messages.filter(x=>x.command==='catalogue').at(-1);
  assert.equal(payload.schemas.some(x=>x.name==='Schema204'),true,'Selected off-page native schema must be represented in the filter');
  await panel.receive({command:'open',id:payload.page.items[0].browserId});
  assert.ok(calls.some(x=>x.view==='schemas'&&x.schema==='Schema204'&&x.limit===1));
  assert.ok(calls.some(x=>x.view==='schemas'&&x.offset===200));
  roots=await f.controller.provider.getChildren();assert.equal(roots.filter(x=>x.kind==='schema').length,5);assert.equal(roots.some(x=>x.name==='Schema204'),true);
 }finally{await f.cleanup();}
});

test('Database class catalogue Refresh button explicitly reacquires native snapshot rather than rereading cached pages',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();await f.commands.get('jadeNative.browseDatabaseClasses')();
  const panel=f.panels.at(-1);await panel.receive({command:'ready'});
  n.replace();await panel.receive({command:'refresh'});
  assert.ok(n.calls.some(x=>x.view==='schemas'&&x.refresh===true),'Catalogue Refresh must use native refresh');
  await panel.receive({command:'query',query:'Fish259',schema:'Pets',offset:0});
  const payload=panel.messages.filter(x=>x.command==='catalogue').at(-1);
  assert.equal(payload.page.items[0].name,'Fish259');
 }finally{await f.cleanup();}
});

test('off-page reveal publishes its native page label before VS Code renders the schema caption',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();const schema=(await f.controller.provider.getChildren()).find(x=>x.name==='Pets');
  await f.controller.provider.getChildren(schema);const captions=[];
  f.controller.view.reveal=async row=>{if(row.kind==='schema')captions.push(f.controller.provider.getTreeItem(row).description);};
  await f.commands.get('jadeNative.browseDatabaseClasses')();
  const panel=f.panels.at(-1);await panel.receive({command:'ready'});await panel.receive({command:'query',query:'Fish259',schema:'Pets',offset:0});
  const state=panel.messages.filter(x=>x.command==='catalogue').at(-1);
  await panel.receive({command:'open',id:state.page.items[0].browserId});
  assert.match(captions[0],/201–260 of 260 classes/,'Visible schema caption must describe the revealed native page');
 }finally{await f.cleanup();}
});
test('failed explicit native refresh clears catalogue loading and shows its original capability error',async()=>{
 const n=nativeCatalogue(),f=setup({catalogHandler:n.handler,closeAutomatically:true});
 try{
  await f.connect();await f.commands.get('jadeNative.browseDatabaseClasses')();const panel=f.panels.at(-1);await panel.receive({command:'ready'});
  f.clients[0].request=async(command,args)=>command==='catalog'?{readOnly:true,rows:[],total:0,offset:args.offset,next_offset:null}:{readOnly:true};
  await f.commands.get('jadeNative.refreshObjects')();
  assert.equal(f.controller.classCatalogue.snapshot().loading,false,'A failed refresh must not keep spinning indefinitely');
  assert.ok(panel.messages.some(x=>x.command==='error'&&/Update.*Jade CLI/.test(x.message)));
 }finally{await f.cleanup();}
});
