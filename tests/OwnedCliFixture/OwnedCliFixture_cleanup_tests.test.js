'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');
const {OwnedCliFixture}=require('../../test/OwnedCliFixture');
function proxy(){const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.kill=()=>assert.fail('The already-closed fixture proxy must not be killed');return child;}
test('waits beyond shutdown acknowledgement and proxy close for a real owned broker final write and exit',{timeout:10000},async t=>{
 let broker,brokerClosed,finalWrite=false,stage;const child=proxy();
 const fixture=new OwnedCliFixture({entry:'fixture.exe',spawn:()=>child,createSession:options=>{
  options.spawn('fixture.exe',[],{env:{}});
  const session={client:{child},request(command){assert.equal(command,'shutdown');broker.send('shutdown');child.exitCode=0;child.emit('close',0);session.client=undefined;return {promise:Promise.resolve({passed:true})};},dispose(){}};return session;
 }});
 t.after(async()=>{if(broker&&broker.exitCode===null){broker.kill();await new Promise(resolve=>broker.once('close',resolve));}if(stage&&fs.existsSync(stage)){fixture.artifacts.assertOwned();fs.rmSync(stage,{recursive:true,force:true});}});
 await fixture.run(async({root,stateDirectory})=>{
  stage=root;
  broker=spawn(process.execPath,['-e',"const fs=require('node:fs'),path=require('node:path'),state=process.argv[1];fs.mkdirSync(state,{recursive:true});fs.writeFileSync(path.join(state,'owner.json'),JSON.stringify({brokerPID:process.pid,nativePIDs:[]}));process.send('ready');process.on('message',()=>{setTimeout(()=>{fs.writeFileSync(path.join(state,'final-write'),'completed');fs.writeFileSync(path.join(state,'owner.json'),JSON.stringify({brokerPID:0,nativePIDs:[]}));process.send('final-write');process.exit(0);},120);});",stateDirectory],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  brokerClosed=new Promise(resolve=>broker.once('close',resolve));
  broker.on('message',message=>{if(message==='final-write')finalWrite=true;});
  await new Promise((resolve,reject)=>{broker.once('message',resolve);broker.once('error',reject);});
 });
 // OS liveness can report exit before Node dispatches ChildProcess's close
 // event. Await that event before asserting its JavaScript exitCode value.
 await brokerClosed;
 assert.equal(finalWrite,true);assert.equal(fs.existsSync(stage),false);assert.equal(broker.exitCode,0);
});
test('retains the contained fixture when its owned broker remains alive after acknowledgement',async t=>{
 const container=fs.mkdtempSync(path.join(os.tmpdir(),'jade-owned-cli-test-'));let stage,alive=true;const child=proxy();
 const artifacts=new HostTestArtifacts({root:container,minimumFreeBytes:0,isAlive:pid=>{assert.equal(pid,31337);return alive;},waitMilliseconds:10,pollMilliseconds:1});
 const fixture=new OwnedCliFixture({entry:'fixture.exe',artifacts,spawn:()=>child,createSession:options=>{options.spawn('fixture.exe',[],{env:{}});const session={client:{child},request(){child.exitCode=0;child.emit('close',0);session.client=undefined;return {promise:Promise.resolve({passed:true})};},dispose(){}};return session;}});
 try{await assert.rejects(fixture.run(async({root,stateDirectory})=>{stage=root;fs.mkdirSync(stateDirectory,{recursive:true});fs.writeFileSync(path.join(stateDirectory,'owner.json'),JSON.stringify({brokerPID:31337,nativePIDs:[]}));}),/still running|artifacts retained|cleanup/i);assert.equal(fs.existsSync(stage),true);}
 finally{alive=false;assert.equal(path.dirname(fs.realpathSync(container)),fs.realpathSync(os.tmpdir()));fs.rmSync(container,{recursive:true,force:true});}
});
