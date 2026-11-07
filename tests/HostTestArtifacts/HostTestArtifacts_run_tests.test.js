'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {HostTestArtifacts}=require('../../scripts/HostTestArtifacts.cjs');
function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jade-artifact-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,artifacts:new HostTestArtifacts({root,minimumFreeBytes:1024,freeBytes:()=>4096,waitMilliseconds:5,pollMilliseconds:1,...options})};
}
function brokerOwner(directory,record){
 const owner=path.join(directory,'broker/owner.json');fs.mkdirSync(path.dirname(owner),{recursive:true});fs.writeFileSync(owner,JSON.stringify(record));return owner;
}

test('a real closed child broker with the native zero-PID sentinel permits cleanup without probing PID zero or launching a CLI',async t=>{
 const {artifacts}=fixture(t,{isAlive:pid=>{assert.notEqual(pid,0);return false;},runNative:async()=>assert.fail('A stopped broker must not launch another CLI')});let stage;
 await artifacts.run(async directory=>{stage=directory;const owner=brokerOwner(directory,{brokerPID:123,nativePIDs:[]});
  const child=require('node:child_process').spawn(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],JSON.stringify({brokerPID:0,nativePIDs:[]}));",owner],{windowsHide:true});
  await artifacts.wait(child);
 });assert.equal(fs.existsSync(stage),false);
});

for(const brokerPID of [0,90])test('does not start a broker when brokerPID '+brokerPID+' is stopped but an owned native process is still alive',async t=>{
 let calls=0;const {artifacts}=fixture(t,{isAlive:pid=>{assert.notEqual(pid,0);return pid===91;},runNative:async()=>{calls++;}});let stage;
 await assert.rejects(artifacts.run(async directory=>{stage=directory;brokerOwner(directory,{brokerPID,nativePIDs:[91]});}),/still running/i);
 assert.equal(calls,0);assert.equal(fs.existsSync(stage),true);
});

test('waits for an orphaned native process to exit naturally without launching or killing a broker',async t=>{
 let probes=0;const {artifacts}=fixture(t,{isAlive:pid=>{assert.equal(pid,91);return ++probes<3;},runNative:async()=>assert.fail('No live broker exists')});let stage;
 await artifacts.run(async directory=>{stage=directory;brokerOwner(directory,{brokerPID:0,nativePIDs:[91]});});
 assert.ok(probes>=3);assert.equal(fs.existsSync(stage),false);
});

test('a stopped broker with already-exited native process IDs permits cleanup',async t=>{
 const {artifacts}=fixture(t,{isAlive:pid=>{assert.equal(pid,91);return false;},runNative:async()=>assert.fail('No live broker exists')});let stage;
 await artifacts.run(async directory=>{stage=directory;brokerOwner(directory,{brokerPID:0,nativePIDs:[91]});});assert.equal(fs.existsSync(stage),false);
});

for(const record of [{brokerPID:-1,nativePIDs:[]},{brokerPID:1.5,nativePIDs:[]},{brokerPID:0,nativePIDs:[0]},{brokerPID:0,nativePIDs:['91']},{brokerPID:0,nativePIDs:false}])test('rejects invalid broker process metadata '+JSON.stringify(record),async t=>{
 const {artifacts}=fixture(t,{isAlive:()=>assert.fail('Invalid metadata must not probe processes'),runNative:async()=>assert.fail('Invalid metadata must not execute a CLI')});let stage;
 await assert.rejects(artifacts.run(async directory=>{stage=directory;brokerOwner(directory,record);}),/process identity/i);assert.equal(fs.existsSync(stage),true);
});
for(const mode of ['closed','cancelled','timed out','startup error'])test('owned child lifecycle settles and cleans after '+mode,async t=>{
 const {artifacts}=fixture(t),child=new EventEmitter(),controller=new AbortController();let kills=0,stage;
 child.kill=()=>{kills++;queueMicrotask(()=>child.emit('close',1));return true;};
 const operation=artifacts.run(async directory=>{stage=directory;const waiting=artifacts.wait(child,{signal:controller.signal,timeoutMilliseconds:mode==='timed out'?2:1000});
  if(mode==='closed')queueMicrotask(()=>child.emit('close',0));if(mode==='cancelled')controller.abort();if(mode==='startup error')queueMicrotask(()=>child.emit('error',Error('startup error')));await waiting;
 });
 if(mode==='closed')await operation;else await assert.rejects(operation,new RegExp(mode));assert.equal(fs.existsSync(stage),false);assert.equal(kills,mode==='closed'?0:1);
});
for(const outcome of ['success','failure','cancellation'])test('removes its owned stage exactly once after '+outcome,async t=>{
 const {root,artifacts}=fixture(t);let stage;
 const operation=artifacts.run(async directory=>{stage=directory;fs.writeFileSync(path.join(directory,'small.txt'),'disposable');if(outcome!=='success')throw Error(outcome);return 42;});
 if(outcome==='success')assert.equal(await operation,42);else await assert.rejects(operation,new RegExp(outcome));
 assert.equal(fs.existsSync(stage),false);await artifacts.cleanup();assert.deepEqual(fs.readdirSync(root),[]);
});
test('rejects insufficient free disk before creating or copying any artifacts',async t=>{
 const {root,artifacts}=fixture(t,{freeBytes:()=>1023});let copied=false;
 await assert.rejects(artifacts.run(async()=>{copied=true;}),/free disk/i);assert.equal(copied,false);assert.deepEqual(fs.readdirSync(root),[]);
});
test('waits for its owned process close and never deletes a live process stage',async t=>{
 const {artifacts}=fixture(t,{isAlive:()=>true});const child=new EventEmitter();child.pid=42;child.kill=()=>true;let stage;
 await assert.rejects(artifacts.run(async directory=>{stage=directory;artifacts.track(child);}),/still running/i);assert.equal(fs.existsSync(stage),true);
});
test('a closed child and graceful owned broker shutdown permit cleanup',async t=>{
 let alive=true,calls=0;const {artifacts}=fixture(t,{isAlive:()=>alive,runNative:async(executable,args,env)=>{calls++;assert.deepEqual(args,['shutdown','--json']);assert.ok(env.JADE_TOOLS_STATE_DIRECTORY.endsWith(path.sep+'broker'));alive=false;}});
 let stage;await artifacts.run(async directory=>{stage=directory;const cli=path.join(directory,'extension/vendor/jade-tools-cli/jade-cli.exe');fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'fixture, never executed');artifacts.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(cli)).digest('hex');fs.mkdirSync(path.join(directory,'broker'));fs.writeFileSync(path.join(directory,'broker/owner.json'),JSON.stringify({brokerPID:90,nativePIDs:[91]}));const child=new EventEmitter();artifacts.track(child);child.emit('close',0);});
 assert.equal(calls,1);assert.equal(fs.existsSync(stage),false);
});
test('a surviving native process blocks deletion after attempted graceful shutdown',async t=>{
 const {artifacts}=fixture(t,{isAlive:()=>true,runNative:async()=>{}});let stage;
 await assert.rejects(artifacts.run(async directory=>{stage=directory;const cli=path.join(directory,'extension/vendor/jade-tools-cli/jade-cli.exe');fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'fixture');artifacts.nativeSha256=crypto.createHash('sha256').update(fs.readFileSync(cli)).digest('hex');fs.mkdirSync(path.join(directory,'broker'));fs.writeFileSync(path.join(directory,'broker/owner.json'),JSON.stringify({brokerPID:90,nativePIDs:[91]}));}),/still running/i);assert.equal(fs.existsSync(stage),true);
});
test('refuses cleanup when its ownership marker changes',async t=>{
 const {artifacts}=fixture(t);let stage;await assert.rejects(artifacts.run(async directory=>{stage=directory;fs.writeFileSync(path.join(directory,'.jade-host-owner'),'foreign');}),/ownership/i);assert.equal(fs.existsSync(stage),true);
});
test('refuses a symlink replacing its private stage rather than traversing the target',async t=>{
 const {root,artifacts}=fixture(t),foreign=path.join(root,'foreign');fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'keep.txt'),'keep');
 await assert.rejects(artifacts.run(async stage=>{fs.rmSync(stage,{recursive:true});fs.symlinkSync(foreign,stage,process.platform==='win32'?'junction':'dir');}),/containment|symbolic/i);assert.equal(fs.readFileSync(path.join(foreign,'keep.txt'),'utf8'),'keep');
});
test('retains the original failure when cleanup also fails',async t=>{
 const {artifacts}=fixture(t);await assert.rejects(artifacts.run(async stage=>{fs.writeFileSync(path.join(stage,'.jade-host-owner'),'foreign');throw Error('original test failed');}),error=>error instanceof AggregateError&&error.errors.some(item=>item.message==='original test failed')&&error.errors.some(item=>/ownership/i.test(item.message)));
});
test('preserves a compact failed report outside Temp stage before cleanup',async t=>{
 const {root,artifacts}=fixture(t);artifacts.evidencePath=path.join(root,'evidence/report.json');let stage;
 await assert.rejects(artifacts.run(async directory=>{stage=directory;fs.writeFileSync(path.join(directory,'host-report.json'),JSON.stringify({passed:false,error:'native failed'}));throw Error('host exited');}),/host exited/);
 assert.equal(fs.existsSync(stage),false);assert.deepEqual(JSON.parse(fs.readFileSync(artifacts.evidencePath,'utf8')),{passed:false,error:'native failed'});
});
test('an oversized report is not retained, but closed disposable artifacts are still removed',async t=>{
 const {root,artifacts}=fixture(t);artifacts.evidencePath=path.join(root,'evidence/report.json');let stage;
 await assert.rejects(artifacts.run(async directory=>{stage=directory;fs.writeFileSync(path.join(directory,'host-report.json'),Buffer.alloc(262145));}),/evidence limit/i);
 assert.equal(fs.existsSync(stage),false);assert.equal(fs.existsSync(artifacts.evidencePath),false);
});
