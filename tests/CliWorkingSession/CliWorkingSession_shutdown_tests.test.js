"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), {EventEmitter} = require("node:events");
const {CliWorkingSession} = require("../../extension/src/cli-client");
function fixture(options = {}) {
  const requests = [], spawns = [], children = [];
  const session = new CliWorkingSession({...options,entry:"C:/owned-fixture/jade-cli.exe", spawn:(entry,args,options) => {
    const child = new EventEmitter();
    Object.assign(child, {stdout:new EventEmitter(), stderr:new EventEmitter(), stdin:new EventEmitter(), exitCode:null, signalCode:null, kills:0, ended:false});
    child.stdin.write = line => {
      const packet = JSON.parse(line); requests.push(packet);
      if (packet.command === "doctor") queueMicrotask(() => reply(child, packet.id, {passed:true,code:0,capabilities:{sourceExtraction:{format:1}}}));
      return true;
    };
    child.stdin.end = () => { child.ended = true; };
    child.kill = () => { child.kills++; return true; };
    spawns.push({entry,args,options}); children.push(child); return child;
  }});
  return {session,requests,spawns,children};
}
function reply(child,id,result) { child.stdout.emit("data",Buffer.from(JSON.stringify({id,event:"result",result})+"\n")); }
function close(child,code=0) { child.exitCode=code; child.emit("close",code,null); }

test("idle disposal drains its owned stdio client and waits for actual close", async () => {
  const f=fixture(), child=f.session.connect().child;
  const closing=f.session.dispose();
  assert.ok(closing && typeof closing.then === "function", "Disposal must return the actual owned-exit promise");
  let completed=false; closing.then(() => completed=true);
  await new Promise(setImmediate);
  assert.equal(completed,false,"Sending a close request is not actual process exit");
  assert.equal(child.kills,0,"Responsive owned client should receive graceful EOF first");
  assert.equal(child.ended,true);
  close(child); await closing; assert.equal(completed,true);
});

test("shutdown cancels an in-flight Working request without replacing its native result", async () => {
  const f=fixture(), operation=f.session.startWorking({program:"C:/owned-fixture/Sample.cls"},"test.run"), child=f.children[0];
  const request=f.requests.find(p=>p.command==="test"), closing=f.session.dispose();
  assert.ok(f.requests.some(p=>p.command==="cancel"&&p.operationId===request.id),"Disposal did not cancel its owned Working operation");
  assert.equal(child.kills,0,"The service must remain available for the native terminal result");
  reply(child,request.id,{passed:false,code:6295,report:{error:"Controlled native refusal"}});
  assert.equal((await operation.completion).code,6295);
  close(child); await closing;
});

test("repeated disposal shares one closure and never reconnects", async () => {
  const f=fixture(), child=f.session.connect().child, first=f.session.dispose(), second=f.session.dispose();
  assert.ok(first && typeof first.then === "function","Repeated disposal needs an awaited lifecycle");
  assert.strictEqual(second,first); assert.equal(f.spawns.length,1);
  assert.throws(()=>f.session.connect(),/disposed|closing/i);
  close(child); await first;
});

test("repeated metadata refresh probes reuse the expected stdio role instead of spawning clients per refresh", async () => {
  const f=fixture();
  for(let i=0;i<5;i++) await f.session.sourceCapabilities({schema:"ExampleSchema"});
  assert.equal(f.spawns.length,1);
  assert.deepEqual(f.spawns[0].args,["service","--stdio"]);
  assert.equal(f.spawns[0].entry,"C:/owned-fixture/jade-cli.exe");
  assert.equal(f.requests.filter(p=>p.command==="doctor").length,5);
  f.session.dispose(); close(f.children[0]);
});


test("the bounded fallback kills only the captured child and still awaits actual close", async () => {
  const f=fixture({shutdownTimeoutMilliseconds:10,killTimeoutMilliseconds:100}), child=f.session.connect().child;
  const sibling=fixture(), other=sibling.session.connect().child;
  child.kill=()=>{child.kills++; queueMicrotask(()=>close(child,1)); return true;};
  await f.session.dispose();
  assert.equal(child.ended,true); assert.equal(child.kills,1); assert.equal(child.exitCode,1);
  assert.equal(other.kills,0); assert.equal(other.exitCode,null);
  const closing=sibling.session.dispose(); close(other); await closing;
});

test("unconfirmed termination rejects instead of claiming the old client exited", async () => {
  const f=fixture({shutdownTimeoutMilliseconds:10,killTimeoutMilliseconds:10}), child=f.session.connect().child;
  child.kill=()=>{child.kills++; return false;};
  await assert.rejects(f.session.dispose(),/did not confirm exit/);
  assert.equal(child.kills,1); assert.equal(child.exitCode,null);
  assert.equal(f.spawns.length,1); close(child,2);
});

test("a failed startup remains owned until its actual close event", async () => {
  const f=fixture(), child=f.session.connect().child;
  child.emit("error",Error("Controlled startup failure"));
  assert.equal(f.session.client,undefined);
  const closing=f.session.dispose(); let finished=false; closing.then(()=>finished=true);
  await new Promise(setImmediate); assert.equal(finished,false);
  close(child,2); await closing; assert.equal(f.spawns.length,1);
});

test("disposal before first use never starts a runtime", async () => {
  const f=fixture(); const first=f.session.dispose(); assert.strictEqual(f.session.dispose(),first);
  await first; assert.equal(f.spawns.length,0);
});
