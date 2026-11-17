"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),{spawn}=require("node:child_process");
const {CliWorkingSession}=require("../../extension/src/cli-client");
function owned(mode="normal"){
  const children=[];
  const session=new CliWorkingSession({entry:"C:/owned-fixture/jade-cli.exe",shutdownTimeoutMilliseconds:100,killTimeoutMilliseconds:1000,spawn:(_entry,args)=>{
    assert.deepEqual(args,["service","--stdio"]);
    const child=spawn(process.execPath,[path.join(__dirname,"fixtures/shutdown-child.cjs"),mode],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    children.push(child);return child;
  }});
  return {session,children};
}
async function cleanup(f){
  for(const child of f.children)if(child.exitCode===null&&child.signalCode===null){const closed=new Promise(resolve=>child.once("close",resolve));child.kill();await closed;}
}
test("real owned stdio child exits gracefully, repeated refresh does not accumulate clients, and replacement uses a new process",async t=>{
  const first=owned();t.after(()=>cleanup(first));
  for(let i=0;i<5;i++)await first.session.sourceCapabilities({schema:"ExampleSchema"});
  assert.equal(first.children.length,1);const old=first.children[0];
  await first.session.dispose();assert.equal(old.exitCode,0);assert.equal(first.session.ownedClients.size,0);
  const replacement=owned();t.after(()=>cleanup(replacement));await replacement.session.sourceCapabilities({schema:"ExampleSchema"});
  assert.notEqual(replacement.children[0].pid,old.pid);await replacement.session.dispose();assert.equal(replacement.children[0].exitCode,0);
});
test("real unresponsive owned child is settled by fallback while another owned test client remains running",async t=>{
  const stalled=owned("ignore-eof"),other=owned();t.after(()=>cleanup(stalled));t.after(()=>cleanup(other));
  await Promise.all([stalled.session.sourceCapabilities({}),other.session.sourceCapabilities({})]);
  await stalled.session.dispose();const child=stalled.children[0];assert.ok(child.exitCode!==null||child.signalCode!==null);assert.equal(stalled.session.ownedClients.size,0);
  assert.equal(other.children[0].exitCode,null);assert.equal(other.children[0].signalCode,null);
  assert.ok((await other.session.sourceCapabilities({})).sourceExtraction.pid);
  await other.session.dispose();assert.equal(other.children[0].exitCode,0);
});
