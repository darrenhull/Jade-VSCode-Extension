'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {CliWorkingSession}=require('../../extension/src/cli-client');
const {JadeWorkspaceRunner}=require('../../extension/src/JadeWorkspaceRunner');
const descriptor={format:1,configuration:'workingJadeGitPolicy',values:['inherit','disabled'],default:'inherit',scope:'owned-working-only',reversible:true};
function fixture(capability){
 const requests=[],child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>{};
 child.stdin.write=text=>{const packet=JSON.parse(text);requests.push(packet);const result=packet.command==='doctor'?{passed:true,code:0,capabilities:capability?{workingJadeGitPolicy:capability}:{}}:{passed:true,code:0,report:{executed:true},working:{root:'C:/owned/working',iniPath:'C:/owned/working/working.ini'},config:{...packet.config,selection:packet.target}};queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({id:packet.id,event:'result',result})+'\n')));};
 return {requests,session:new CliWorkingSession({entry:'fixture-cli.exe',spawn:()=>child})};
}
const config={workingJadeGitPolicy:'disabled',iniPath:'C:/original/source.ini',databasePath:'C:/original/system',username:'fixture-user',password:'fixture-password'};
test('unchecked inherit keeps older-CLI requests unchanged without doctor or a policy field',async()=>{
 const f=fixture();try{assert.equal((await f.session.startWorking({...config,workingJadeGitPolicy:'inherit'},'compile').completion).passed,true);assert.deepEqual(f.requests.map(r=>r.command),['build']);assert.equal(Object.hasOwn(f.requests[0].config,'workingJadeGitPolicy'),false);}finally{f.session.dispose();}
});
for(const capability of [undefined,{...descriptor,format:2},{...descriptor,reversible:false},{...descriptor,scope:'source'},{...descriptor,values:['disabled']}])test('unsupported capability refuses Working before launch: '+JSON.stringify(capability),async()=>{
 const f=fixture(capability);try{const result=await f.session.startWorking(config,'test.run').completion;assert.equal(result.passed,false);assert.match(result.report.error,/update.*Jade|Jade.*update/i);assert.deepEqual(f.requests.map(r=>r.command),['doctor']);assert.equal(Object.hasOwn(f.requests[0].config,'workingJadeGitPolicy'),false);}finally{f.session.dispose();}
});
test('advertised Working-only opt-out is checked then forwarded with credentials and original INI intact',async()=>{
 const f=fixture(descriptor);try{assert.equal((await f.session.startWorking(config,'test.run').completion).passed,true);assert.deepEqual(f.requests.map(r=>r.command),['doctor','test']);assert.deepEqual(f.requests[1].config,config);assert.equal(Object.hasOwn(f.requests[0].config,'workingJadeGitPolicy'),false);}finally{f.session.dispose();}
});
test('Working preparation and inspection reject an older CLI before either target operation',async()=>{
 const f=fixture();try{await assert.rejects(f.session.prepareWorking(config),/update/i);await assert.rejects(f.session.inspectionTarget(config,'working'),/update/i);assert.ok(f.requests.every(r=>r.command==='doctor'));}finally{f.session.dispose();}
});
test('Source inspection retains the Source INI and credentials without applying the Working opt-out',async()=>{
 const f=fixture();try{const result=await f.session.inspectionTarget(config,'source');assert.equal(result.iniPath,config.iniPath);assert.equal(result.password,config.password);assert.equal(Object.hasOwn(f.requests[0].config,'workingJadeGitPolicy'),false);assert.deepEqual(f.requests.map(r=>r.command),['inspect.target']);assert.equal(config.workingJadeGitPolicy,'disabled');}finally{f.session.dispose();}
});
test('Source metadata and capability requests omit the Working-only policy without mutating caller configuration',async()=>{
 const f=fixture();try{await f.session.sourceCapabilities(config);await f.session.request('source.index.prepare',{config}).promise;assert.ok(f.requests.every(r=>!Object.hasOwn(r.config,'workingJadeGitPolicy')));assert.equal(config.iniPath,'C:/original/source.ini');assert.equal(config.workingJadeGitPolicy,'disabled');}finally{f.session.dispose();}
});
test('Scratch cannot start source preparation or execution when the CLI lacks the opt-out capability',async()=>{
 const f=fixture();let prepared=0;const runner=new JadeWorkspaceRunner({client:f.session,configFor:async()=>({...config,schema:'Pets'}),prepareSource:async()=>prepared++});
 try{const result=await runner.run({document:{version:1,uri:{toString:()=> 'untitled:policy.jade'},getText:()=> 'begin\n write 1;\nend;'}});assert.equal(result.passed,false);assert.match(result.report.error,/update/i);assert.equal(prepared,0);assert.deepEqual(f.requests.map(r=>r.command),['doctor']);}finally{f.session.dispose();}
});

test('stop during capability validation never launches Working after the capability reply',async()=>{
 const f=fixture(descriptor);try{const operation=f.session.startWorking(config,'compile');operation.stop();const result=await operation.completion;assert.equal(result.code,130);assert.equal(result.cancelled,true);assert.deepEqual(f.requests.map(r=>r.command),['doctor']);}finally{f.session.dispose();}
});
test('supported Scratch preserves the exact unsaved snapshot after capability validation',async()=>{
 const f=fixture(descriptor),text='begin\n write 42;\nend;',runner=new JadeWorkspaceRunner({client:f.session,configFor:async()=>({...config,schema:'Pets'})});
 try{assert.equal((await runner.run({document:{version:1,uri:{toString:()=> 'untitled:policy.jade'},getText:()=>text}})).passed,true);assert.deepEqual(f.requests.map(r=>r.command),['doctor','workspace.run']);assert.equal(f.requests[1].sourceText,text);assert.equal(f.requests[1].config.workingJadeGitPolicy,'disabled');}finally{f.session.dispose();}
});
test('external Working utility dispatch also rejects an unsupported opt-out before native.run',async()=>{
 const f=fixture();try{await assert.rejects(f.session.runNative('C:/fixture/bin/jadloadb.exe',[],config),/update/i);assert.deepEqual(f.requests.map(r=>r.command),['doctor']);}finally{f.session.dispose();}
});
