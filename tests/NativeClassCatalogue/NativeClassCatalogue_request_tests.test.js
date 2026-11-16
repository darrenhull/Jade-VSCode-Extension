'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {NativeClassCatalogue}=require('../../extension/src/NativeClassCatalogue');
const {CliInspectionTransport}=require('../../extension/src/CliInspectionTransport');
const directory=(snapshotId,rows=[])=>({readOnly:true,catalogueVersion:1,snapshotId,view:'schemas',rows,total:rows.length,offset:0,next_offset:null,totalClasses:0});
test('same-adapter refresh rejects a late initial directory before it overwrites native snapshot or resurrects schemas',async()=>{
 let release,count=0;
 const adapter=new NativeClassCatalogue(async()=>++count===1?new Promise(r=>release=r):directory('new',[{name:'New',oid:'9002.2',total:0}]),{scope:'database:source'});
 const pending=adapter.directory();
 await adapter.directory({refresh:true});
 release(directory('old',[{name:'Deleted',oid:'9002.1',total:0}]));
 await assert.rejects(pending,/snapshot changed|superseded/i);
 assert.equal(adapter.snapshotId,'new');assert.deepEqual([...adapter.schemas.keys()],['New']);
});
for(const malformed of [
 {rows:Array.from({length:101},()=>({name:'A',oid:'9002.1',total:0})),total:101},
 {next_offset:0,total:1},
 {offset:1},
 {snapshotId:''},
 {catalogueVersion:0},
])test('native catalogue response contract fails closed '+JSON.stringify(malformed).slice(0,75),async()=>{
 const adapter=new NativeClassCatalogue(async()=>({...directory('one'),...malformed}),{scope:'database:source'});
 await assert.rejects(adapter.directory(),/capability|response/i);
});
for(const modern of [true,false])test('actual shared inspection transport probes legacy runtime with limit1 and never requests full tree modern='+modern,async()=>{
 const calls=[],child=new EventEmitter();let next=0;
 const service={connect:()=>({child}),request(command,packet){
  calls.push({command,args:packet.args});
  const body={readOnly:true,oidFormat:'jade-native',connectionEpoch:'actual-epoch',...(modern?directory('snapshot'): {rows:[],total:0,offset:0,next_offset:null})};
  return {id:++next,promise:Promise.resolve({passed:true,code:0,sessionId:packet.sessionId,body})};
 }};
 const transport=new CliInspectionTransport(service,{config:{workspaceRoots:['C:/project']},target:'source',catalogArgs:{includeSystem:false,view:'schemas',offset:0,limit:1}});
 try{
  await transport.ready;
  const adapter=new NativeClassCatalogue(args=>transport.request('catalog',{includeSystem:false,...args}),{scope:'database:source'});
  if(modern)await adapter.directory();else await assert.rejects(adapter.directory(),/Update.*Jade CLI/);
  assert.equal(calls[0].args.limit,1);
  assert.ok(calls.filter(x=>x.command==='inspect.catalog').every(x=>x.args.view==='schemas'&&x.args.limit>=1&&x.args.limit<=100));
  assert.equal(calls.some(x=>x.command==='disconnect'||x.command==='shutdown'),false);
 }finally{await transport.stop();}
});
