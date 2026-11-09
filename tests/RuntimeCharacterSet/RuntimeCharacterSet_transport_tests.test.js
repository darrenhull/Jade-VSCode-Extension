'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client');
const {CliInspectionTransport}=require('../../extension/src/CliInspectionTransport');
const {JadeWorkspaceRunner}=require('../../extension/src/JadeWorkspaceRunner');
function fixture(failure){
 const requests=[],child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>child.emit('close',0);
 child.stdin.write=text=>{const packet=JSON.parse(text);requests.push(packet);queueMicrotask(()=>{const result=failure?{passed:false,code:2,report:{error:failure}}:{passed:true,code:0,config:packet.config,sessionId:packet.sessionId,body:{readOnly:true,oidFormat:'jade-native',connectionEpoch:'native-fixture',schemas:[]},report:{success:true}};child.stdout.emit('data',Buffer.from(JSON.stringify({id:packet.id,event:'result',result})+'\n'));});};
 return{requests,session:new CliWorkingSession({entry:'jade-cli.exe',spawn:()=>child})};
}
for(const characterSet of ['auto','ansi','unicode'])test(characterSet+' survives actual CLI build/test/inspection/Scratch serialization',async()=>{
 const f=fixture(),config={characterSet,schema:'Pets',installPath:'C:/fixture',workspaceRoots:['C:/source']};
 try{
  assert.equal((await f.session.startWorking(config,'compile').completion).passed,true);
  assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);
  assert.equal((await f.session.inspectionTarget(config,'working')).characterSet,characterSet);
  const inspector=new CliInspectionTransport(f.session,{config,target:'working'});await inspector.ready;await inspector.stop();
  const runner=new JadeWorkspaceRunner({client:f.session,configFor:async()=>({...config})});assert.equal((await runner.run({document:{version:1,uri:{toString:()=> 'untitled:Scratch'},getText:()=> 'begin\n write "Jade";\nend;'}})).passed,true);
  assert.ok(f.requests.every(packet=>packet.config.characterSet===characterSet));assert.deepEqual(f.requests.map(packet=>packet.command),['build','test','inspect.target','inspect.catalog','inspect.close','workspace.run']);
 }finally{f.session.dispose();}
});
test('native character-set mismatch errors are retained and never trigger an automatic alternate-mode retry',async()=>{
 const error='Configured characterSet ansi does not match the installed Unicode Jade runtime.',f=fixture(error);
 try{await assert.rejects(f.session.inspectionTarget({characterSet:'ansi'},'working'),message=>message.message===error);assert.equal(f.requests.length,1);assert.equal(f.requests[0].config.characterSet,'ansi');}finally{f.session.dispose();}
});
