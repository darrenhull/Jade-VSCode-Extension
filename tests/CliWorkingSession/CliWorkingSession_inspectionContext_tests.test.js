'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client');
function fixture(){
 const packets=[],child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
 child.stdin.end=()=>queueMicrotask(()=>child.emit('close',0));child.kill=()=>assert.fail('Focused client must close naturally');
 child.stdin.write=line=>{const packet=JSON.parse(line);packets.push(packet);queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({id:packet.id,event:'result',result:{code:0,passed:true,config:packet.config,working:packet.config,body:{readOnly:true}}})+'\n')));};
 return{packets,session:new CliWorkingSession({entry:'jade-cli.exe',spawn:()=>child})};
}
const config={sourceFormat:'jox',cwd:'C:/selected-project',configFile:'C:/selected-project/jade.json',connection:'profile',user:'',password:'',installPath:'C:/selected-jade',databasePath:'C:/selected-source',iniPath:'C:/selected-source.ini',workspaceRoots:['C:/selected-project/sources']};
test('inspection target, paging, object reads, close and Working preview carry native project context in the CLI envelope',async()=>{
 const f=fixture();try{
  await f.session.inspectionTarget(config,'source');await f.session.inspectionTarget(config,'working');await f.session.workingLocation(config);
  for(const command of ['inspect.catalog','inspect.instances','inspect.object','inspect.collection','inspect.release','inspect.close'])await f.session.request(command,{config,target:'source',sessionId:'owned',args:{offset:7,limit:11}}).promise;
  for(const packet of f.packets){assert.equal(packet.cwd,config.cwd);assert.equal(packet.configFile,config.configFile);assert.equal(Object.hasOwn(packet.config,'cwd'),false);assert.equal(Object.hasOwn(packet.config,'configFile'),false);assert.equal(packet.config.databasePath,config.databasePath);assert.equal(packet.config.user,'');assert.equal(packet.config.password,'');assert.deepEqual(packet.config.workspaceRoots,config.workspaceRoots);}
  for(const packet of f.packets.slice(3)){assert.equal(packet.target,'source');assert.deepEqual(packet.args,{offset:7,limit:11});}
  assert.equal(config.configFile,'C:/selected-project/jade.json');
 }finally{await f.session.dispose();}
});
test('explicit native request context is not overwritten by config routing fields',async()=>{
 const f=fixture();try{await f.session.request('inspect.catalog',{config,cwd:'C:/explicit-project',configFile:'C:/explicit-project/custom.json',target:'working',args:{limit:1}}).promise;assert.equal(f.packets[0].cwd,'C:/explicit-project');assert.equal(f.packets[0].configFile,'C:/explicit-project/custom.json');assert.equal(f.packets[0].target,'working');}finally{await f.session.dispose();}
});
