'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client');
const {JadeWorkspaceRunner}=require('../../extension/src/JadeWorkspaceRunner');
const descriptor={format:1,configuration:'workingJadeGitPolicy',values:['inherit','disabled'],default:'inherit',scope:'owned-working-only',reversible:true};
const config={workingJadeGitPolicy:'disabled',iniPath:'C:/source/jade.ini',schema:'Pets'};
function fixture(doctor=()=>({passed:true,code:0,capabilities:{workingJadeGitPolicy:descriptor}})){
 const packets=[],children=[];
 const session=new CliWorkingSession({entry:'fixture-cli.exe',spawn:()=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>{};children.push(child);
  child.stdin.write=text=>{const packet=JSON.parse(text);packets.push({...packet,connection:children.indexOf(child)});let closeAfter=false;
   let result;if(packet.command==='doctor'){const outcome=doctor(packet,children.indexOf(child));result=outcome.result||outcome;closeAfter=outcome.closeAfter===true;}else result={passed:true,success:true,code:0,working:{root:'C:/working'},config:{selection:packet.target},report:{executed:true}};
   queueMicrotask(()=>{child.stdout.emit('data',Buffer.from(JSON.stringify({id:packet.id,event:'result',result})+'\n'));if(closeAfter)child.emit('close',0);});
  };return child;
 }});
 return {session,packets,children,doctors:()=>packets.filter(p=>p.command==='doctor')};
}
test('one live descriptor serves repeated Working endpoints and every operation still executes',async()=>{
 const f=fixture();try{
  await f.session.startWorking(config,'test.run').completion;await f.session.prepareWorking(config);await f.session.runNative('C:/Jade/bin/jadloadb.exe',[],config);await f.session.startWorking({...config,schema:'Other'},'test.run').completion;
  const runner=new JadeWorkspaceRunner({client:f.session,configFor:async()=>({...config})});assert.equal((await runner.run({document:{version:1,uri:{toString:()=> 'untitled:policy.jade'},getText:()=> 'begin\nwrite 1;\nend;'}})).passed,true);
  assert.equal(f.doctors().length,1,'Repeated Working operations repeated the static doctor probe');assert.deepEqual(f.packets.filter(p=>p.command!=='doctor').map(p=>p.command),['test','working.prepare','native.run','test','workspace.run']);
 }finally{f.session.dispose();}
});
test('concurrent Working requests share the pending descriptor probe',async()=>{
 const f=fixture();try{await Promise.all([f.session.startWorking(config,'test.run').completion,f.session.prepareWorking(config),f.session.inspectionTarget(config,'working')]);assert.equal(f.doctors().length,1,'Concurrent operations issued duplicate probes');assert.equal(f.packets.filter(p=>p.command!=='doctor').length,3);}finally{f.session.dispose();}
});
test('an existing doctor result supplies only the static descriptor; Source capabilities remain fresh',async()=>{
 let serial=0;const f=fixture(packet=>({passed:true,code:0,capabilities:{workingJadeGitPolicy:descriptor,sourceExtraction:{serial:++serial,iniPath:packet.config.iniPath}}}));
 try{const first=await f.session.sourceCapabilities(config);assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);assert.equal(f.doctors().length,1,'Working ignored the existing doctor descriptor');const next=await f.session.sourceCapabilities({...config,iniPath:'C:/other/source.ini'});assert.equal(next.sourceExtraction.serial,2);assert.notEqual(first.sourceExtraction.iniPath,next.sourceExtraction.iniPath);assert.equal(f.doctors().length,2);assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);assert.equal(f.doctors().length,2);}finally{f.session.dispose();}
});
test('a reconnect probes the new CLI and cannot reuse support from the previous process',async()=>{
 const f=fixture((_packet,index)=>({passed:true,code:0,capabilities:index===0?{workingJadeGitPolicy:descriptor}:{}}));
 try{assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);f.children[0].emit('close',0);const next=await f.session.startWorking(config,'test.run').completion;assert.equal(next.passed,false);assert.match(next.report.error,/update/i);assert.equal(f.children.length,2);assert.equal(f.doctors().length,2);assert.equal(f.packets.filter(p=>p.command==='test').length,1);}finally{f.session.dispose();}
});
test('failed doctor probes retry on the same connection without caching rejection',async()=>{
 let attempts=0;const f=fixture(()=>++attempts===1?{passed:false,code:2,report:{error:'Controlled doctor failure'}}:{passed:true,code:0,capabilities:{workingJadeGitPolicy:descriptor}});
 try{const first=await f.session.startWorking(config,'test.run').completion;assert.equal(first.passed,false);assert.match(first.report.error,/Controlled doctor failure/);assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);assert.equal(f.children.length,1);assert.equal(f.doctors().length,2);assert.equal(f.packets.filter(p=>p.command==='test').length,1);}finally{f.session.dispose();}
});
test('a connection lost after its doctor reply cannot authorize a new Working process',async()=>{
 const f=fixture(()=>({result:{passed:true,code:0,capabilities:{workingJadeGitPolicy:descriptor}},closeAfter:true}));
 try{const result=await f.session.startWorking(config,'test.run').completion;assert.equal(result.passed,false);assert.match(result.report.error,/connection.*closed|connection.*changed/i);assert.ok(f.packets.every(p=>p.command==='doctor'),'Working started after the descriptor owner exited');}finally{f.session.dispose();}
});
test('unsupported old CLI results stay rejected without repeating static probes',async()=>{
 const f=fixture(()=>({passed:true,code:0,capabilities:{}}));try{for(let i=0;i<2;i++)assert.equal((await f.session.startWorking(config,'test.run').completion).passed,false);assert.equal(f.doctors().length,1);assert.ok(f.packets.every(p=>p.command==='doctor'));}finally{f.session.dispose();}
});

test('Source callers cannot mutate the retained static descriptor through their doctor result',async()=>{
 const f=fixture();try{const caps=await f.session.sourceCapabilities(config);caps.workingJadeGitPolicy.scope='source';caps.workingJadeGitPolicy.values.length=0;assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);assert.equal(f.doctors().length,1);}finally{f.session.dispose();}
});
