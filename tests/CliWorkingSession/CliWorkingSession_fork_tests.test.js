'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {CliWorkingSession}=require('../../extension/src/cli-client');
test('forked sessions preserve transport settings and have independent owned lifetimes',async()=>{
 const spawn=()=>assert.fail('Fork creation must not start a process'),session=new CliWorkingSession({entry:path.resolve('fixture-cli.exe'),spawn,shutdownTimeoutMilliseconds:2345,killTimeoutMilliseconds:678});
 const fork=session.fork();assert.notEqual(fork,session);assert.equal(fork.entry,session.entry);assert.equal(fork.spawn,spawn);assert.equal(fork.shutdownTimeoutMilliseconds,2345);assert.equal(fork.killTimeoutMilliseconds,678);
 await fork.dispose();assert.equal(session.disposed,false);const next=session.fork();await session.dispose();assert.equal(next.disposed,true);assert.throws(()=>session.fork(),/disposed/i);
});

test('parent disposal waits for every fork even when another fork fails closing',async()=>{
 const root=new CliWorkingSession(),first=root.fork(),second=root.fork(),failure=Error('First owned exit failed');let finish,settled=false;const gate=new Promise(resolve=>finish=resolve);
 first.closeOwnedClients=async()=>{throw failure;};second.closeOwnedClients=()=>gate;
 const closing=root.dispose().catch(error=>{settled=true;return error;});await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);finish();assert.equal(await closing,failure);
});

test('actual portable fork closes independently while its original private service remains usable',{timeout:15000},async()=>{
 const {OwnedCliFixture}=require('../../test/OwnedCliFixture');const fixture=new OwnedCliFixture({entry:path.resolve(__dirname,'../../packages/jade-cli-win-x64/jade-cli.exe')});
 await fixture.run(async({session})=>{const fork=session.fork();try{assert.equal((await session.request('status').promise).passed,true);assert.equal((await fork.request('status').promise).passed,true);assert.notEqual(session.client.child.pid,fork.client.child.pid);await fork.dispose();assert.equal(session.client.closed,false);assert.equal((await session.request('status').promise).passed,true);}finally{await fork.dispose();}});
});

test('parent retains and propagates a fork whose process exit was not confirmed',async()=>{const root=new CliWorkingSession(),fork=root.fork(),failure=Error('Owned process exit unconfirmed');fork.closeOwnedClients=async()=>{throw failure;};await assert.rejects(fork.dispose(),error=>error===failure);await assert.rejects(root.dispose(),error=>error===failure);});

test('only discovery and an acknowledged idle release leave the shared transport clear for Setup',async()=>{
 const {EventEmitter}=require('node:events');
 const child=new EventEmitter(),packets=[];
 child.stdout=new EventEmitter();
 child.stderr=new EventEmitter();
 child.stdin=new EventEmitter();
 child.stdin.write=line=>packets.push(JSON.parse(line));
 const session=new CliWorkingSession({entry:path.resolve('fixture-cli.exe'),spawn:()=>child});
 const reply=()=>child.stdout.emit('data',Buffer.from(JSON.stringify({
  id:packets.shift().id,event:'result',result:{passed:true,code:0}
 })+'\n'));
 for(const command of ['prepare','doctor','working.location']){
  const probe=session.request(command);
  reply();
  await probe.promise;
  assert.equal(session.client.lastRuntimeRequest,0,command);
 }
 const inspect=session.request('inspect.open');
 reply();
 await inspect.promise;
 assert.equal(session.client.lastRuntimeRequest,inspect.id);
 const closing=session.release();
 const later=session.request('build');
 reply();
 await closing;
 assert.equal(session.client.lastRuntimeRequest,later.id);
 reply();
 await later.promise;
 const finalRelease=session.release();
 reply();
 await finalRelease;
 assert.equal(session.client.lastRuntimeRequest,0);
});
